import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCouncilUser } from "@/lib/council";

/**
 * GET /api/council/overall-history?date=YYYY-MM-DD
 *   → 단일 일자의 전체출석보고 (구역별 + 반사별 + 주간요약).
 *
 * GET /api/council/overall-history?from=&to=
 *   → 기간 내 모든 일자의 데이터 + 일자별 합계 + 기간 합계.
 */
export async function GET(req: NextRequest) {
  const me = await getCouncilUser();
  if (!me) return NextResponse.json({ message: "권한 없음" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const dateStr = sp.get("date");
  const from = sp.get("from");
  const to = sp.get("to");

  if (dateStr) {
    // 단일 일자
    const date = new Date(dateStr + "T00:00:00.000Z");
    const [districtRows, teacherRows, weekly] = await Promise.all([
      prisma.councilDistrictSummary.findMany({
        where: { date },
        include: { group: { select: { id: true, name: true, sortOrder: true } } },
        orderBy: { groupId: "asc" },
      }),
      prisma.councilTeacherSummary.findMany({
        where: { date },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.councilWeeklySummary.findUnique({ where: { date } }),
    ]);

    return NextResponse.json({
      date: dateStr,
      districts: districtRows.map((r) => ({
        groupId: r.groupId,
        groupName: r.group?.name || `구역#${r.groupId}`,
        adultSam: r.adultSam, adultOh: r.adultOh, adultJupre: r.adultJupre, adultJuhu: r.adultJuhu,
        midSam: r.midSam, midOh: r.midOh, midJupre: r.midJupre, midJuhu: r.midJuhu,
        bible: r.bibleMale, prayer: r.prayer,
      })),
      teachers: teacherRows.map((r) => ({
        sortOrder: r.sortOrder,
        className: r.className,
        teacherName: r.teacherName,
        jugyo: r.jugyo,
        midJugyo1: r.midJugyo1,
        midJugyo2: r.midJugyo2,
        midMiddle: r.midMiddle,
        midAdult: r.midAdult,
        jugyoAfternoon: r.jugyoAfternoon,
      })),
      weekly,
    });
  }

  if (from && to) {
    const startDate = new Date(from + "T00:00:00.000Z");
    const endDate = new Date(to + "T23:59:59.999Z");

    const weeklies = await prisma.councilWeeklySummary.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      orderBy: { date: "desc" },
    });

    // 일자별 구역 합계 (총원 = 장년반계 + 중간반계)
    const districts = await prisma.councilDistrictSummary.groupBy({
      by: ["date"],
      where: { date: { gte: startDate, lte: endDate } },
      _sum: {
        adultSam: true, adultOh: true, adultJupre: true, adultJuhu: true,
        midSam: true, midOh: true, midJupre: true, midJuhu: true,
        bibleMale: true, prayer: true,
      },
    });

    const teachers = await prisma.councilTeacherSummary.groupBy({
      by: ["date"],
      where: { date: { gte: startDate, lte: endDate } },
      _sum: {
        jugyo: true, midJugyo1: true, midJugyo2: true, midMiddle: true, midAdult: true,
        jugyoAfternoon: true,
      },
    });

    // 일자별 통합 객체
    const byDate = new Map<string, {
      date: string;
      weekly: typeof weeklies[number] | null;
      district: typeof districts[number] | null;
      teacher: typeof teachers[number] | null;
    }>();
    const upsert = (date: Date) => {
      const k = date.toISOString().slice(0, 10);
      if (!byDate.has(k)) byDate.set(k, { date: k, weekly: null, district: null, teacher: null });
      return byDate.get(k)!;
    };
    for (const w of weeklies) upsert(w.date).weekly = w;
    for (const d of districts) upsert(d.date).district = d;
    for (const t of teachers) upsert(t.date).teacher = t;

    const list = Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
    return NextResponse.json({ from, to, list });
  }

  return NextResponse.json({ message: "date 또는 from/to 필요" }, { status: 400 });
}
