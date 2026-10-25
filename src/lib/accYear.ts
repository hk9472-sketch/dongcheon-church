import prisma from "./db";
import { computeFundBalances, toDateOnly } from "./accFund";

/**
 * 연마감 / 연도별 이월금 공용 로직.
 *
 * 흐름: (시작 연도) 이월금 직접 입력 → 1년 전표 입력 → 연마감
 *       → 통장별 기말잔액이 다음 연도 이월금(source="closing")으로 생성·잠김 → 다음 연도 진행.
 *
 * 연마감은 1~12월 월마감(AccClosing)을 일괄 처리하므로, 그 연도의 전표·이체 입력/수정은
 * 기존 월마감 검사로 그대로 막힌다.
 */

/** year 의 이월금이 잠겼는지 — 전년도 연마감으로 생성됐거나, 해당 연도 자체가 마감된 경우 */
export async function balanceLock(unitId: number, year: number): Promise<string | null> {
  const [prev, self] = await Promise.all([
    prisma.accYearClosing.findUnique({ where: { unitId_year: { unitId, year: year - 1 } } }),
    prisma.accYearClosing.findUnique({ where: { unitId_year: { unitId, year } } }),
  ]);
  if (self) return `${year}년이 이미 연마감되어 이월금을 바꿀 수 없습니다. (연마감 취소 후 수정)`;
  if (prev) return `${year - 1}년 연마감으로 생성된 이월금입니다. 바꾸려면 ${year - 1}년 연마감을 취소하세요.`;
  return null;
}

/** 단위의 연간 수입/지출 + 월별 합계 */
async function yearTotals(unitId: number, year: number) {
  const vouchers = await prisma.accVoucher.findMany({
    where: { unitId, date: { gte: toDateOnly(`${year}-01-01`), lt: toDateOnly(`${year + 1}-01-01`) } },
    select: { type: true, totalAmount: true, date: true },
  });
  const monthly = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
  for (const v of vouchers) {
    const m = v.date.getUTCMonth();
    if (v.type === "D") monthly[m].income += v.totalAmount;
    else monthly[m].expense += v.totalAmount;
  }
  return {
    monthly,
    income: monthly.reduce((s, m) => s + m.income, 0),
    expense: monthly.reduce((s, m) => s + m.expense, 0),
  };
}

export interface YearUnitStatus {
  unitId: number;
  name: string;
  opening: number | null; // null = 이월금 미입력
  openingSource: string | null;
  income: number;
  expense: number;
  ending: number;
  funds: { fundId: number; name: string; opening: number; ending: number; isActive: boolean }[];
  closedMonths: number;
  closing: { closedAt: string; closedBy: string; closingAmount: number } | null;
  next: { amount: number; source: string } | null; // 다음 연도 이월금 현황
  nextClosed: boolean;
}

export async function yearStatus(year: number): Promise<YearUnitStatus[]> {
  const units = await prisma.accUnit.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const out: YearUnitStatus[] = [];
  for (const u of units) {
    const [bal, next, closing, nextClosing, closedMonths, totals, funds] = await Promise.all([
      prisma.accBalance.findUnique({ where: { unitId_year: { unitId: u.id, year } } }),
      prisma.accBalance.findUnique({ where: { unitId_year: { unitId: u.id, year: year + 1 } } }),
      prisma.accYearClosing.findUnique({ where: { unitId_year: { unitId: u.id, year } } }),
      prisma.accYearClosing.findUnique({ where: { unitId_year: { unitId: u.id, year: year + 1 } } }),
      prisma.accClosing.count({ where: { unitId: u.id, year, closedAt: { not: null } } }),
      yearTotals(u.id, year),
      computeFundBalances(u.id, year, `${year}-12-31`),
    ]);
    const opening = bal?.amount ?? null;
    // 통장이 있으면 통장 합계가 기준, 없으면 단위 합계로 계산
    const ending = funds.length > 0
      ? funds.reduce((s, f) => s + f.balance, 0)
      : (opening ?? 0) + totals.income - totals.expense;
    out.push({
      unitId: u.id,
      name: u.name,
      opening,
      openingSource: bal?.source ?? null,
      income: totals.income,
      expense: totals.expense,
      ending,
      funds: funds.map((f) => ({
        fundId: f.fundId,
        name: f.name,
        opening: f.opening,
        ending: f.balance,
        isActive: f.isActive,
      })),
      closedMonths,
      closing: closing
        ? { closedAt: closing.closedAt.toISOString(), closedBy: closing.closedBy, closingAmount: closing.closingAmount }
        : null,
      next: next ? { amount: next.amount, source: next.source } : null,
      nextClosed: !!nextClosing,
    });
  }
  return out;
}

