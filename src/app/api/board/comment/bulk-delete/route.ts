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

// POST /api/board/comment/bulk-delete
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  try {
    const { commentIds } = await request.json();

    if (!Array.isArray(commentIds) || commentIds.length === 0) {
      return NextResponse.json({ message: "삭제할 댓글을 선택하세요." }, { status: 400 });
    }

    // 삭제 대상 댓글 조회 (postId별 댓글 수 감소를 위해)
    const comments = await prisma.comment.findMany({
      where: { id: { in: commentIds } },
      select: { id: true, postId: true },
    });

    if (comments.length === 0) {
      return NextResponse.json({ message: "삭제할 댓글이 없습니다." }, { status: 404 });
    }

    // postId별 삭제 댓글 수 집계
    const postCountMap = new Map<number, number>();
    for (const c of comments) {
      postCountMap.set(c.postId, (postCountMap.get(c.postId) || 0) + 1);
    }

    // 댓글 삭제
    await prisma.comment.deleteMany({
      where: { id: { in: comments.map((c) => c.id) } },
    });

    // 게시글별 댓글 수 감소 (updateMany로 @updatedAt 자동 갱신 회피)
    for (const [postId, count] of postCountMap) {
      await prisma.post.updateMany({
        where: { id: postId },
        data: { totalComment: { decrement: count } },
      });
    }

    return NextResponse.json({ deleted: comments.length });
  } catch (error) {
    console.error("Bulk delete comments error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
