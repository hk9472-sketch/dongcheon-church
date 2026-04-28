import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// POST /api/admin/posts/bulk-move
// body: { postIds: number[], targetBoardId: number, targetCategoryId?: number | null }
// 여러 게시글(과 그 답글 트리) 을 다른 게시판/카테고리로 일괄 이동.
// · 같은 boardId+headnum 를 공유하는 글은 한 트리 → 함께 이동
// · 대상 게시판의 새 headnum 발급 (음수, MIN-1 부터 트리별로 -1 씩 감소)
// · updatedAt 안 건드리도록 raw SQL UPDATE (대량 이동 시 위젯이 흔들리지 않도록)

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
  const postIds: number[] = Array.isArray(body?.postIds)
    ? (body.postIds as unknown[]).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const targetBoardId = Number(body?.targetBoardId);
  const targetCategoryIdRaw = body?.targetCategoryId;
  const targetCategoryId =
    targetCategoryIdRaw === null || targetCategoryIdRaw === undefined || targetCategoryIdRaw === ""
      ? null
      : Number(targetCategoryIdRaw);

  if (postIds.length === 0 || !Number.isFinite(targetBoardId) || targetBoardId <= 0) {
    return NextResponse.json(
      { message: "postIds 와 targetBoardId 가 필요합니다." },
      { status: 400 }
    );
  }

  const target = await prisma.board.findUnique({ where: { id: targetBoardId } });
  if (!target) {
    return NextResponse.json({ message: "대상 게시판이 없습니다." }, { status: 404 });
  }

  if (targetCategoryId !== null) {
    const cat = await prisma.category.findFirst({
      where: { id: targetCategoryId, boardId: targetBoardId },
    });
    if (!cat) {
      return NextResponse.json(
        { message: "대상 카테고리가 그 게시판에 속하지 않습니다." },
        { status: 400 }
      );
    }
  }

  // 1) 선택된 글의 (boardId, headnum) 페어 = 트리 키
  const selected = await prisma.post.findMany({
    where: { id: { in: postIds } },
    select: { id: true, boardId: true, headnum: true },
  });
  if (selected.length === 0) {
    return NextResponse.json({ message: "이동할 글이 없습니다." }, { status: 404 });
  }

  // 2) 선택된 글 + 같은 트리(같은 headnum)의 모든 멤버 가져옴
  const treeKeys = Array.from(new Set(selected.map((p) => `${p.boardId}:${p.headnum}`)));
  const treeFilters = treeKeys.map((k) => {
    const [bid, h] = k.split(":").map(Number);
    return { boardId: bid, headnum: h };
  });

  const allMembers = await prisma.post.findMany({
    where: { OR: treeFilters },
    select: { id: true, boardId: true, headnum: true, createdAt: true },
  });

  // 3) 이미 대상 게시판에 있는 글이 섞여있으면 거부
  if (allMembers.some((m) => m.boardId === targetBoardId)) {
    return NextResponse.json(
      { message: "선택된 글 중 일부가 이미 대상 게시판에 있습니다." },
      { status: 400 }
    );
  }

  // 4) 트리 키별 MIN(createdAt) — 트리 위치 결정용
  const treeAge = new Map<string, Date>();
  for (const m of allMembers) {
    const k = `${m.boardId}:${m.headnum}`;
    const existing = treeAge.get(k);
    if (!existing || m.createdAt < existing) treeAge.set(k, m.createdAt);
  }
  const treesSorted = treeKeys
    .map((k) => {
      const [bid, h] = k.split(":").map(Number);
      return { sourceBoardId: bid, oldHeadnum: h, oldest: treeAge.get(k)! };
    })
    .sort((a, b) => b.oldest.getTime() - a.oldest.getTime()); // 최신 트리 먼저

  // 5) 대상 게시판의 현재 MIN(headnum)
  const targetMin = await prisma.post.aggregate({
    where: { boardId: targetBoardId },
    _min: { headnum: true },
  });
  const baseMin = targetMin._min.headnum ?? 0;

  // 6) 트랜잭션 — raw SQL 로 일괄 (updatedAt 보존)
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < treesSorted.length; i++) {
      const tree = treesSorted[i];
      const newHeadnum = baseMin - (i + 1); // 최신 트리(i=0) 가 가장 작은 음수 = 위
      if (targetCategoryId !== null) {
        await tx.$executeRaw`
          UPDATE posts
          SET boardId = ${targetBoardId},
              headnum = ${newHeadnum},
              categoryId = ${targetCategoryId}
          WHERE boardId = ${tree.sourceBoardId} AND headnum = ${tree.oldHeadnum}
        `;
      } else {
        await tx.$executeRaw`
          UPDATE posts
          SET boardId = ${targetBoardId},
              headnum = ${newHeadnum},
              categoryId = NULL
          WHERE boardId = ${tree.sourceBoardId} AND headnum = ${tree.oldHeadnum}
        `;
      }
    }
  });

  return NextResponse.json({
    success: true,
    treeCount: treesSorted.length,
    movedCount: allMembers.length,
    targetSlug: target.slug,
    targetTitle: target.title,
  });
}
