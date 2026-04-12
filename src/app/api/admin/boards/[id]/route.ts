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

// GET /api/admin/boards/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ message: "권한 없음" }, { status: 403 });

  const { id } = await params;
  const board = await prisma.board.findUnique({
    where: { id: parseInt(id, 10) },
    include: { categories: { orderBy: { sortOrder: "asc" } } },
  });
  if (!board) return NextResponse.json({ message: "게시판 없음" }, { status: 404 });

  return NextResponse.json(board);
}

// PUT /api/admin/boards/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ message: "권한 없음" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  try {
    const board = await prisma.board.update({
      where: { id: parseInt(id, 10) },
      data: {
        title: body.title,
        boardType: body.boardType,
        skinName: body.skinName || null,
        postsPerPage: body.postsPerPage,
        pagesPerBlock: body.pagesPerBlock,
        useCategory: body.useCategory,
        useComment: body.useComment,
        defaultCommentPolicy: body.defaultCommentPolicy,
        useSecret: body.useSecret,
        useReply: body.useReply,
        useHtml: body.useHtml,
        useFileUpload: body.useFileUpload,
        useAutolink: body.useAutolink,
        useShowIp: body.useShowIp,
        maxUploadSize: body.maxUploadSize,
        grantList: body.grantList,
        grantView: body.grantView,
        grantWrite: body.grantWrite,
        grantComment: body.grantComment,
        grantReply: body.grantReply,
        grantDelete: body.grantDelete,
        grantNotice: body.grantNotice,
        grantViewSecret: body.grantViewSecret,
        sortOrder: body.sortOrder,
        showInMenu: body.showInMenu,
        showOnMain: body.showOnMain,
        requireLogin: body.requireLogin,
        guideText: body.guideText ?? null,
      },
    });

    // 카테고리 업데이트
    if (body.categories && Array.isArray(body.categories)) {
      const boardIdNum = parseInt(id, 10);
      const incoming = body.categories as { id?: number; name: string }[];

      // 기존 카테고리 ID 목록
      const existing = await prisma.category.findMany({
        where: { boardId: boardIdNum },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((c) => c.id));
      const incomingIds = new Set(incoming.filter((c) => c.id).map((c) => c.id!));

      // 삭제: 기존에 있지만 incoming에 없는 카테고리
      const toDelete = [...existingIds].filter((eid) => !incomingIds.has(eid));
      if (toDelete.length > 0) {
        // 삭제되는 카테고리의 게시글은 카테고리 null로 변경
        await prisma.post.updateMany({
          where: { categoryId: { in: toDelete } },
          data: { categoryId: null },
        });
        await prisma.category.deleteMany({
          where: { id: { in: toDelete } },
        });
      }

      // 업데이트/생성
      for (let idx = 0; idx < incoming.length; idx++) {
        const cat = incoming[idx];
        if (cat.id && existingIds.has(cat.id)) {
          // 기존 카테고리 업데이트
          await prisma.category.update({
            where: { id: cat.id },
            data: { name: cat.name, sortOrder: idx },
          });
        } else {
          // 새 카테고리 생성
          await prisma.category.create({
            data: { boardId: boardIdNum, name: cat.name, sortOrder: idx },
          });
        }
      }
    }

    return NextResponse.json(board);
  } catch (error) {
    console.error("Board update error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}

// DELETE /api/admin/boards/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ message: "권한 없음" }, { status: 403 });

  const { id } = await params;
  const boardId = parseInt(id, 10);

  try {
    // 댓글 → 게시글 → 카테고리 → 게시판 순서로 삭제
    const posts = await prisma.post.findMany({
      where: { boardId },
      select: { id: true },
    });
    const postIds = posts.map((p) => p.id);

    if (postIds.length > 0) {
      await prisma.comment.deleteMany({ where: { postId: { in: postIds } } });
    }
    await prisma.post.deleteMany({ where: { boardId } });
    await prisma.category.deleteMany({ where: { boardId } });
    await prisma.board.delete({ where: { id: boardId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Board delete error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
