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

/** dateTo 조회용: 해당 날짜 다음날 00:00:00Z (lt 비교용) */
function toNextDay(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * 이월잔액 계산: AccBalance(연초 잔액) + 이전 월 마감 데이터 또는 전표에서 계산
 */
async function calculateCarryOver(
  unitId: number,
  year: number,
  month: number
): Promise<number> {
  // 연초 이월잔액
  const balance = await prisma.accBalance.findUnique({
    where: { unitId_year: { unitId, year } },
  });
  let carryOver = balance?.amount ?? 0;

  // 1월부터 해당 월 전까지의 전표를 합산
  for (let m = 1; m < month; m++) {
    // 마감 데이터가 있으면 사용
    const closing = await prisma.accClosing.findUnique({
      where: { unitId_year_month: { unitId, year, month: m } },
    });
    if (closing && closing.closedAt) {
      carryOver += closing.totalIncome - closing.totalExpense;
    } else {
      // 마감 전이면 전표에서 직접 계산
      const monthStart = toDateOnly(`${year}-${String(m).padStart(2, "0")}-01`);
      const nextMonth = m === 12
        ? toDateOnly(`${year + 1}-01-01`)
        : toDateOnly(`${year}-${String(m + 1).padStart(2, "0")}-01`);

      const vouchers = await prisma.accVoucher.findMany({
        where: {
          unitId,
          date: { gte: monthStart, lt: nextMonth },
        },
        select: { type: true, totalAmount: true },
      });

      for (const v of vouchers) {
        if (v.type === "D") carryOver += v.totalAmount;
        else carryOver -= v.totalAmount;
      }
    }
  }

  return carryOver;
}

/**
 * GET /api/accounting/report
 * 보고서 조회
 *
 * Query params:
 *   reportType: "monthly" | "account" | "daily"
 *   unitId: number
 *   year, month: for monthly/daily
 *   dateFrom, dateTo: for account/daily
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
  const reportType = searchParams.get("reportType");
  const unitIdStr = searchParams.get("unitId");
  const yearStr = searchParams.get("year");
  const monthStr = searchParams.get("month");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  if (!reportType || !unitIdStr) {
    return NextResponse.json(
      { error: "reportType과 unitId는 필수입니다." },
      { status: 400 }
    );
  }

  const unitId = parseInt(unitIdStr, 10);

  if (reportType === "monthly") {
    return handleMonthlyReport(unitId, yearStr, monthStr);
  } else if (reportType === "account") {
    return handleAccountReport(unitId, dateFrom, dateTo);
  } else if (reportType === "daily") {
    return handleDailyReport(unitId, yearStr, monthStr, dateFrom, dateTo);
  }

  return NextResponse.json({ error: "잘못된 reportType입니다." }, { status: 400 });
}

/**
 * 월별 보고서: 계정별 합계, 수입/지출 소계
 */
async function handleMonthlyReport(
  unitId: number,
  yearStr: string | null,
  monthStr: string | null
) {
  if (!yearStr || !monthStr) {
    return NextResponse.json(
      { error: "year와 month는 필수입니다." },
      { status: 400 }
    );
  }

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const monthStart = toDateOnly(
    `${year}-${String(month).padStart(2, "0")}-01`
  );
  const nextMonth =
    month === 12
      ? toDateOnly(`${year + 1}-01-01`)
      : toDateOnly(
          `${year}-${String(month + 1).padStart(2, "0")}-01`
        );

  // 전표항목을 계정별로 집계
  const voucherItems = await prisma.accVoucherItem.findMany({
    where: {
      voucher: {
        unitId,
        date: { gte: monthStart, lt: nextMonth },
      },
    },
    include: {
      account: {
        select: { id: true, code: true, name: true, type: true, parentId: true, level: true },
      },
      voucher: {
        select: { type: true },
      },
    },
  });

  // 계정별 합계
  const accountTotals: Record<
    number,
    {
      accountId: number;
      code: string;
      name: string;
      type: string;
      parentId: number | null;
      level: number;
      amount: number;
    }
  > = {};

  for (const item of voucherItems) {
    const key = item.accountId;
    if (!accountTotals[key]) {
      accountTotals[key] = {
        accountId: item.account.id,
        code: item.account.code,
        name: item.account.name,
        type: item.account.type,
        parentId: item.account.parentId,
        level: item.account.level,
        amount: 0,
      };
    }
    accountTotals[key].amount += item.amount;
  }

  const items = Object.values(accountTotals).sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  // 수입/지출 소계
  const totalIncome = items
    .filter((i) => i.type === "D")
    .reduce((s, i) => s + i.amount, 0);
  const totalExpense = items
    .filter((i) => i.type === "C")
    .reduce((s, i) => s + i.amount, 0);

  const carryOver = await calculateCarryOver(unitId, year, month);

  return NextResponse.json({
    reportType: "monthly",
    year,
    month,
    carryOver,
    items,
    totalIncome,
    totalExpense,
    balance: carryOver + totalIncome - totalExpense,
  });
}

/**
 * 계정별 보고서: 기간 내 계정별 합계
 */
async function handleAccountReport(
  unitId: number,
  dateFrom: string | null,
  dateTo: string | null
) {
  if (!dateFrom || !dateTo) {
    return NextResponse.json(
      { error: "dateFrom과 dateTo는 필수입니다." },
      { status: 400 }
    );
  }

  const from = toDateOnly(dateFrom);
  const to = toNextDay(dateTo);

  const voucherItems = await prisma.accVoucherItem.findMany({
    where: {
      voucher: {
        unitId,
        date: { gte: from, lt: to },
      },
    },
    include: {
      account: {
        select: { id: true, code: true, name: true, type: true, parentId: true, level: true },
      },
    },
  });

  const accountTotals: Record<
    number,
    {
      accountId: number;
      code: string;
      name: string;
      type: string;
      parentId: number | null;
      level: number;
      amount: number;
      count: number;
    }
  > = {};

  for (const item of voucherItems) {
    const key = item.accountId;
    if (!accountTotals[key]) {
      accountTotals[key] = {
        accountId: item.account.id,
        code: item.account.code,
        name: item.account.name,
        type: item.account.type,
        parentId: item.account.parentId,
        level: item.account.level,
        amount: 0,
        count: 0,
      };
    }
    accountTotals[key].amount += item.amount;
    accountTotals[key].count += 1;
  }

  const items = Object.values(accountTotals).sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  const totalIncome = items
    .filter((i) => i.type === "D")
    .reduce((s, i) => s + i.amount, 0);
  const totalExpense = items
    .filter((i) => i.type === "C")
    .reduce((s, i) => s + i.amount, 0);

  // 기간 시작 시점의 이월잔액 계산 (UTC 자정 기준)
  const carryOver = await calculateCarryOver(
    unitId,
    from.getUTCFullYear(),
    from.getUTCMonth() + 1
  );

  return NextResponse.json({
    reportType: "account",
    dateFrom,
    dateTo,
    carryOver,
    items,
    totalIncome,
    totalExpense,
    balance: carryOver + totalIncome - totalExpense,
  });
}

/**
 * 일별 보고서: 날짜별 합계
 */
async function handleDailyReport(
  unitId: number,
  yearStr: string | null,
  monthStr: string | null,
  dateFrom: string | null,
  dateTo: string | null
) {
  let from: Date;
  let to: Date;
  let year: number;
  let month: number;

  if (dateFrom && dateTo) {
    from = toDateOnly(dateFrom);
    to = toNextDay(dateTo);
    year = from.getUTCFullYear();
    month = from.getUTCMonth() + 1;
  } else if (yearStr && monthStr) {
    year = parseInt(yearStr, 10);
    month = parseInt(monthStr, 10);
    from = toDateOnly(`${year}-${String(month).padStart(2, "0")}-01`);
    to =
      month === 12
        ? toDateOnly(`${year + 1}-01-01`)
        : toDateOnly(
            `${year}-${String(month + 1).padStart(2, "0")}-01`
          );
  } else {
    return NextResponse.json(
      { error: "year/month 또는 dateFrom/dateTo는 필수입니다." },
      { status: 400 }
    );
  }

  const vouchers = await prisma.accVoucher.findMany({
    where: {
      unitId,
      date: { gte: from, lt: to },
    },
    include: {
      items: {
        include: {
          account: { select: { code: true, name: true } },
        },
        orderBy: { seq: "asc" },
      },
    },
    orderBy: [{ date: "asc" }, { voucherNo: "asc" }],
  });

  // 날짜별 집계 + 상세 내역
  const dailyMap: Record<
    string,
    {
      date: string;
      income: number;
      expense: number;
      details: {
        voucherNo: string;
        type: string;
        accountName: string;
        description: string;
        counterpart: string;
        amount: number;
      }[];
    }
  > = {};

  for (const v of vouchers) {
    const dateKey = v.date.toISOString().slice(0, 10);
    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { date: dateKey, income: 0, expense: 0, details: [] };
    }
    if (v.type === "D") {
      dailyMap[dateKey].income += v.totalAmount;
    } else {
      dailyMap[dateKey].expense += v.totalAmount;
    }
    for (const item of v.items) {
      dailyMap[dateKey].details.push({
        voucherNo: v.voucherNo,
        type: v.type,
        accountName: item.account.name,
        description: item.description || "",
        counterpart: item.counterpart || "",
        amount: item.amount,
      });
    }
  }

  const days = Object.values(dailyMap).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const totalIncome = days.reduce((s, d) => s + d.income, 0);
  const totalExpense = days.reduce((s, d) => s + d.expense, 0);

  const carryOver = await calculateCarryOver(unitId, year!, month!);

  return NextResponse.json({
    reportType: "daily",
    carryOver,
    days,
    totalIncome,
    totalExpense,
    balance: carryOver + totalIncome - totalExpense,
  });
}
