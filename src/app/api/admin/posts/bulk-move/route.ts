import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { backupPosts } from "@/lib/operationBackup";

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

  // 3) 이동 유형 판정
  //    - 모든 멤버가 이미 target board 안 → "같은 게시판 내 카테고리 변경" 모드
  //    - 모든 멤버가 target board 외부 → "게시판 간 이동" 모드 (기존 동작)
  //    - 섞여 있으면 거부 (비일관 선택)
  const allInTarget = allMembers.every((m) => m.boardId === targetBoardId);
  const noneInTarget = allMembers.every((m) => m.boardId !== targetBoardId);
  if (!allInTarget && !noneInTarget) {
    return NextResponse.json(
      {
        message:
          "선택된 글 중 일부만 대상 게시판에 있습니다. 모두 이동하거나 모두 카테고리 변경이 되도록 선택을 일관되게 해주세요.",
      },
      { status: 400 }
    );
  }

  const allMemberIds = allMembers.map((m) => m.id);

  // 같은 게시판 내 — 카테고리만 변경. headnum/위치 유지.
  if (allInTarget) {
    const backup = await backupPosts(
      "bulk-move",
      `${allMemberIds.length}건 카테고리 변경 → "${target.title}"${
        targetCategoryId ? ` (카테고리 ${targetCategoryId})` : " (카테고리 없음)"
      }`,
      allMemberIds,
      admin.userId
    );

    await prisma.$transaction(async (tx) => {
      if (targetCategoryId !== null) {
        await tx.$executeRaw`
          UPDATE posts
          SET categoryId = ${targetCategoryId}
          WHERE id IN (${Prisma.join(allMemberIds)})
        `;
      } else {
        await tx.$executeRaw`
          UPDATE posts
          SET categoryId = NULL
          WHERE id IN (${Prisma.join(allMemberIds)})
        `;
      }
    });

    return NextResponse.json({
      success: true,
      treeCount: treeKeys.length,
      movedCount: allMembers.length,
      mode: "category-change",
      targetSlug: target.slug,
      targetTitle: target.title,
      backupId: backup.id,
    });
  }

  // 게시판 간 이동 — 기존 로직
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

  // 5.5) 작업 직전 백업 — 영향받는 모든 트리 멤버의 현재 상태 snapshot
  const backup = await backupPosts(
    "bulk-move",
    `${allMemberIds.length}건 → 게시판 "${target.title}"${
      targetCategoryId ? ` (카테고리 ${targetCategoryId})` : ""
    }`,
    allMemberIds,
    admin.userId
  );

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
    mode: "board-move",
    targetSlug: target.slug,
    targetTitle: target.title,
    backupId: backup.id,
  });
}
