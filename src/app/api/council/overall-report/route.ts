import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

async function requireCouncilAccess(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || (!user.councilAccess && user.isAdmin > 2)) return null;
  return user;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// GET /api/council/overall-report?from=2026-01-01&to=2026-03-15&view=group|division|date
export async function GET(request: NextRequest) {
  const user = await requireCouncilAccess(request);
  if (!user) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
  }

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ message: "from, to 파라미터가 필요합니다." }, { status: 400 });
  }

  const startDate = new Date(from + "T00:00:00+09:00");
  const endDate = new Date(to + "T23:59:59+09:00");

  // CouncilReportEntry에서 직접 집계
  const entries = await prisma.councilReportEntry.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    include: { group: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { groupId: "asc" }, { division: "asc" }],
  });

  // 구역별 집계
  const groupMap: Record<string, {
    groupName: string; groupId: number;
    sam: number; oh: number; jupre: number; juhu: number;
    bible: number; prayer: number;
    adultSam: number; adultOh: number; adultJupre: number; adultJuhu: number;
    midSam: number; midOh: number; midJupre: number; midJuhu: number;
    bibleMale: number; bibleFemale: number;
  }> = {};

  // 반사별 집계
  const divisionMap: Record<string, {
    division: string;
    sam: number; oh: number; jupre: number; juhu: number;
    bible: number; prayer: number;
  }> = {};

  // 날짜별 집계
  const dateMap: Record<string, {
    date: string;
    sam: number; oh: number; jupre: number; juhu: number;
    bible: number; prayer: number;
    adultSam: number; adultOh: number; adultJupre: number; adultJuhu: number;
    midSam: number; midOh: number; midJupre: number; midJuhu: number;
    bibleMale: number; bibleFemale: number;
  }> = {};

  for (const e of entries) {
    const gKey = String(e.groupId);
    const dKey = e.division;
    const dtKey = fmtDate(e.date);
    const isAdult = e.division === "장년";

    // 구역별
    if (!groupMap[gKey]) {
      groupMap[gKey] = {
        groupName: e.group.name, groupId: e.groupId,
        sam: 0, oh: 0, jupre: 0, juhu: 0, bible: 0, prayer: 0,
        adultSam: 0, adultOh: 0, adultJupre: 0, adultJuhu: 0,
        midSam: 0, midOh: 0, midJupre: 0, midJuhu: 0,
        bibleMale: 0, bibleFemale: 0,
      };
    }
    const g = groupMap[gKey];
    g.sam += e.sam; g.oh += e.oh; g.jupre += e.jupre; g.juhu += e.juhu;
    g.bible += e.bible; g.prayer += e.prayer;
    if (isAdult) {
      g.adultSam += e.sam; g.adultOh += e.oh; g.adultJupre += e.jupre; g.adultJuhu += e.juhu;
    } else {
      g.midSam += e.sam; g.midOh += e.oh; g.midJupre += e.jupre; g.midJuhu += e.juhu;
    }
    if (e.isMale) g.bibleMale += e.bible; else g.bibleFemale += e.bible;

    // 반사별
    if (!divisionMap[dKey]) {
      divisionMap[dKey] = { division: dKey, sam: 0, oh: 0, jupre: 0, juhu: 0, bible: 0, prayer: 0 };
    }
    const dv = divisionMap[dKey];
    dv.sam += e.sam; dv.oh += e.oh; dv.jupre += e.jupre; dv.juhu += e.juhu;
    dv.bible += e.bible; dv.prayer += e.prayer;

    // 날짜별
    if (!dateMap[dtKey]) {
      dateMap[dtKey] = {
        date: dtKey,
        sam: 0, oh: 0, jupre: 0, juhu: 0, bible: 0, prayer: 0,
        adultSam: 0, adultOh: 0, adultJupre: 0, adultJuhu: 0,
        midSam: 0, midOh: 0, midJupre: 0, midJuhu: 0,
        bibleMale: 0, bibleFemale: 0,
      };
    }
    const dt = dateMap[dtKey];
    dt.sam += e.sam; dt.oh += e.oh; dt.jupre += e.jupre; dt.juhu += e.juhu;
    dt.bible += e.bible; dt.prayer += e.prayer;
    if (isAdult) {
      dt.adultSam += e.sam; dt.adultOh += e.oh; dt.adultJupre += e.jupre; dt.adultJuhu += e.juhu;
    } else {
      dt.midSam += e.sam; dt.midOh += e.oh; dt.midJupre += e.jupre; dt.midJuhu += e.juhu;
    }
    if (e.isMale) dt.bibleMale += e.bible; else dt.bibleFemale += e.bible;
  }

  // WeeklySummary도 함께 반환 (기존 호환)
  const summaries = await prisma.councilWeeklySummary.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({
    summaries: summaries.map((s) => ({
      ...s,
      date: s.date.toISOString().slice(0, 10),
    })),
    byGroup: Object.values(groupMap).sort((a, b) => a.groupId - b.groupId),
    byDivision: Object.values(divisionMap).sort((a, b) => a.division.localeCompare(b.division)),
    byDate: Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date)),
  });
}
