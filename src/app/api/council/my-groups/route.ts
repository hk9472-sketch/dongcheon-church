import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/council/my-groups - 현재 사용자가 접근 가능한 구역 목록
export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ message: "로그인 필요" }, { status: 401 });
  }

  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) {
    return NextResponse.json({ message: "세션 만료" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || (!user.councilAccess && user.isAdmin > 2)) {
    return NextResponse.json({ message: "권한 없음" }, { status: 403 });
  }

  // 관리자는 모든 구역 접근 가능
  if (user.isAdmin <= 2) {
    return NextResponse.json({ isAdmin: true, groupIds: [] });
  }

  // 일반 사용자: 매핑된 구역만
  const accesses = await prisma.userGroupAccess.findMany({
    where: { userId: user.id },
    select: { groupId: true },
  });

  return NextResponse.json({
    isAdmin: false,
    groupIds: accesses.map((a: { groupId: number }) => a.groupId),
  });
}
