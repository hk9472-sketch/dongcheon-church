import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import { balanceLock } from "@/lib/accYear";

/**
 * GET /api/accounting/balance?unitId=1&year=2026
 * 이월잔액 조회
 */
export async function GET(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const unitIdStr = searchParams.get("unitId");
  const yearStr = searchParams.get("year");

  if (!unitIdStr || !yearStr) {
    return NextResponse.json(
      { error: "unitId와 year는 필수입니다." },
      { status: 400 }
    );
  }

  const unitId = parseInt(unitIdStr, 10);
  const year = parseInt(yearStr, 10);

  const [balance, funds] = await Promise.all([
    prisma.accBalance.findUnique({ where: { unitId_year: { unitId, year } } }),
    prisma.accFund.findMany({
      where: { unitId },
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
      include: { balances: { where: { year } } },
    }),
  ]);

  return NextResponse.json({
    ...(balance || { unitId, year, amount: 0 }),
    exists: !!balance,
    // 통장별 연초잔액 — 합계가 단위 이월잔액(amount)과 같게 유지된다
    funds: funds.map((f) => ({
      fundId: f.id,
      name: f.name,
      kind: f.kind,
      isDefault: f.isDefault,
      isActive: f.isActive,
      amount: f.balances[0]?.amount ?? 0,
    })),
  });
}

/**
 * POST /api/accounting/balance
 * 이월잔액 설정/수정
 */
export async function POST(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json();
  const { unitId, year } = body;
  let { amount } = body;
  // funds: [{ fundId, amount }] — 통장별 연초잔액. 주어지면 단위 이월잔액 = 합계.
  const fundRows: Array<{ fundId: number; amount: number }> | null = Array.isArray(body.funds)
    ? body.funds
    : null;

  if (fundRows) {
    if (fundRows.some((f) => !Number.isInteger(f.fundId) || !Number.isInteger(f.amount))) {
      return NextResponse.json({ error: "통장별 금액이 올바르지 않습니다." }, { status: 400 });
    }
    amount = fundRows.reduce((s, f) => s + f.amount, 0);
  }

  if (!unitId || !year || amount === undefined) {
    return NextResponse.json(
      { error: "unitId, year, amount는 필수입니다." },
      { status: 400 }
    );
  }

  if (typeof amount !== "number") {
    return NextResponse.json(
      { error: "amount는 숫자여야 합니다." },
      { status: 400 }
    );
  }

  if (fundRows && fundRows.length > 0) {
    const owned = await prisma.accFund.count({
      where: { id: { in: fundRows.map((f) => f.fundId) }, unitId },
    });
    if (owned !== fundRows.length) {
      return NextResponse.json({ error: "다른 회계단위의 통장이 포함되어 있습니다." }, { status: 400 });
    }
  }

  // 회계단위 존재 확인
  const unit = await prisma.accUnit.findUnique({ where: { id: unitId } });
  if (!unit) {
    return NextResponse.json(
      { error: "회계단위를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // 전년도 연마감으로 생성됐거나 해당 연도가 마감된 이월금은 수정 불가
  const lock = await balanceLock(unitId, year);
  if (lock) {
    return NextResponse.json({ error: lock }, { status: 409 });
  }

  // balance 갱신 + 해당 연도의 마감된 월들 carryOver 재전파
  // (연초 잔액이 변경되면 모든 후속 마감의 이월잔액이 stale 해지므로)
  const balance = await prisma.$transaction(async (tx) => {
    const updated = await tx.accBalance.upsert({
      where: { unitId_year: { unitId, year } },
      create: { unitId, year, amount, source: "manual" },
      update: { amount, source: "manual" },
    });

    if (fundRows) {
      for (const f of fundRows) {
        await tx.accFundBalance.upsert({
          where: { fundId_year: { fundId: f.fundId, year } },
          create: { fundId: f.fundId, year, amount: f.amount },
          update: { amount: f.amount },
        });
      }
    }

    // 해당 연도의 연속 마감된 월들 carryOver 체인 재계산
    // (month=1 부터 첫 미마감 전까지)
    const closings = await tx.accClosing.findMany({
      where: { unitId, year, closedAt: { not: null } },
      orderBy: { month: "asc" },
    });

    let carryOver = amount;
    for (const c of closings) {
      // 순서 깨짐 방지: 연속된 월인지 체크 (1,2,3,... )
      const expected = c.month;
      const prevMonth = closings.find((x) => x.month === expected - 1);
      if (expected > 1 && !prevMonth) break; // 체인 깨짐 → 중단
      if (c.carryOver !== carryOver) {
        await tx.accClosing.update({
          where: { unitId_year_month: { unitId, year, month: c.month } },
          data: { carryOver },
        });
      }
      carryOver += c.totalIncome - c.totalExpense;
    }

    return updated;
  });

  return NextResponse.json(balance);
}
