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

// GET /api/admin/members/[id] - 회원 정보 + 게시판별 권한
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ message: "권한 없음" }, { status: 403 });

  const { id } = await params;
  const userId = parseInt(id, 10);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      userId: true,
      name: true,
      email: true,
      level: true,
      isAdmin: true,
      councilAccess: true,
      accountAccess: true,
      accLedgerAccess: true,
      accOfferingAccess: true,
      accDuesAccess: true,
      accMemberEditAccess: true,
      phone: true,
      createdAt: true,
      boardPermissions: {
        include: { board: { select: { id: true, slug: true, title: true } } },
      },
    },
  });

  if (!user) return NextResponse.json({ message: "회원 없음" }, { status: 404 });

  // 전체 게시판 목록도 함께 반환
  const boards = await prisma.board.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, slug: true, title: true },
  });

  // 구역 접근 권한 + 전체 구역 목록
  const groupAccess = await prisma.userGroupAccess.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const councilDepts = await prisma.councilDept.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      groups: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json({
    user,
    boards,
    groupAccess: groupAccess.map((a) => a.groupId),
    councilDepts,
  });
}

// PUT /api/admin/members/[id] - 회원 권한 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ message: "권한 없음" }, { status: 403 });

  const { id } = await params;
  const userId = parseInt(id, 10);
  const body = await request.json();

  try {
    // 회원편집에서 더 이상 level 을 직접 받지 않음 — isAdmin 등급으로부터 자동 계산.
    //  · isAdmin=1 (전체관리자) → level=1
    //  · isAdmin=2 (그룹관리자) → level=2
    //  · isAdmin=3 (일반회원)
    //      ㄴ 기존 level 이 1 또는 2 (관리자였다가 강등) → 9 로 조정
    //      ㄴ 그 외 (3~99, 기존 일반회원/세분화 레벨) → 보존
    //  · body.level 이 명시적으로 들어오면 그 값을 우선 적용 (운영툴/마이그레이션 호환)
    const targetAdmin = body.isAdmin ?? 3;
    let targetLevel: number;
    if (typeof body.level === "number") {
      targetLevel = body.level;
    } else if (targetAdmin === 1) {
      targetLevel = 1;
    } else if (targetAdmin === 2) {
      targetLevel = 2;
    } else {
      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { level: true },
      });
      const cur = existing?.level ?? 10;
      targetLevel = cur <= 2 ? 9 : cur;
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        isAdmin: targetAdmin,
        level: targetLevel,
        councilAccess: body.councilAccess ?? false,
        accountAccess: (body.accLedgerAccess || body.accOfferingAccess) ?? false,
        accLedgerAccess: body.accLedgerAccess ?? false,
        accOfferingAccess: body.accOfferingAccess ?? false,
        accDuesAccess: body.accDuesAccess ?? false,
        accMemberEditAccess: body.accMemberEditAccess ?? false,
      },
    });

    // 게시판별 권한 처리
    if (Array.isArray(body.boardPermissions)) {
      // 기존 권한 삭제 후 새로 생성
      await prisma.boardUserPermission.deleteMany({ where: { userId } });

      const permissionsToCreate = body.boardPermissions
        .filter((p: { canEdit: boolean; canDelete: boolean }) => p.canEdit || p.canDelete)
        .map((p: { boardId: number; canEdit: boolean; canDelete: boolean }) => ({
          userId,
          boardId: p.boardId,
          canEdit: p.canEdit || false,
          canDelete: p.canDelete || false,
        }));

      if (permissionsToCreate.length > 0) {
        await prisma.boardUserPermission.createMany({ data: permissionsToCreate });
      }
    }

    // 구역 접근 권한 처리
    if (Array.isArray(body.groupAccessIds)) {
      await prisma.userGroupAccess.deleteMany({ where: { userId } });
      if (body.groupAccessIds.length > 0) {
        await prisma.userGroupAccess.createMany({
          data: body.groupAccessIds.map((gid: number) => ({ userId, groupId: gid })),
          skipDuplicates: true,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Member update error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