/** 연마감 실행. 성공 시 null, 실패 시 사유 문자열 */
export async function closeYear(unitId: number, year: number, closedBy: string): Promise<string | null> {
  const unit = await prisma.accUnit.findUnique({ where: { id: unitId } });
  if (!unit) return "회계단위를 찾을 수 없습니다.";
  if (await prisma.accYearClosing.findUnique({ where: { unitId_year: { unitId, year } } })) {
    return `${unit.name}: 이미 마감되었습니다.`;
  }
  const prevYear = await prisma.accYearClosing.findFirst({ where: { unitId, year: { lt: year } }, orderBy: { year: "desc" } });
  const firstBal = await prisma.accBalance.findFirst({ where: { unitId }, orderBy: { year: "asc" } });
  // 이전 연도에 장부가 시작됐는데 전년도가 마감되지 않았으면 순서 위반
  if (firstBal && firstBal.year < year && (!prevYear || prevYear.year !== year - 1)) {
    return `${unit.name}: ${year - 1}년을 먼저 연마감하세요.`;
  }
  const bal = await prisma.accBalance.findUnique({ where: { unitId_year: { unitId, year } } });
  if (!bal) return `${unit.name}: ${year}년 이월금이 입력되지 않았습니다. (0원이어도 이월금 화면에서 저장)`;

  const totals = await yearTotals(unitId, year);
  const funds = await computeFundBalances(unitId, year, `${year}-12-31`);
  const fundOpeningSum = funds.reduce((s, f) => s + f.opening, 0);
  if (funds.length > 0 && fundOpeningSum !== bal.amount) {
    return `${unit.name}: 통장별 이월금 합계(${fundOpeningSum.toLocaleString()})가 회계단위 이월금(${bal.amount.toLocaleString()})과 다릅니다. 이월금 화면에서 다시 저장하세요.`;
  }
  const ending = funds.length > 0
    ? funds.reduce((s, f) => s + f.balance, 0)
    : bal.amount + totals.income - totals.expense;

  const nextYearClosed = await prisma.accYearClosing.findUnique({ where: { unitId_year: { unitId, year: year + 1 } } });
  if (nextYearClosed) return `${unit.name}: ${year + 1}년이 이미 마감되어 있습니다.`;

  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      // 1~12월 월마감 일괄 (이월 체인 포함)
      let carry = bal.amount;
      for (let m = 1; m <= 12; m++) {
        const { income, expense } = totals.monthly[m - 1];
        await tx.accClosing.upsert({
          where: { unitId_year_month: { unitId, year, month: m } },
          create: { unitId, year, month: m, totalIncome: income, totalExpense: expense, carryOver: carry, closedAt: now, closedBy },
          update: { totalIncome: income, totalExpense: expense, carryOver: carry, closedAt: now, closedBy },
        });
        carry += income - expense;
      }
      await tx.accVoucher.updateMany({
        where: { unitId, date: { gte: toDateOnly(`${year}-01-01`), lt: toDateOnly(`${year + 1}-01-01`) } },
        data: { isClosed: true },
      });

      // 다음 연도 이월금 생성 (통장별 + 단위 합계)
      for (const f of funds) {
        await tx.accFundBalance.upsert({
          where: { fundId_year: { fundId: f.fundId, year: year + 1 } },
          create: { fundId: f.fundId, year: year + 1, amount: f.balance },
          update: { amount: f.balance },
        });
      }
      await tx.accBalance.upsert({
        where: { unitId_year: { unitId, year: year + 1 } },
        create: { unitId, year: year + 1, amount: ending, source: "closing" },
        update: { amount: ending, source: "closing" },
      });

      await tx.accYearClosing.create({
        data: {
          unitId,
          year,
          openingAmount: bal.amount,
          totalIncome: totals.income,
          totalExpense: totals.expense,
          closingAmount: ending,
          closedBy,
        },
      });
    },
    { timeout: 30_000 },
  );
  return null;
}

/** 연마감 취소 — 다음 연도가 마감돼 있으면 불가. 다음 연도 이월금은 남겨 두되 잠금 해제(재마감 시 다시 생성). */
export async function cancelYear(unitId: number, year: number): Promise<string | null> {
  const closing = await prisma.accYearClosing.findUnique({ where: { unitId_year: { unitId, year } } });
  if (!closing) return "연마감 기록이 없습니다.";
  if (await prisma.accYearClosing.findUnique({ where: { unitId_year: { unitId, year: year + 1 } } })) {
    return `${year + 1}년이 마감되어 있어 취소할 수 없습니다. ${year + 1}년 연마감부터 취소하세요.`;
  }
  await prisma.$transaction(async (tx) => {
    await tx.accYearClosing.delete({ where: { id: closing.id } });
    await tx.accClosing.updateMany({ where: { unitId, year }, data: { closedAt: null, closedBy: null } });
    await tx.accVoucher.updateMany({
      where: { unitId, date: { gte: toDateOnly(`${year}-01-01`), lt: toDateOnly(`${year + 1}-01-01`) } },
      data: { isClosed: false },
    });
  });
  return null;
}
