import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCouncilUser } from "@/lib/council";

// GET /api/council/attendance/previous-names?groupId=X
// 해당 구역의 가장 최근 날짜에 저장된 이름 목록을 반환
export async function GET(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const groupId = Number(request.nextUrl.searchParams.get("groupId"));
  if (!groupId) {
    return NextResponse.json({ error: "groupId 필요" }, { status: 400 });
  }

  // 가장 최근 날짜에 이름이 있는 출석 데이터 찾기
  const latest = await prisma.councilAttendance.findFirst({
    where: { groupId, NOT: { memberName: null } },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  if (!latest) {
    return NextResponse.json({ names: [], date: null });
  }

  // 해당 날짜의 이름 목록 (null 제외)
  const rows = await prisma.councilAttendance.findMany({
    where: { groupId, date: latest.date, NOT: { memberName: null } },
    orderBy: { id: "asc" },
    select: { memberName: true },
  });

  const names = rows.map((r) => r.memberName).filter(Boolean);
  return NextResponse.json({
    names,
    date: latest.date.toISOString().slice(0, 10),
  });
}
