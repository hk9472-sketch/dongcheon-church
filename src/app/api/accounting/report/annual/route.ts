import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import { computeFundBalances, toDateOnly, toNextDay } from "@/lib/accFund";

/**
 * GET /api/accounting/report/annual?year=2026[&dateTo=2026-09-30]
 * 연간 결산서 — 회계단위별 (전년이월 + 총수입 − 총지출 = 잔액) + 수입/지출 내역.
 *
 * 결산서 줄 = 최상위 계정(parentId=null) 하나.
 *  - 하위가 있는 상위 계정: 하위 합계를 한 줄로. reportDetail=true 면 하위 계정을 펼쳐 표시
 *    (예: 제세공과금 · 차량). 표기는 reportName ?? name.
 *  - 금액 0 인 줄은 생략.
 */

interface Acc {
  id: number;
  code: string;
  name: string;
  type: string;
  parentId: number | null;
  sortOrder: number;
  reportName: string | null;
  reportDetail: boolean;
  isTransfer: boolean;
}

interface ReportLine {
  label: string;
  code: string;
  amount: number;
  children?: { label: string; code: string; amount: number }[];
}

function buildLines(accounts: Acc[], sums: Map<number, number>, type: "D" | "C"): ReportLine[] {
  const kids = new Map<number, Acc[]>();
  for (const a of accounts) {
    if (a.parentId) kids.set(a.parentId, [...(kids.get(a.parentId) || []), a]);
  }
  const order = (x: Acc, y: Acc) => x.sortOrder - y.sortOrder || x.code.localeCompare(y.code);
  const total = (a: Acc): number =>
    (sums.get(a.id) ?? 0) + (kids.get(a.id) || []).reduce((s, c) => s + total(c), 0);
  const label = (a: Acc) => a.reportName || a.name;

  const lines: ReportLine[] = [];
  // 회계 간 대체 전용 계정은 수입/지출 내역이 아니라 별도 '대체' 줄로 표시
  for (const root of accounts.filter((a) => !a.parentId && a.type === type && !a.isTransfer).sort(order)) {
    const amount = total(root);
    if (amount === 0) continue;
    const children = kids.get(root.id);
    const line: ReportLine = { label: label(root), code: root.code, amount };
    if (children && root.reportDetail) {
      line.children = children
        .sort(order)
        .map((c) => ({ label: label(c), code: c.code, amount: total(c) }))
        .filter((c) => c.amount !== 0);
    }
    lines.push(line);
  }
  return lines;
}

export async function GET(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const sp = new URL(request.url).searchParams;
  const year = parseInt(sp.get("year") || "", 10);
  if (!year) return NextResponse.json({ error: "year는 필수입니다." }, { status: 400 });
  const dateToParam = sp.get("dateTo");
  const dateTo =
    dateToParam && /^\d{4}-\d{2}-\d{2}$/.test(dateToParam) && dateToParam.startsWith(String(year))
      ? dateToParam
      : `${year}-12-31`;

  const from = toDateOnly(`${year}-01-01`);
  const to = toNextDay(dateTo);

  const [units, accounts, balances, itemSums, unitTransfers] = await Promise.all([
    prisma.accUnit.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.accAccount.findMany({
      select: {
        id: true,
        unitId: true,
        code: true,
        name: true,
        type: true,
        parentId: true,
        sortOrder: true,
        reportName: true,
        reportDetail: true,
        isTransfer: true,
      },
    }),
    prisma.accBalance.findMany({ where: { year } }),
    prisma.accVoucherItem.groupBy({
      by: ["accountId"],
      where: { voucher: { date: { gte: from, lt: to } } },
      _sum: { amount: true },
    }),
    prisma.accUnitTransfer.findMany({ where: { date: { gte: from, lt: to } } }),
  ]);
  const unitNameMap = new Map(units.map((u) => [u.id, u.name]));

  const sums = new Map(itemSums.map((r) => [r.accountId, r._sum.amount ?? 0]));
  const balanceMap = new Map(balances.map((b) => [b.unitId, b.amount]));

  const result = [];
  for (const u of units) {
    const accs = accounts.filter((a) => a.unitId === u.id);
    const incomeLines = buildLines(accs, sums, "D");
    const expenseLines = buildLines(accs, sums, "C");
    const income = incomeLines.reduce((s, l) => s + l.amount, 0);
    const expense = expenseLines.reduce((s, l) => s + l.amount, 0);
    const carryOver = balanceMap.get(u.id) ?? 0;

    // 회계 간 대체 — (구분, 상대 회계) 별 합계
    const group = (rows: typeof unitTransfers, side: "in" | "out") => {
      const m = new Map<string, number>();
      for (const t of rows) {
        const other = unitNameMap.get(side === "in" ? t.fromUnitId : t.toUnitId) ?? "?";
        const label = `${t.kind} ${side === "in" ? "입금" : "출금"} (${other})`;
        m.set(label, (m.get(label) ?? 0) + t.amount);
      }
      return Array.from(m, ([label, amount]) => ({ label, amount }));
    };
    const transfersIn = group(unitTransfers.filter((t) => t.toUnitId === u.id), "in");
    const transfersOut = group(unitTransfers.filter((t) => t.fromUnitId === u.id), "out");
    const transferIn = transfersIn.reduce((s, t) => s + t.amount, 0);
    const transferOut = transfersOut.reduce((s, t) => s + t.amount, 0);
    const funds = (await computeFundBalances(u.id, year, dateTo))
      .filter((f) => f.isActive || f.balance !== 0)
      .map((f) => ({ fundId: f.fundId, name: f.name, kind: f.kind, balance: f.balance }));
    result.push({
      unitId: u.id,
      name: u.name,
      carryOver,
      income,
      expense,
      transferIn,
      transferOut,
      transfersIn,
      transfersOut,
      balance: carryOver + income + transferIn - expense - transferOut,
      incomeLines,
      expenseLines,
      funds,
    });
  }

  const total = result.reduce(
    (a, u) => ({
      carryOver: a.carryOver + u.carryOver,
      income: a.income + u.income,
      expense: a.expense + u.expense,
      balance: a.balance + u.balance,
    }),
    { carryOver: 0, income: 0, expense: 0, balance: 0 },
  );

  return NextResponse.json({ year, dateTo, units: result, total });
}
