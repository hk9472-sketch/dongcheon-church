import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCouncilUser } from "@/lib/council";

// GET /api/council/report-entry/previous-names?groupId=1&division=장년
export async function GET(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });

  const groupId = Number(request.nextUrl.searchParams.get("groupId"));
  const division = request.nextUrl.searchParams.get("division") || "장년";
  if (!groupId) return NextResponse.json({ names: [] });

  // 가장 최근 날짜의 명단 가져오기
  const latest = await prisma.councilReportEntry.findFirst({
    where: { groupId, division, memberName: { not: null } },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  if (!latest) return NextResponse.json({ names: [] });

  const entries = await prisma.councilReportEntry.findMany({
    where: { groupId, division, date: latest.date, memberName: { not: null } },
    orderBy: { id: "asc" },
    select: { memberName: true, isMale: true },
  });

  const dateStr = latest.date.toISOString().slice(0, 10);
  return NextResponse.json({
    date: dateStr,
    names: entries.map((e) => ({ name: e.memberName, isMale: e.isMale })),
  });
}
