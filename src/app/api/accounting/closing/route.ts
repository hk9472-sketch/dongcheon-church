import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * 회계 접근 권한 확인
 */
async function checkAccess(userId: number): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, accountAccess: true },
  });
  if (!user) return false;
  return user.isAdmin <= 2 || user.accountAccess;
}

/**
 * 날짜 문자열(YYYY-MM-DD)을 UTC 자정 Date로 변환
 * @db.Date 컬럼은 날짜만 저장하므로 UTC 자정 기준으로 맞춘다
 */
function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

/**
 * GET /api/accounting/closing?unitId=1&year=2026
 * 마감 목록 조회
 */
export async function GET(request: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!(await checkAccess(sessionUser.id))) {
    return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
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

  const closings = await prisma.accClosing.findMany({
    where: { unitId, year },
    orderBy: { month: "asc" },
  });

  return NextResponse.json(closings);
}

/**
 * POST /api/accounting/closing
 * 월 마감 실행
 */
export async function POST(request: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!(await checkAccess(sessionUser.id))) {
    return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
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
        closedBy: sessionUser.name,
      },
      update: {
        totalIncome,
        totalExpense,
        carryOver,
        closedAt: now,
        closedBy: sessionUser.name,
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
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (sessionUser.isAdmin > 2) {
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
