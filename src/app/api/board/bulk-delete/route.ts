import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// POST /api/board/bulk-delete — 관리자 일괄 삭제
export async function POST(request: NextRequest) {
  try {
    // 세션 확인
    const sessionToken = request.cookies.get("dc_session")?.value;
    if (!sessionToken) {
      return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }

    const session = await prisma.session.findUnique({ where: { sessionToken } });
    if (!session || session.expires < new Date()) {
      return NextResponse.json({ message: "세션이 만료되었습니다." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.isAdmin > 2) {
      return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
    }

    const { postIds, boardSlug } = await request.json();
    if (!Array.isArray(postIds) || postIds.length === 0) {
      return NextResponse.json({ message: "삭제할 게시글을 선택해주세요." }, { status: 400 });
    }

    // 게시판 확인
    const board = await prisma.board.findUnique({ where: { slug: boardSlug } });
    if (!board) {
      return NextResponse.json({ message: "게시판을 찾을 수 없습니다." }, { status: 404 });
    }

    // 해당 게시판의 게시글만 삭제 대상
    const posts = await prisma.post.findMany({
      where: { id: { in: postIds }, boardId: board.id },
      select: { id: true },
    });

    const validIds = posts.map((p) => p.id);
    if (validIds.length === 0) {
      return NextResponse.json({ message: "삭제할 게시글이 없습니다." }, { status: 404 });
    }

    // 댓글 삭제
    await prisma.comment.deleteMany({ where: { postId: { in: validIds } } });

    // 게시글 삭제
    const result = await prisma.post.deleteMany({ where: { id: { in: validIds } } });

    // 게시판 글 수 감소
    await prisma.board.update({
      where: { id: board.id },
      data: { totalPosts: { decrement: result.count } },
    });

    return NextResponse.json({ success: true, deletedCount: result.count });
  } catch (error) {
    console.error("Bulk delete error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
