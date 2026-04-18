import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

/**
 * 날짜 문자열(YYYY-MM-DD)을 UTC 자정 Date로 변환
 * @db.Date 컬럼은 날짜만 저장하므로 UTC 자정 기준으로 맞춘다
 */
function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

/**
 * GET /api/accounting/closing?unitId=1&year=2026[&view=overview]
 *   - 기본: 마감 레코드 배열만 반환
 *   - view=overview: 12개월 전체(미마감 포함) 수입/지출/이월잔액 집계를
 *     **한 번의 쿼리 + 1 balance 조회**로 계산. 마감 페이지의 N+1 해소.
 */
export async function GET(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const unitIdStr = searchParams.get("unitId");
  const yearStr = searchParams.get("year");
  const view = searchParams.get("view");

  if (!unitIdStr || !yearStr) {
    return NextResponse.json(
      { error: "unitId와 year는 필수입니다." },
      { status: 400 }
    );
  }

  const unitId = parseInt(unitIdStr, 10);
  const year = parseInt(yearStr, 10);

  if (view !== "overview") {
    const closings = await prisma.accClosing.findMany({
      where: { unitId, year },
      orderBy: { month: "asc" },
    });
    return NextResponse.json(closings);
  }

  // === overview: 12개월 집계 (1회 vouchers 쿼리 + balance + closings) ===
  const yearStart = toDateOnly(`${year}-01-01`);
  const yearEnd = toDateOnly(`${year + 1}-01-01`);

  const [balance, closings, vouchers] = await Promise.all([
    prisma.accBalance.findUnique({ where: { unitId_year: { unitId, year } } }),
    prisma.accClosing.findMany({ where: { unitId, year } }),
    prisma.accVoucher.findMany({
      where: { unitId, date: { gte: yearStart, lt: yearEnd } },
      select: { type: true, totalAmount: true, date: true },
    }),
  ]);

  // 월별 수입/지출 (미마감 월 계산용)
  const monthly = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
  for (const v of vouchers) {
    const m = v.date.getUTCMonth(); // 0~11
    if (v.type === "D") monthly[m].income += v.totalAmount;
    else monthly[m].expense += v.totalAmount;
  }

  const closingMap = new Map(closings.map((c) => [c.month, c]));

  // carryOver 체인: balance → 1월 → 2월 → ...
  let carryOver = balance?.amount ?? 0;
  const rows = [];
  for (let m = 1; m <= 12; m++) {
    const c = closingMap.get(m);
    const isClosed = !!(c && c.closedAt);
    // 마감된 월은 마감 기록의 금액을 권위자료로 사용 (closing.carryOver 대신 체인 값 사용 — 상위 변경이 일관성 있게 반영)
    const totalIncome = isClosed ? c!.totalIncome : monthly[m - 1].income;
    const totalExpense = isClosed ? c!.totalExpense : monthly[m - 1].expense;
    rows.push({
      month: m,
      carryOver,
      totalIncome,
      totalExpense,
      isClosed,
      closedAt: isClosed && c!.closedAt ? c!.closedAt.toISOString() : null,
      closedBy: isClosed ? c!.closedBy : null,
    });
    carryOver += totalIncome - totalExpense;
  }

  return NextResponse.json({ rows, balance: balance?.amount ?? 0 });
}

/**
 * POST /api/accounting/closing
 * 월 마감 실행
 */
