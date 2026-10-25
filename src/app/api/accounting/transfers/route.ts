import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import { isMonthClosed, toDateOnly, toNextDay } from "@/lib/accFund";

/**
 * GET /api/accounting/transfers?unitId=1&dateFrom=2026-01-01&dateTo=2026-12-31
 * 통장 간 이체 목록
 */
export async function GET(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const sp = new URL(request.url).searchParams;
  const unitId = parseInt(sp.get("unitId") || "", 10);
  if (!unitId) return NextResponse.json({ error: "unitId는 필수입니다." }, { status: 400 });
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");

  const transfers = await prisma.accTransfer.findMany({
    where: {
      unitId,
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: toDateOnly(dateFrom) } : {}),
              ...(dateTo ? { lt: toNextDay(dateTo) } : {}),
            },
          }
        : {}),
    },
    include: {
      fromFund: { select: { id: true, name: true } },
      toFund: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });

  return NextResponse.json(transfers);
}

/**
 * POST /api/accounting/transfers
 * body: { unitId, date, fromFundId, toFundId, amount, description }
 * 같은 회계단위 안의 두 통장 사이 이체. 수입/지출 아님.
 */
export async function POST(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => ({}));
  const unitId = Number(body.unitId);
  const fromFundId = Number(body.fromFundId);
  const toFundId = Number(body.toFundId);
  const amount = Number(body.amount);
  const dateStr = String(body.date || "");

  if (!unitId || !fromFundId || !toFundId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: "회계단위, 일자, 출금·입금 통장은 필수입니다." }, { status: 400 });
  }
  if (fromFundId === toFundId) {
    return NextResponse.json({ error: "출금 통장과 입금 통장이 같습니다." }, { status: 400 });
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "금액은 0보다 커야 합니다." }, { status: 400 });
  }

  const funds = await prisma.accFund.findMany({
    where: { id: { in: [fromFundId, toFundId] } },
    select: { id: true, unitId: true },
  });
  if (funds.length !== 2 || funds.some((f) => f.unitId !== unitId)) {
    return NextResponse.json(
      { error: "두 통장 모두 같은 회계단위에 속해야 합니다. (다른 회계로 보내는 돈은 [회계 간 대체]에서 처리)" },
      { status: 400 },
    );
  }

  const date = toDateOnly(dateStr);
  if (await isMonthClosed(unitId, date)) {
    return NextResponse.json({ error: "마감된 월에는 이체를 등록할 수 없습니다." }, { status: 409 });
  }

  const created = await prisma.accTransfer.create({
    data: {
      unitId,
      date,
      fromFundId,
      toFundId,
      amount,
      description: String(body.description ?? "").trim().slice(0, 200) || null,
      createdBy: access.user?.name ?? String(access.userId ?? ""),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
