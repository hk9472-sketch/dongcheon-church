import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCouncilUser } from "@/lib/council";

// GET /api/council/attendance?groupId=1&date=2026-03-01
export async function GET(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const groupId = Number(request.nextUrl.searchParams.get("groupId"));
  const dateStr = request.nextUrl.searchParams.get("date");

  if (!groupId || !dateStr) {
    return NextResponse.json({ error: "groupId, date 필요" }, { status: 400 });
  }

  const date = new Date(dateStr + "T00:00:00Z");

  const rows = await prisma.councilAttendance.findMany({
    where: { groupId, date },
    orderBy: [{ memberName: "asc" }, { id: "asc" }],
  });

  return NextResponse.json(rows);
}

// POST /api/council/attendance — 출석 벌크 저장
// body: { groupId, date, rows: [{ memberName?, att1~5, rt1~5, note }] }
export async function POST(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const body = await request.json();
  const { groupId, date: dateStr, rows } = body as {
    groupId: number;
    date: string;
    rows: Array<{
      id?: number;
      memberName?: string | null;
      att1: number; att2: number; att3: number; att4: number; att5: number;
      rt1: number; rt2: number; rt3: number; rt4: number; rt5: number;
      note?: string | null;
    }>;
  };

  if (!groupId || !dateStr || !Array.isArray(rows)) {
    return NextResponse.json({ error: "groupId, date, rows 필요" }, { status: 400 });
  }

  const date = new Date(dateStr + "T00:00:00Z");

  // 집계 행(memberName=null) 중복 방지: rows에서 null인 것이 2개 이상이면 에러
  const aggregateRows = rows.filter((r) => !r.memberName);
  if (aggregateRows.length > 1) {
    return NextResponse.json({ error: "집계 행은 구역당 1개만 허용됩니다." }, { status: 400 });
  }

  // 기존 데이터 삭제 후 새로 저장 (해당 구역+날짜 전체)
  await prisma.$transaction([
    prisma.councilAttendance.deleteMany({
      where: { groupId, date },
    }),
    ...rows.map((row) =>
      prisma.councilAttendance.create({
        data: {
          groupId,
          date,
          memberName: row.memberName || null,
          att1: row.att1 ?? 0,
          att2: row.att2 ?? 0,
          att3: row.att3 ?? 0,
          att4: row.att4 ?? 0,
          att5: row.att5 ?? 0,
          rt1: row.rt1 ?? 0,
          rt2: row.rt2 ?? 0,
          rt3: row.rt3 ?? 0,
          rt4: row.rt4 ?? 0,
          rt5: row.rt5 ?? 0,
          note: row.note || null,
        },
      })
    ),
  ]);

  return NextResponse.json({ success: true });
}