export async function POST(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json();
  const { unitId, year, month } = body;

  if (!unitId || !year || !month) {
    return NextResponse.json(
      { error: "unitId, year, month는 필수입니다." },
      { status: 400 }
    );
  }

  // 이미 마감되었는지 확인
  const existing = await prisma.accClosing.findUnique({
    where: { unitId_year_month: { unitId, year, month } },
  });
  if (existing && existing.closedAt) {
    return NextResponse.json(
      { error: `${year}년 ${month}월은 이미 마감되었습니다.` },
      { status: 409 }
    );
  }

  // 이전 월 마감 여부 확인 (1월 제외)
  if (month > 1) {
    const prevClosing = await prisma.accClosing.findUnique({
      where: { unitId_year_month: { unitId, year, month: month - 1 } },
    });
    if (!prevClosing || !prevClosing.closedAt) {
      return NextResponse.json(
        { error: `이전 월(${month - 1}월)이 마감되지 않았습니다.` },
        { status: 409 }
      );
    }
  }

  // 해당 월 전표에서 수입/지출 합계 계산
  const monthStart = toDateOnly(
    `${year}-${String(month).padStart(2, "0")}-01`
  );
  const nextMonth =
    month === 12
      ? toDateOnly(`${year + 1}-01-01`)
      : toDateOnly(
          `${year}-${String(month + 1).padStart(2, "0")}-01`
        );

  const vouchers = await prisma.accVoucher.findMany({
    where: {
      unitId,
      date: { gte: monthStart, lt: nextMonth },
    },
    select: { id: true, type: true, totalAmount: true },
  });

  let totalIncome = 0;
  let totalExpense = 0;
  for (const v of vouchers) {
    if (v.type === "D") totalIncome += v.totalAmount;
    else totalExpense += v.totalAmount;
  }

  // 이월잔액 계산
  let carryOver = 0;
  if (month === 1) {
    const balance = await prisma.accBalance.findUnique({
      where: { unitId_year: { unitId, year } },
    });
    carryOver = balance?.amount ?? 0;
  } else {
    const prevClosing = await prisma.accClosing.findUnique({
      where: { unitId_year_month: { unitId, year, month: month - 1 } },
    });
    if (prevClosing) {
      carryOver =
        prevClosing.carryOver +
        prevClosing.totalIncome -
        prevClosing.totalExpense;
    }
  }

  const now = new Date();
  const closedByName = access.user?.name ?? String(access.userId ?? "");

  // 트랜잭션: 마감 레코드 생성/갱신 + 전표 마감 플래그 설정
  const closing = await prisma.$transaction(async (tx) => {
    const result = await tx.accClosing.upsert({
      where: { unitId_year_month: { unitId, year, month } },
      create: {
        unitId,
        year,
        month,
        totalIncome,
        totalExpense,
        carryOver,
        closedAt: now,
        closedBy: closedByName,
      },
      update: {
        totalIncome,
        totalExpense,
        carryOver,
        closedAt: now,
        closedBy: closedByName,
      },
    });

    // 해당 월 전표에 마감 플래그 설정
    if (vouchers.length > 0) {
      await tx.accVoucher.updateMany({
        where: {
          id: { in: vouchers.map((v) => v.id) },
        },
        data: { isClosed: true },
      });
    }

    return result;
  });

  return NextResponse.json(closing, { status: 201 });
}

/**
 * DELETE /api/accounting/closing?unitId=1&year=2026&month=3
 * 월 마감 취소 (관리자 전용)
 */
export async function DELETE(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const unitIdStr = searchParams.get("unitId");
  const yearStr = searchParams.get("year");
  const monthStr = searchParams.get("month");

  if (!unitIdStr || !yearStr || !monthStr) {
    return NextResponse.json(
      { error: "unitId, year, month는 필수입니다." },
      { status: 400 }
    );
  }

  const unitId = parseInt(unitIdStr, 10);
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const existing = await prisma.accClosing.findUnique({
    where: { unitId_year_month: { unitId, year, month } },
  });
  if (!existing || !existing.closedAt) {
    return NextResponse.json(
      { error: "마감 기록이 없습니다." },
      { status: 404 }
    );
  }

  // 다음 월이 마감되어 있으면 취소 불가
  const nextClosing = await prisma.accClosing.findUnique({
    where: {
      unitId_year_month: {
        unitId,
        year: month === 12 ? year + 1 : year,
        month: month === 12 ? 1 : month + 1,
      },
    },
  });
  if (nextClosing && nextClosing.closedAt) {
    return NextResponse.json(
      { error: "다음 월이 이미 마감되어 있어 취소할 수 없습니다." },
      { status: 409 }
    );
  }

  // 해당 월 전표 범위
  const monthStart = toDateOnly(
    `${year}-${String(month).padStart(2, "0")}-01`
  );
  const nextMonth =
    month === 12
      ? toDateOnly(`${year + 1}-01-01`)
      : toDateOnly(
          `${year}-${String(month + 1).padStart(2, "0")}-01`
        );

  await prisma.$transaction(async (tx) => {
    // 마감 취소
    await tx.accClosing.update({
      where: { unitId_year_month: { unitId, year, month } },
      data: {
        closedAt: null,
        closedBy: null,
      },
    });

    // 전표 마감 플래그 해제
    await tx.accVoucher.updateMany({
      where: {
        unitId,
        date: { gte: monthStart, lt: nextMonth },
      },
      data: { isClosed: false },
    });
  });

  return NextResponse.json({ success: true });
}
