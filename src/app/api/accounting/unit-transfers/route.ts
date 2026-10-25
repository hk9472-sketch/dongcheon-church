import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import { isMonthClosed, toDateOnly, toNextDay } from "@/lib/accFund";

/**
 * 회계 간 대체 (대여 / 상환 / 지원)
 *
 * GET  /api/accounting/unit-transfers?year=2026  → 해당 연도 목록 + 회계 간 미상환 잔액(전 기간)
 * POST /api/accounting/unit-transfers            → { date, kind, fromFundId, toFundId, amount, description }
 *      보낸 회계: '타회계대체출금'(C) 전표, 받은 회계: '타회계대체입금'(D) 전표를 한 트랜잭션으로 생성
 * DELETE /api/accounting/unit-transfers?id=1     → 두 전표와 함께 삭제
 */

const KINDS = ["대여", "상환", "지원"];
const TRANSFER_ACC = {
  D: { code: "1099", name: "타회계대체입금" },
  C: { code: "2099", name: "타회계대체출금" },
} as const;

/** 회계단위의 대체 전용 계정 (없으면 생성) */
async function transferAccount(tx: Prisma.TransactionClient, unitId: number, type: "D" | "C"): Promise<number> {
  const found = await tx.accAccount.findFirst({ where: { unitId, type, isTransfer: true }, select: { id: true } });
  if (found) return found.id;
  const def = TRANSFER_ACC[type];
  const clash = await tx.accAccount.findUnique({ where: { unitId_code: { unitId, code: def.code } } });
  const created = await tx.accAccount.create({
    data: {
      unitId,
      code: clash ? `${def.code}T` : def.code,
      name: def.name,
      type,
      level: 1,
      sortOrder: 999,
      isTransfer: true,
      description: "회계 간 대체 전용 (자동 생성 — 직접 입력에 쓰지 않음)",
    },
  });
  return created.id;
}

async function nextVoucherNo(tx: Prisma.TransactionClient, unitId: number, date: Date): Promise<string> {
  const ds = date.toISOString().slice(0, 10).replace(/-/g, "");
  const last = await tx.accVoucher.findFirst({
    where: { unitId, voucherNo: { startsWith: ds } },
    orderBy: { voucherNo: "desc" },
    select: { voucherNo: true },
  });
  const seq = last ? parseInt(last.voucherNo.split("-")[1], 10) + 1 : 1;
  return `${ds}-${String(seq).padStart(3, "0")}`;
}

