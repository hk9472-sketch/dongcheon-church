import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import { computeFundBalances, toNextDay } from "@/lib/accFund";

/**
 * GET /api/accounting/funds/status?unitId=1&date=2026-09-05
 * 통장별 잔액 (해당 연도 연초 ~ date) + date 이전 가장 최근 대사 기록과 비교.
 * 대사 비교값: 대사일 기준 장부 잔액을 따로 계산해 차이(actual − book) 제공.
 */
export async function GET(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const sp = new URL(request.url).searchParams;
  const unitId = parseInt(sp.get("unitId") || "", 10);
  const date = sp.get("date") || "";
  if (!unitId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "unitId와 date(YYYY-MM-DD)는 필수입니다." }, { status: 400 });
  }
  const year = parseInt(date.slice(0, 4), 10);

  const rows = await computeFundBalances(unitId, year, date);

  // 각 통장의 date 이전(포함) 최근 대사 — 같은 연도 안에서만 비교
  const checks = await prisma.accFundCheck.findMany({
    where: {
      fund: { unitId },
      date: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: toNextDay(date) },
    },
    orderBy: { date: "desc" },
  });
  const latest = new Map<number, (typeof checks)[number]>();
  for (const c of checks) if (!latest.has(c.fundId)) latest.set(c.fundId, c);

  // 대사일별 장부 잔액 (대사일이 조회일과 다를 수 있으므로 일자별로 재계산)
  const bookAt = new Map<string, Map<number, number>>();
  for (const c of latest.values()) {
    const d = c.date.toISOString().slice(0, 10);
    if (!bookAt.has(d)) {
      const r = d === date ? rows : await computeFundBalances(unitId, year, d);
      bookAt.set(d, new Map(r.map((x) => [x.fundId, x.balance])));
    }
  }

  const result = rows.map((r) => {
    const c = latest.get(r.fundId);
    if (!c) return { ...r, check: null };
    const d = c.date.toISOString().slice(0, 10);
    const book = bookAt.get(d)?.get(r.fundId) ?? 0;
    return {
      ...r,
      check: {
        id: c.id,
        date: d,
        actualAmount: c.actualAmount,
        bookAmount: book,
        diff: c.actualAmount - book,
        memo: c.memo,
      },
    };
  });

  return NextResponse.json({ date, year, funds: result });
}
