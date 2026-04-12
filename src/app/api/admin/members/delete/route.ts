import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

async function verifyAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires < new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

// POST /api/admin/members/delete
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const { userIds } = await request.json();
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: "삭제할 회원을 선택해주세요." }, { status: 400 });
  }

  // 최고관리자(isAdmin=1)는 삭제 불가
  const protectedUsers = await prisma.user.findMany({
    where: { id: { in: userIds }, isAdmin: 1 },
    select: { id: true },
  });
  const protectedIds = new Set(protectedUsers.map((u) => u.id));
  const deletableIds = userIds.filter((id: number) => !protectedIds.has(id) && id !== admin.id);

  if (deletableIds.length === 0) {
    return NextResponse.json({ error: "삭제할 수 있는 회원이 없습니다. (최고관리자 및 본인은 삭제 불가)" }, { status: 400 });
  }

  // 관련 데이터 정리 (세션, 권한 등)
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId: { in: deletableIds } } }),
    prisma.boardUserPermission.deleteMany({ where: { userId: { in: deletableIds } } }),
    prisma.userGroupAccess.deleteMany({ where: { userId: { in: deletableIds } } }),
    prisma.postVote.deleteMany({ where: { userId: { in: deletableIds } } }),
    prisma.user.deleteMany({ where: { id: { in: deletableIds } } }),
  ]);

  const skipped = userIds.length - deletableIds.length;
  return NextResponse.json({
    message: `${deletableIds.length}명이 삭제되었습니다.${skipped > 0 ? ` (${skipped}명은 최고관리자 또는 본인이므로 제외)` : ""}`,
  });
}
