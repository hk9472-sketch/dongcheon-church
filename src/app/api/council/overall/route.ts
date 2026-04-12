import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCouncilUser } from "@/lib/council";

// GET /api/council/overall?date=2026-03-08
export async function GET(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });

  const dateStr = request.nextUrl.searchParams.get("date");
  if (!dateStr) return NextResponse.json({ message: "date 필수" }, { status: 400 });

  const dateVal = new Date(dateStr);

  // 전주 날짜 (7일 전)
  const prevDate = new Date(dateVal);
  prevDate.setDate(prevDate.getDate() - 7);

  // 1. 구역별성적 — 저장된 summary 또는 권찰보고서에서 집계
  const allGroups = await prisma.councilGroup.findMany({
    include: { dept: true },
    orderBy: [{ dept: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  // 저장된 district summaries
  const savedDistrict = await prisma.councilDistrictSummary.findMany({
    where: { date: dateVal },
  });
  const savedDistrictMap = new Map(savedDistrict.map((s) => [s.groupId, s]));

  // 전주 district summaries
  const prevDistrict = await prisma.councilDistrictSummary.findMany({
    where: { date: prevDate },
  });
  const prevDistrictMap = new Map(prevDistrict.map((s) => [s.groupId, s]));

  // 권찰보고서에서 구역별 합계 계산 (저장된 summary가 없을 때 사용)
  const reportEntries = await prisma.councilReportEntry.findMany({
    where: { date: dateVal },
  });

  // groupId -> { division -> sums (남/여 성경 분리) }
  interface DivAgg { sam: number; oh: number; jupre: number; juhu: number; bibleMale: number; bibleFemale: number; prayer: number }
  const reportAgg: Record<number, Record<string, DivAgg>> = {};
  for (const e of reportEntries) {
    if (!reportAgg[e.groupId]) reportAgg[e.groupId] = {};
    if (!reportAgg[e.groupId][e.division]) {
      reportAgg[e.groupId][e.division] = { sam: 0, oh: 0, jupre: 0, juhu: 0, bibleMale: 0, bibleFemale: 0, prayer: 0 };
    }
    // memberName이 있는 행만 합산 (합계행 제외)
    if (e.memberName) {
      const agg = reportAgg[e.groupId][e.division];
      agg.sam += e.sam; agg.oh += e.oh; agg.jupre += e.jupre;
      agg.juhu += e.juhu; agg.prayer += e.prayer;
      if (e.isMale) {
        agg.bibleMale += e.bible;
      } else {
        agg.bibleFemale += e.bible;
      }
    }
  }

  const districtData = allGroups.map((g) => {
    const saved = savedDistrictMap.get(g.id);
    const prev = prevDistrictMap.get(g.id);
    const fromReport = reportAgg[g.id];

    // 저장된 값 우선, 없으면 권찰보고서에서 계산
    const adultSam = saved?.adultSam ?? fromReport?.["장년"]?.sam ?? 0;
    const adultOh = saved?.adultOh ?? fromReport?.["장년"]?.oh ?? 0;
    const adultJupre = saved?.adultJupre ?? fromReport?.["장년"]?.jupre ?? 0;
    const adultJuhu = saved?.adultJuhu ?? fromReport?.["장년"]?.juhu ?? 0;
    const midSam = saved?.midSam ?? fromReport?.["중간"]?.sam ?? 0;
    const midOh = saved?.midOh ?? fromReport?.["중간"]?.oh ?? 0;
    const midJupre = saved?.midJupre ?? fromReport?.["중간"]?.jupre ?? 0;
    const midJuhu = saved?.midJuhu ?? fromReport?.["중간"]?.juhu ?? 0;
    const bibleMale = saved?.bibleMale ?? ((fromReport?.["장년"]?.bibleMale ?? 0) + (fromReport?.["중간"]?.bibleMale ?? 0));
    const bibleFemale = saved?.bibleFemale ?? ((fromReport?.["장년"]?.bibleFemale ?? 0) + (fromReport?.["중간"]?.bibleFemale ?? 0));
    const prayer = saved?.prayer ?? (fromReport?.["장년"]?.prayer ?? 0) + (fromReport?.["중간"]?.prayer ?? 0);

    // 전주 총계 = 장년반계+중간반계
    const prevAdultTotal = prev ? (prev.adultSam + prev.adultOh + prev.adultJupre + prev.adultJuhu) : 0;
    const prevMidTotal = prev ? (prev.midSam + prev.midOh + prev.midJupre + prev.midJuhu) : 0;

    return {
      groupId: g.id,
      groupName: g.name,
      adultSam, adultOh, adultJupre, adultJuhu,
      midSam, midOh, midJupre, midJuhu,
      bibleMale, bibleFemale, prayer,
      // 전주 값
      prevAdultJupre: prev?.adultJupre ?? 0,
      prevMidJupre: prev?.midJupre ?? 0,
      prevGrandTotal: prevAdultTotal + prevMidTotal,
    };
  });

  // 2. 반사별성적
  const savedTeacher = await prisma.councilTeacherSummary.findMany({
    where: { date: dateVal },
    orderBy: { sortOrder: "asc" },
  });

  const prevTeacher = await prisma.councilTeacherSummary.findMany({
    where: { date: prevDate },
  });
  const prevTeacherMap = new Map(prevTeacher.map((t) => [t.teacherName, t]));

  const teacherData = savedTeacher.map((t) => {
    const prev = prevTeacherMap.get(t.teacherName);
    const prevTotal = prev ? (prev.jugyo + prev.midJugyo1 + prev.midJugyo2 + prev.midMiddle + prev.midAdult) : 0;
    return {
      teacherName: t.teacherName,
      className: t.className || "",
      sortOrder: t.sortOrder,
      jugyo: t.jugyo,
      midJugyo1: t.midJugyo1,
      midJugyo2: t.midJugyo2,
      midMiddle: t.midMiddle,
      midAdult: t.midAdult,
      jugyoAfternoon: t.jugyoAfternoon,
      prevTotal,
    };
  });

  // 전주 반사 명단 (불러오기용) - className도 포함
  const prevTeacherList = prevTeacher.map((t) => ({ teacherName: t.teacherName, className: t.className || "" }));

  // 3. 전체출석요약
  const savedSummary = await prisma.councilWeeklySummary.findUnique({
    where: { date: dateVal },
  });
  const prevSummary = await prisma.councilWeeklySummary.findUnique({
    where: { date: prevDate },
  });

  // 요약이 없으면 구역별 합계에서 계산
  const districtTotals = {
    sam: districtData.reduce((s, d) => s + d.adultSam + d.midSam, 0),
    oh: districtData.reduce((s, d) => s + d.adultOh + d.midOh, 0),
    amAdult: districtData.reduce((s, d) => s + d.adultJupre, 0),
    amMid: districtData.reduce((s, d) => s + d.midJupre, 0),
    pmAdult: districtData.reduce((s, d) => s + d.adultJuhu, 0),
    pmMid: districtData.reduce((s, d) => s + d.midJuhu, 0),
    maleBible: districtData.reduce((s, d) => s + d.bibleMale, 0),
    femaleBible: districtData.reduce((s, d) => s + d.bibleFemale, 0),
  };

  const summary = {
    sam: savedSummary?.sam ?? districtTotals.sam,
    oh: savedSummary?.oh ?? districtTotals.oh,
    amAdult: savedSummary?.amAdult ?? districtTotals.amAdult,
    amMid: savedSummary?.amMid ?? districtTotals.amMid,
    pmAdult: savedSummary?.pmAdult ?? districtTotals.pmAdult,
    pmMid: savedSummary?.pmMid ?? districtTotals.pmMid,
    jugyo: savedSummary?.jugyo ?? 0,
    midService: savedSummary?.midService ?? 0,
    dawn: savedSummary?.dawn ?? 0,
    maleBible: savedSummary?.maleBible ?? districtTotals.maleBible,
    femaleBible: savedSummary?.femaleBible ?? districtTotals.femaleBible,
    afternoonSermon: savedSummary?.afternoonSermon ?? "",
    // 전주
    prevSam: prevSummary?.sam ?? 0,
    prevOh: prevSummary?.oh ?? 0,
    prevAmAdult: prevSummary?.amAdult ?? 0,
    prevAmMid: prevSummary?.amMid ?? 0,
    prevPmAdult: prevSummary?.pmAdult ?? 0,
    prevPmMid: prevSummary?.pmMid ?? 0,
    prevJugyo: prevSummary?.jugyo ?? 0,
    prevMidService: prevSummary?.midService ?? 0,
    prevDawn: prevSummary?.dawn ?? 0,
  };

  return NextResponse.json({ summary, districtData, teacherData, prevTeacherList });
}

// POST /api/council/overall — 전체출석보고 저장
export async function POST(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });

  const body = await request.json();
  const { date, summary, districtData, teacherData } = body;

  if (!date) return NextResponse.json({ message: "date 필수" }, { status: 400 });
  const dateVal = new Date(date);

  await prisma.$transaction(async (tx) => {
    // 전체출석요약 저장
    if (summary) {
      await tx.councilWeeklySummary.upsert({
        where: { date: dateVal },
        update: {
          sam: summary.sam ?? 0, oh: summary.oh ?? 0,
          amAdult: summary.amAdult ?? 0, amMid: summary.amMid ?? 0,
          pmAdult: summary.pmAdult ?? 0, pmMid: summary.pmMid ?? 0,
          jugyo: summary.jugyo ?? 0, midService: summary.midService ?? 0,
          dawn: summary.dawn ?? 0, maleBible: summary.maleBible ?? 0, femaleBible: summary.femaleBible ?? 0,
          afternoonSermon: summary.afternoonSermon || null,
        },
        create: {
          date: dateVal,
          sam: summary.sam ?? 0, oh: summary.oh ?? 0,
          amAdult: summary.amAdult ?? 0, amMid: summary.amMid ?? 0,
          pmAdult: summary.pmAdult ?? 0, pmMid: summary.pmMid ?? 0,
          jugyo: summary.jugyo ?? 0, midService: summary.midService ?? 0,
          dawn: summary.dawn ?? 0, maleBible: summary.maleBible ?? 0, femaleBible: summary.femaleBible ?? 0,
          afternoonSermon: summary.afternoonSermon || null,
        },
      });
    }

    // 구역별성적 저장
    if (Array.isArray(districtData)) {
      for (const d of districtData) {
        await tx.councilDistrictSummary.upsert({
          where: { date_groupId: { date: dateVal, groupId: d.groupId } },
          update: {
            adultSam: d.adultSam ?? 0, adultOh: d.adultOh ?? 0,
            adultJupre: d.adultJupre ?? 0, adultJuhu: d.adultJuhu ?? 0,
            midSam: d.midSam ?? 0, midOh: d.midOh ?? 0,
            midJupre: d.midJupre ?? 0, midJuhu: d.midJuhu ?? 0,
            bibleMale: d.bibleMale ?? 0, bibleFemale: d.bibleFemale ?? 0, prayer: d.prayer ?? 0,
          },
          create: {
            date: dateVal, groupId: d.groupId,
            adultSam: d.adultSam ?? 0, adultOh: d.adultOh ?? 0,
            adultJupre: d.adultJupre ?? 0, adultJuhu: d.adultJuhu ?? 0,
            midSam: d.midSam ?? 0, midOh: d.midOh ?? 0,
            midJupre: d.midJupre ?? 0, midJuhu: d.midJuhu ?? 0,
            bibleMale: d.bibleMale ?? 0, bibleFemale: d.bibleFemale ?? 0, prayer: d.prayer ?? 0,
          },
        });
      }
    }

    // 반사별성적 저장
    if (Array.isArray(teacherData)) {
      // 기존 데이터 삭제 후 재삽입
      await tx.councilTeacherSummary.deleteMany({ where: { date: dateVal } });
      if (teacherData.length > 0) {
        await tx.councilTeacherSummary.createMany({
          data: teacherData.map((t: Record<string, unknown>, i: number) => ({
            date: dateVal,
            sortOrder: typeof t.sortOrder === "number" ? t.sortOrder : i,
            className: (t.className as string) || "",
            teacherName: (t.teacherName as string) || "",
            jugyo: (t.jugyo as number) ?? 0,
            midJugyo1: (t.midJugyo1 as number) ?? 0,
            midJugyo2: (t.midJugyo2 as number) ?? 0,
            midMiddle: (t.midMiddle as number) ?? 0,
            midAdult: (t.midAdult as number) ?? 0,
            jugyoAfternoon: (t.jugyoAfternoon as number) ?? 0,
          })),
        });
      }
    }
  });

  return NextResponse.json({ message: "저장되었습니다." });
}
