import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCouncilUser } from "@/lib/council";

// GET /api/council/report-entry?groupId=1&date=2026-03-08
export async function GET(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });

  const groupId = Number(request.nextUrl.searchParams.get("groupId"));
  const dateStr = request.nextUrl.searchParams.get("date");
  if (!groupId || !dateStr) {
    return NextResponse.json({ message: "groupId, date 필수" }, { status: 400 });
  }

  const entries = await prisma.councilReportEntry.findMany({
    where: { groupId, date: new Date(dateStr) },
    orderBy: [{ division: "asc" }, { id: "asc" }],
  });

  return NextResponse.json(entries);
}

// POST /api/council/report-entry
export async function POST(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });

  const body = await request.json();
  const { groupId, date, rows } = body as {
    groupId: number;
    date: string;
    rows: {
      division: string;
      memberName: string | null;
      isMale: boolean;
      sam: number; oh: number; jupre: number; juhu: number; bible: number; prayer: number;
    }[];
  };

  if (!groupId || !date || !Array.isArray(rows)) {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  const dateVal = new Date(date);

  await prisma.$transaction(async (tx) => {
    // 기존 데이터 삭제
    await tx.councilReportEntry.deleteMany({ where: { groupId, date: dateVal } });

    // 새 데이터 삽입
    if (rows.length > 0) {
      await tx.councilReportEntry.createMany({
        data: rows.map((r) => ({
          groupId,
          date: dateVal,
          division: r.division,
          memberName: r.memberName || null,
          isMale: r.isMale ?? false,
          sam: r.sam || 0,
          oh: r.oh || 0,
          jupre: r.jupre || 0,
          juhu: r.juhu || 0,
          bible: r.bible || 0,
          prayer: r.prayer || 0,
        })),
      });
    }
  });

  return NextResponse.json({ message: "저장되었습니다." });
}