export async function GET(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const year = parseInt(new URL(request.url).searchParams.get("year") || "", 10);
  if (!year) return NextResponse.json({ error: "year는 필수입니다." }, { status: 400 });

  const [units, funds, list, all] = await Promise.all([
    prisma.accUnit.findMany({ select: { id: true, name: true } }),
    prisma.accFund.findMany({ select: { id: true, name: true } }),
    prisma.accUnitTransfer.findMany({
      where: { date: { gte: toDateOnly(`${year}-01-01`), lt: toNextDay(`${year}-12-31`) } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    }),
    prisma.accUnitTransfer.findMany({ where: { kind: { in: ["대여", "상환"] } } }),
  ]);
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const fundName = new Map(funds.map((f) => [f.id, f.name]));

  // 미상환 잔액: (빌려준 회계 → 빌린 회계) 기준. 대여는 +, 상환(빌린 쪽 → 빌려준 쪽)은 −
  const owed = new Map<string, number>();
  for (const t of all) {
    const [lender, borrower] = t.kind === "대여" ? [t.fromUnitId, t.toUnitId] : [t.toUnitId, t.fromUnitId];
    const k = `${lender}>${borrower}`;
    owed.set(k, (owed.get(k) ?? 0) + (t.kind === "대여" ? t.amount : -t.amount));
  }
  const loans = Array.from(owed.entries())
    .filter(([, v]) => v !== 0)
    .map(([k, amount]) => {
      const [lender, borrower] = k.split(">").map(Number);
      return { lender: unitName.get(lender) ?? "?", borrower: unitName.get(borrower) ?? "?", amount };
    });

  return NextResponse.json({
    year,
    loans,
    transfers: list.map((t) => ({
      id: t.id,
      date: t.date.toISOString().slice(0, 10),
      kind: t.kind,
      fromUnit: unitName.get(t.fromUnitId) ?? "?",
      fromFund: fundName.get(t.fromFundId) ?? "?",
      toUnit: unitName.get(t.toUnitId) ?? "?",
      toFund: fundName.get(t.toFundId) ?? "?",
      amount: t.amount,
      description: t.description,
      createdBy: t.createdBy,
    })),
  });
}

export async function POST(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const body = await request.json().catch(() => ({}));
  const dateStr = String(body.date || "");
  const kind = String(body.kind || "");
  const fromFundId = Number(body.fromFundId);
  const toFundId = Number(body.toFundId);
  const amount = Number(body.amount);
  const description = String(body.description ?? "").trim().slice(0, 200) || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !KINDS.includes(kind) || !fromFundId || !toFundId) {
    return NextResponse.json({ error: "일자, 구분(대여/상환/지원), 보내는·받는 통장은 필수입니다." }, { status: 400 });
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "금액은 0보다 커야 합니다." }, { status: 400 });
  }
  const [from, to] = await Promise.all([
    prisma.accFund.findUnique({ where: { id: fromFundId }, include: { unit: true } }),
    prisma.accFund.findUnique({ where: { id: toFundId }, include: { unit: true } }),
  ]);
  if (!from || !to) return NextResponse.json({ error: "통장을 찾을 수 없습니다." }, { status: 404 });
  if (from.unitId === to.unitId) {
    return NextResponse.json(
      { error: "같은 회계단위 안의 이동은 [통장현황·이체]에서 이체로 처리하세요." },
      { status: 400 },
    );
  }

  const date = toDateOnly(dateStr);
  for (const f of [from, to]) {
    if (await isMonthClosed(f.unitId, date)) {
      return NextResponse.json({ error: `${f.unit.name}: 해당 월이 마감되었습니다.` }, { status: 409 });
    }
  }

  const createdBy = access.user?.name ?? String(access.userId ?? "");
  const memo = `${kind} — ${from.unit.name} → ${to.unit.name}${description ? ` · ${description}` : ""}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const outAcc = await transferAccount(tx, from.unitId, "C");
        const inAcc = await transferAccount(tx, to.unitId, "D");
        const outV = await tx.accVoucher.create({
          data: {
            unitId: from.unitId,
            voucherNo: await nextVoucherNo(tx, from.unitId, date),
            type: "C",
            date,
            description: memo,
            totalAmount: amount,
            fundId: from.id,
            createdBy,
            items: {
              create: [{ seq: 1, accountId: outAcc, amount, description: memo, counterpart: to.unit.name }],
            },
          },
        });
        const inV = await tx.accVoucher.create({
          data: {
            unitId: to.unitId,
            voucherNo: await nextVoucherNo(tx, to.unitId, date),
            type: "D",
            date,
            description: memo,
            totalAmount: amount,
            fundId: to.id,
            createdBy,
            items: {
              create: [{ seq: 1, accountId: inAcc, amount, description: memo, counterpart: from.unit.name }],
            },
          },
        });
        return tx.accUnitTransfer.create({
          data: {
            date,
            kind,
            fromUnitId: from.unitId,
            fromFundId: from.id,
            toUnitId: to.unitId,
            toFundId: to.id,
            amount,
            description,
            fromVoucherId: outV.id,
            toVoucherId: inV.id,
            createdBy,
          },
        });
      });
      return NextResponse.json(created, { status: 201 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      console.error("[unit-transfers] 저장 실패:", e);
      return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "전표번호 경합 — 다시 시도하세요." }, { status: 503 });
}

export async function DELETE(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const id = parseInt(new URL(request.url).searchParams.get("id") || "", 10);
  const t = id ? await prisma.accUnitTransfer.findUnique({ where: { id } }) : null;
  if (!t) return NextResponse.json({ error: "대체 내역을 찾을 수 없습니다." }, { status: 404 });
  for (const unitId of [t.fromUnitId, t.toUnitId]) {
    if (await isMonthClosed(unitId, t.date)) {
      return NextResponse.json({ error: "마감된 월의 대체는 삭제할 수 없습니다." }, { status: 409 });
    }
  }
  await prisma.$transaction([
    prisma.accUnitTransfer.delete({ where: { id } }),
    prisma.accVoucher.deleteMany({ where: { id: { in: [t.fromVoucherId, t.toVoucherId] } } }),
  ]);
  return NextResponse.json({ success: true });
}
