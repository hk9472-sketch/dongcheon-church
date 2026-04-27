import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/admin/posts/info?id=<postId>
// 관리자가 게시글 이동 전 확인용 정보 조회.

async function requireAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const id = parseInt(request.nextUrl.searchParams.get("id") || "0", 10);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ message: "id 가 필요합니다." }, { status: 400 });
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: { board: { select: { id: true, slug: true, title: true } } },
  });
  if (!post) {
    return NextResponse.json({ message: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }

  const treeCount = await prisma.post.count({
    where: { boardId: post.boardId, headnum: post.headnum },
  });

  return NextResponse.json({
    post: {
      id: post.id,
      subject: post.subject,
      authorName: post.authorName,
      createdAt: post.createdAt.toISOString(),
      boardId: post.boardId,
      boardSlug: post.board.slug,
      boardTitle: post.board.title,
      treeCount,
      headnum: post.headnum,
      depth: post.depth,
    },
  });
}
