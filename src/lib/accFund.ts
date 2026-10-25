import prisma from "./db";

/**
 * 통장(AccFund) 공용 헬퍼.
 *
 * 규칙:
 *  - 전표(AccVoucher).fundId 가 null 이면 그 회계단위의 기본 통장(isDefault)으로 간주.
 *  - 이체(AccTransfer)는 같은 회계단위 안의 통장 간 이동 — 단위 수지(수입/지출)에는 영향 없음.
 *  - 통장 잔액 = 연초잔액(AccFundBalance) + 수입 − 지출 + 이체입 − 이체출
 */

export function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

export function toNextDay(dateStr: string): Date {
  const d = toDateOnly(dateStr);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** 회계단위의 기본 통장 id (없으면 활성 통장 중 첫 번째, 그것도 없으면 null) */
export async function getDefaultFundId(unitId: number): Promise<number | null> {
  const funds = await prisma.accFund.findMany({
    where: { unitId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
    select: { id: true },
    take: 1,
  });
  return funds[0]?.id ?? null;
}

/**
 * 전표에 지정할 fundId 검증. 미지정이면 null(기본 통장) 반환.
 * 다른 단위의 통장이면 에러 문자열 반환.
 */
export async function resolveVoucherFund(
  unitId: number,
  fundId: unknown,
): Promise<{ ok: true; fundId: number | null } | { ok: false; error: string }> {
  if (fundId === undefined || fundId === null || fundId === "") return { ok: true, fundId: null };
  const id = Number(fundId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 통장입니다." };
  const fund = await prisma.accFund.findUnique({ where: { id }, select: { unitId: true } });
  if (!fund || fund.unitId !== unitId) {
    return { ok: false, error: "선택한 통장이 이 회계단위에 속하지 않습니다." };
  }
  return { ok: true, fundId: id };
}

export interface FundBalanceRow {
  fundId: number;
  name: string;
  kind: string;
  bankName: string | null;
  accountNo: string | null;
  isDefault: boolean;
  isActive: boolean;
  opening: number;
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  balance: number;
}

/**
 * 회계단위의 통장별 잔액 — year 연초부터 asOf(포함) 까지.
 * fundId 가 null 인 전표는 기본 통장으로 합산.
 */
export async function computeFundBalances(
  unitId: number,
  year: number,
  asOf: string,
): Promise<FundBalanceRow[]> {
  const from = toDateOnly(`${year}-01-01`);
  const to = toNextDay(asOf);

  const [funds, openings, vouchers, transfers] = await Promise.all([
    prisma.accFund.findMany({
      where: { unitId },
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.accFundBalance.findMany({ where: { year, fund: { unitId } } }),
    prisma.accVoucher.groupBy({
      by: ["fundId", "type"],
      where: { unitId, date: { gte: from, lt: to } },
      _sum: { totalAmount: true },
    }),
    prisma.accTransfer.findMany({
      where: { unitId, date: { gte: from, lt: to } },
      select: { fromFundId: true, toFundId: true, amount: true },
    }),
  ]);

  const defaultId =
    funds.find((f) => f.isDefault && f.isActive)?.id ??
    funds.find((f) => f.isActive)?.id ??
    null;

  const rows = new Map<number, FundBalanceRow>();
  for (const f of funds) {
    rows.set(f.id, {
      fundId: f.id,
      name: f.name,
      kind: f.kind,
      bankName: f.bankName,
      accountNo: f.accountNo,
      isDefault: f.isDefault,
      isActive: f.isActive,
      opening: 0,
      income: 0,
      expense: 0,
      transferIn: 0,
      transferOut: 0,
      balance: 0,
    });
  }
  for (const o of openings) {
    const r = rows.get(o.fundId);
    if (r) r.opening = o.amount;
  }
  for (const v of vouchers) {
    const id = v.fundId ?? defaultId;
    const r = id ? rows.get(id) : undefined;
    if (!r) continue;
    const amt = v._sum.totalAmount ?? 0;
    if (v.type === "D") r.income += amt;
    else r.expense += amt;
  }
  for (const t of transfers) {
    const out = rows.get(t.fromFundId);
    const inn = rows.get(t.toFundId);
    if (out) out.transferOut += t.amount;
    if (inn) inn.transferIn += t.amount;
  }
  for (const r of rows.values()) {
    r.balance = r.opening + r.income - r.expense + r.transferIn - r.transferOut;
  }
  return Array.from(rows.values());
}

/** 해당 일자가 속한 월이 마감됐는지 */
export async function isMonthClosed(unitId: number, date: Date): Promise<boolean> {
  const closing = await prisma.accClosing.findUnique({
    where: {
      unitId_year_month: {
        unitId,
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
      },
    },
  });
  return !!closing?.closedAt;
}
