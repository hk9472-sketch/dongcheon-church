import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// 관리자 인증 헬퍼
async function verifyAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires < new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

// GET /api/admin/boards - 전체 게시판 목록
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ message: "권한 없음" }, { status: 403 });

  const boards = await prisma.board.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { group: { select: { name: true } } },
  });
  return NextResponse.json(boards);
}

// POST /api/admin/boards - 게시판 생성
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ message: "권한 없음" }, { status: 403 });

  try {
    const body = await request.json();

    // slug 중복 확인
    const existing = await prisma.board.findUnique({ where: { slug: body.slug } });
    if (existing) {
      return NextResponse.json({ message: "이미 존재하는 게시판 ID입니다." }, { status: 409 });
    }

    // 기본 그룹
    let group = await prisma.group.findFirst();
    if (!group) {
      group = await prisma.group.create({
        data: { name: "동천교회", isOpen: true, useJoin: true, joinLevel: 9 },
      });
    }

    const board = await prisma.board.create({
      data: {
        slug: body.slug,
        title: body.title,
        boardType: body.boardType || "BBS",
        skinName: body.skinName || null,
        groupId: group.id,
        postsPerPage: body.postsPerPage || 15,
        pagesPerBlock: body.pagesPerBlock || 8,
        useCategory: body.useCategory ?? false,
        useComment: body.useComment ?? true,
        defaultCommentPolicy: body.defaultCommentPolicy || "ALLOW_EDIT",
        useSecret: body.useSecret ?? true,
        useReply: body.useReply ?? true,
        useHtml: body.useHtml ?? true,
        useFileUpload: body.useFileUpload ?? false,
        useAutolink: body.useAutolink ?? true,
        useShowIp: body.useShowIp ?? false,
        maxUploadSize: body.maxUploadSize || 2097152,
        grantList: body.grantList ?? 10,
        grantView: body.grantView ?? 10,
        grantWrite: body.grantWrite ?? 10,
        grantComment: body.grantComment ?? 10,
        grantReply: body.grantReply ?? 10,
        grantDelete: body.grantDelete ?? 1,
        grantNotice: body.grantNotice ?? 1,
        grantViewSecret: body.grantViewSecret ?? 1,
        sortOrder: body.sortOrder ?? 0,
        showInMenu: body.showInMenu ?? true,
        showOnMain: body.showOnMain ?? true,
        requireLogin: body.requireLogin ?? false,
      },
    });

    // 카테고리 생성
    if (body.categories && Array.isArray(body.categories) && body.categories.length > 0) {
      await prisma.category.createMany({
        data: body.categories.map((name: string, idx: number) => ({
          boardId: board.id,
          name,
          sortOrder: idx,
        })),
      });
    }

    return NextResponse.json({ id: board.id, slug: board.slug });
  } catch (error) {
    console.error("Board create error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
