import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// POST /api/admin/posts/move
// body: { postId: number, targetBoardId: number }
// 게시글(과 그 답글 트리) 을 다른 게시판으로 이동.
// headnum: 같은 보드에서 같은 headnum 을 공유하는 글들이 한 트리.
// 대상 보드의 새 headnum 발급 (min - 1, ZB 관례 음수)

async function requireAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const postId = Number(body?.postId);
  const targetBoardId = Number(body?.targetBoardId);
  if (!postId || !targetBoardId || Number.isNaN(postId) || Number.isNaN(targetBoardId)) {
    return NextResponse.json(
      { message: "postId, targetBoardId 가 필요합니다." },
      { status: 400 }
    );
  }

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    return NextResponse.json({ message: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }
  const target = await prisma.board.findUnique({ where: { id: targetBoardId } });
  if (!target) {
    return NextResponse.json({ message: "대상 게시판을 찾을 수 없습니다." }, { status: 404 });
  }
  if (post.boardId === targetBoardId) {
    return NextResponse.json(
      { message: "이미 같은 게시판입니다." },
      { status: 400 }
    );
  }

  // 트리 멤버 (같은 boardId + headnum 의 모든 글)
  const members = await prisma.post.findMany({
    where: { boardId: post.boardId, headnum: post.headnum },
    select: { id: true },
  });
  if (members.length === 0) {
    return NextResponse.json({ message: "이동할 글이 없습니다." }, { status: 404 });
  }

  // 대상 보드의 새 headnum — 음수 관례 (min - 1)
  const minAgg = await prisma.post.aggregate({
    _min: { headnum: true },
    where: { boardId: targetBoardId },
  });
  const newHeadnum = (minAgg._min.headnum ?? 0) - 1;

  // 트랜잭션으로 일괄 이동
  await prisma.$transaction(
    members.map((m) =>
      prisma.post.update({
        where: { id: m.id },
        data: { boardId: targetBoardId, headnum: newHeadnum },
      })
    )
  );

  return NextResponse.json({
    success: true,
    moved: members.length,
    targetSlug: target.slug,
    targetTitle: target.title,
    newHeadnum,
  });
}
