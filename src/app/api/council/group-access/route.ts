import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

async function requireAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

// GET /api/council/group-access - 전체 매핑 목록 (관리자)
// GET /api/council/group-access?userId=X - 특정 사용자의 매핑
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const userId = request.nextUrl.searchParams.get("userId");

  if (userId) {
    const accesses = await prisma.userGroupAccess.findMany({
      where: { userId: Number(userId) },
      include: { group: { include: { dept: true } } },
      orderBy: { group: { sortOrder: "asc" } },
    });
    return NextResponse.json(accesses);
  }

  // 전체 목록 (사용자별 그룹핑)
  const accesses = await prisma.userGroupAccess.findMany({
    include: {
      user: { select: { id: true, userId: true, name: true } },
      group: { include: { dept: { select: { name: true } } } },
    },
    orderBy: [{ userId: "asc" }, { group: { sortOrder: "asc" } }],
  });

  return NextResponse.json(accesses);
}

// POST /api/council/group-access - 매핑 추가
// body: { userId: number, groupIds: number[] }
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { userId, groupIds } = await request.json();
  if (!userId || !Array.isArray(groupIds)) {
    return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
  }

  // 기존 매핑 삭제 후 새로 생성
  await prisma.userGroupAccess.deleteMany({ where: { userId: Number(userId) } });

  if (groupIds.length > 0) {
    await prisma.userGroupAccess.createMany({
      data: groupIds.map((gid: number) => ({ userId: Number(userId), groupId: gid })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ message: "저장되었습니다." });
}
