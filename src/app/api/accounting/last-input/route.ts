import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import { toDateOnly, toNextDay } from "@/lib/accFund";

/**
 * GET /api/accounting/last-input?scope=ledger|offering|dues&dateFrom=&dateTo=[&unitId=][&category=]
 *
 * 집계 화면(결산서·월별·계정별·연보집계·월정 현황 등)용 — 조회 범위 데이터의
 *   · 최종 입력(수정 포함) 일시와 그 사람
 *   · 입력자별 건수
 * 를 돌려준다. 각 행의 최종입력 = modifiedAt ?? createdAt.
 */

type Row = { createdBy: string | null; createdAt: Date; modifiedBy: string | null; modifiedAt: Date | null };

function summarize(rows: Row[]) {
  let last: { at: string; by: string } | null = null;
  let lastTs = 0;
  const counts = new Map<string, number>();
  for (const r of rows) {
    const at = r.modifiedAt ?? r.createdAt;
    if (at.getTime() > lastTs) {
      lastTs = at.getTime();
      last = { at: at.toISOString(), by: (r.modifiedAt ? r.modifiedBy : r.createdBy) || "-" };
    }
    const who = r.createdBy || "-";
    counts.set(who, (counts.get(who) ?? 0) + 1);
  }
  return {
    count: rows.length,
    last,
    inputters: Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

const SEL = { createdBy: true, createdAt: true, modifiedBy: true, modifiedAt: true } as const;

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const scope = sp.get("scope") || "ledger";
  const perm = scope === "offering" ? "offering" : scope === "dues" ? "dues" : "ledger";
  const access = await checkAccAccess(perm);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");
  const date =
    dateFrom || dateTo
      ? {
          ...(dateFrom ? { gte: toDateOnly(dateFrom) } : {}),
          ...(dateTo ? { lt: toNextDay(dateTo) } : {}),
        }
      : undefined;

  if (scope === "offering") {
    const rows = await prisma.offeringEntry.findMany({ where: { ...(date ? { date } : {}) }, select: SEL });
    return NextResponse.json(summarize(rows));
  }
  if (scope === "dues") {
    const category = sp.get("category");
    const rows = await prisma.monthlyDuesDeposit.findMany({
      where: { ...(date ? { date } : {}), ...(category ? { category } : {}) },
      select: SEL,
    });
    return NextResponse.json(summarize(rows));
  }
  const unitId = parseInt(sp.get("unitId") || "", 10);
  const rows = await prisma.accVoucher.findMany({
    where: { ...(date ? { date } : {}), ...(unitId ? { unitId } : {}) },
    select: SEL,
  });
  return NextResponse.json(summarize(rows));
}
