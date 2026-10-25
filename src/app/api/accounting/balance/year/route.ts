import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import { balanceLock } from "@/lib/accYear";

/**
 * GET /api/accounting/balance/year?year=2026
 * 연도별 이월금 — 전체 회계단위 × 통장. 잠금 여부(전년도 연마감 생성 / 해당 연도 마감) 포함.
 */
export async function GET(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const year = parseInt(new URL(request.url).searchParams.get("year") || "", 10);
  if (!year) return NextResponse.json({ error: "year는 필수입니다." }, { status: 400 });

  const units = await prisma.accUnit.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      balances: { where: { year } },
      funds: {
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
        include: { balances: { where: { year } } },
      },
    },
  });

  const out = [];
  for (const u of units) {
    const b = u.balances[0];
    out.push({
      unitId: u.id,
      name: u.name,
      exists: !!b,
      amount: b?.amount ?? 0,
      source: b?.source ?? null,
      lock: await balanceLock(u.id, year),
      funds: u.funds
        .filter((f) => f.isActive || (f.balances[0]?.amount ?? 0) !== 0)
        .map((f) => ({
          fundId: f.id,
          name: f.name,
          kind: f.kind,
          isDefault: f.isDefault,
          amount: f.balances[0]?.amount ?? 0,
        })),
    });
  }
  return NextResponse.json({ year, units: out });
}

/**
 * POST /api/accounting/balance/year
 * body: { year, units: [{ unitId, funds?: [{fundId, amount}], amount? }] }
 * 잠기지 않은 단위만 저장 (통장이 있으면 단위 이월금 = 통장 합계). source=manual.
 */
export async function POST(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const body = await request.json().catch(() => ({}));
  const year = Number(body.year);
  const units: Array<{ unitId: number; amount?: number; funds?: Array<{ fundId: number; amount: number }> }> =
    Array.isArray(body.units) ? body.units : [];
  if (!year || units.length === 0) {
    return NextResponse.json({ error: "연도와 이월금 데이터가 필요합니다." }, { status: 400 });
  }

  const saved: number[] = [];
  const skipped: { unitId: number; reason: string }[] = [];
  for (const u of units) {
    const unitId = Number(u.unitId);
    const lock = await balanceLock(unitId, year);
    if (lock) {
      skipped.push({ unitId, reason: lock });
      continue;
    }
    const funds = Array.isArray(u.funds) ? u.funds : [];
    if (funds.some((f) => !Number.isInteger(f.fundId) || !Number.isInteger(f.amount))) {
      skipped.push({ unitId, reason: "금액 형식 오류" });
      continue;
    }
    if (funds.length > 0) {
      const owned = await prisma.accFund.count({ where: { id: { in: funds.map((f) => f.fundId) }, unitId } });
      if (owned !== funds.length) {
        skipped.push({ unitId, reason: "다른 회계단위의 통장 포함" });
        continue;
      }
    }
    const amount = funds.length > 0 ? funds.reduce((s, f) => s + f.amount, 0) : Number(u.amount) || 0;

    await prisma.$transaction(async (tx) => {
      for (const f of funds) {
        await tx.accFundBalance.upsert({
          where: { fundId_year: { fundId: f.fundId, year } },
          create: { fundId: f.fundId, year, amount: f.amount },
          update: { amount: f.amount },
        });
      }
      await tx.accBalance.upsert({
        where: { unitId_year: { unitId, year } },
        create: { unitId, year, amount, source: "manual" },
        update: { amount, source: "manual" },
      });
      // 해당 연도 마감된 월(개별 월마감)의 이월 체인 재계산
      const closings = await tx.accClosing.findMany({
        where: { unitId, year, closedAt: { not: null } },
        orderBy: { month: "asc" },
      });
      let carry = amount;
      for (const c of closings) {
        if (c.month > 1 && !closings.some((x) => x.month === c.month - 1)) break;
        if (c.carryOver !== carry) {
          await tx.accClosing.update({ where: { id: c.id }, data: { carryOver: carry } });
        }
        carry += c.totalIncome - c.totalExpense;
      }
    });
    saved.push(unitId);
  }
  return NextResponse.json({ saved, skipped });
}
