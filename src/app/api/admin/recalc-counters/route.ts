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

// POST /api/admin/recalc-counters
// Board.totalPosts / Post.totalComment drift 재계산
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  // 1) Board.totalPosts = COUNT(posts WHERE boardId = board.id)
  const boards = await prisma.board.findMany({ select: { id: true, totalPosts: true } });
  let boardUpdated = 0;
  for (const b of boards) {
    const actual = await prisma.post.count({ where: { boardId: b.id } });
    if (actual !== b.totalPosts) {
      await prisma.board.update({ where: { id: b.id }, data: { totalPosts: actual } });
      boardUpdated++;
    }
  }

  // 2) Post.totalComment = COUNT(comments WHERE postId = post.id)
  // 전체 post 순회는 비용이 크므로 group by 로 한 번에 계산
  const commentGroups = await prisma.comment.groupBy({
    by: ["postId"],
    _count: { _all: true },
  });
  const countByPost = new Map<number, number>();
  for (const g of commentGroups) countByPost.set(g.postId, g._count._all);

  // drift가 있는 post만 업데이트 (totalComment != actual)
  // 실제 댓글이 0개인데 totalComment > 0인 경우도 처리
  const postsWithCount = await prisma.post.findMany({
    select: { id: true, totalComment: true },
  });
  let postUpdated = 0;
  for (const p of postsWithCount) {
    const actual = countByPost.get(p.id) ?? 0;
    if (actual !== p.totalComment) {
      await prisma.post.update({
        where: { id: p.id },
        data: { totalComment: actual },
      });
      postUpdated++;
    }
  }

  return NextResponse.json({
    message: `재계산 완료: Board ${boardUpdated}건, Post ${postUpdated}건 보정.`,
    boardUpdated,
    postUpdated,
  });
}
