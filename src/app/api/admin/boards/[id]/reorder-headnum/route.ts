import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { backupPostsByBoard } from "@/lib/operationBackup";

// 게시판 단위 headnum 일괄 재정렬.
//
// 트리 식별 규칙:
//   · depth=0 인 root post 의 id 를 트리 ID 로 사용
//   · 답글은 parentId 체인 따라 root_id 결정 (recursive CTE)
//   · parentId 체인 끊긴 orphan 글은 자기 자신을 root 로 처리
//   · headnum 중복(마이그레이션 사고)이 있어도 root_id 로 분리되어 안전
//
// 새 headnum:
//   · 사용자가 정한 정렬 순서대로 -(totalTrees - i) 부여 (i=0 → -N, i=N-1 → -1)
//   · 위젯·목록 정렬은 headnum ASC = 작을수록 최신.
//   · 트리 멤버 (root + 답글들) 모두 같은 새 headnum 부여.

async function requireAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

interface TreeAggRow {
  root_id: number;
  root_headnum: number;
  root_subject: string | null;
  tree_oldest: Date;
  tree_newest: Date;
  tree_count: bigint;
}

interface LineageRow {
  id: number;
  root_id: number;
}

// GET — 게시판의 모든 트리 (root_id 기준 그룹) 반환.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { id } = await params;
  const boardId = Number(id);
  if (!Number.isFinite(boardId)) {
    return NextResponse.json({ message: "잘못된 boardId" }, { status: 400 });
  }
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) {
    return NextResponse.json({ message: "게시판이 없습니다." }, { status: 404 });
  }

  const rows = await prisma.$queryRaw<TreeAggRow[]>`
    WITH RECURSIVE tree_lineage AS (
      SELECT id, id AS root_id
      FROM posts
      WHERE boardId = ${boardId} AND depth = 0

      UNION ALL

      SELECT p.id, t.root_id
      FROM posts p
      JOIN tree_lineage t ON p.parentId = t.id
      WHERE p.boardId = ${boardId}
    ),
    post_with_root AS (
      SELECT
        p.id,
        p.createdAt,
        COALESCE(tl.root_id, p.id) AS root_id
      FROM posts p
      LEFT JOIN tree_lineage tl ON tl.id = p.id
      WHERE p.boardId = ${boardId}
    )
    SELECT
      pwr.root_id,
      r.headnum AS root_headnum,
      r.subject AS root_subject,
      MIN(pwr.createdAt) AS tree_oldest,
      MAX(pwr.createdAt) AS tree_newest,
      COUNT(*) AS tree_count
    FROM post_with_root pwr
    JOIN posts r ON r.id = pwr.root_id
    GROUP BY pwr.root_id, r.headnum, r.subject
    ORDER BY r.headnum ASC
  `;

  const trees = rows.map((t) => ({
    rootId: t.root_id,
    rootHeadnum: t.root_headnum,
    rootSubject: t.root_subject,
    treeOldest: t.tree_oldest,
    treeNewest: t.tree_newest,
    treeCount: Number(t.tree_count),
  }));

  // headnum 중복 검사 (마이그레이션 사고 등으로 같은 headnum 의 별개 트리 다수 존재)
  const headnumSet = new Set(trees.map((t) => t.rootHeadnum));
  const dupHeadnumCount = trees.length - headnumSet.size;

  return NextResponse.json({
    boardId,
    boardTitle: board.title,
    totalTrees: trees.length,
    totalPosts: trees.reduce((s, t) => s + t.treeCount, 0),
    dupHeadnumCount,
    trees,
  });
}

// POST — 사용자가 정한 순서로 재정렬.
// body: { orderedRootIds: number[] }
//   배열 첫 번째 = rank 1 = newHeadnum -N (가장 작은 음수, ASC 시 맨 위)
//   배열 마지막 = rank N = newHeadnum -1
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { id } = await params;
  const boardId = Number(id);
  if (!Number.isFinite(boardId)) {
    return NextResponse.json({ message: "잘못된 boardId" }, { status: 400 });
  }
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) {
    return NextResponse.json({ message: "게시판이 없습니다." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const orderedRootIds: number[] = Array.isArray(body?.orderedRootIds)
    ? (body.orderedRootIds as unknown[])
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n))
    : [];

  if (orderedRootIds.length === 0) {
    return NextResponse.json(
      { message: "orderedRootIds 배열이 필요합니다." },
      { status: 400 }
    );
  }

  // 게시판의 모든 (post_id, root_id) 매핑
  const lineage = await prisma.$queryRaw<LineageRow[]>`
    WITH RECURSIVE tree_lineage AS (
      SELECT id, id AS root_id
      FROM posts
      WHERE boardId = ${boardId} AND depth = 0

      UNION ALL

      SELECT p.id, t.root_id
      FROM posts p
      JOIN tree_lineage t ON p.parentId = t.id
      WHERE p.boardId = ${boardId}
    )
    SELECT
      p.id,
      COALESCE(tl.root_id, p.id) AS root_id
    FROM posts p
    LEFT JOIN tree_lineage tl ON tl.id = p.id
    WHERE p.boardId = ${boardId}
  `;

  // 트리 ID 별 멤버 ID 모음
  const membersByRoot = new Map<number, number[]>();
  for (const row of lineage) {
    const arr = membersByRoot.get(row.root_id) ?? [];
    arr.push(row.id);
    membersByRoot.set(row.root_id, arr);
  }

  // 검증: orderedRootIds 가 실제 트리 ID 집합과 일치
  const existingRootIds = new Set(membersByRoot.keys());
  const orderedSet = new Set(orderedRootIds);

  if (existingRootIds.size !== orderedSet.size) {
    return NextResponse.json(
      {
        message: `트리 수 불일치 — 게시판: ${existingRootIds.size}, 요청: ${orderedSet.size}`,
      },
      { status: 400 }
    );
  }
  if (orderedRootIds.length !== orderedSet.size) {
    return NextResponse.json(
      { message: "orderedRootIds 에 중복된 값이 있습니다." },
      { status: 400 }
    );
  }
  for (const r of existingRootIds) {
    if (!orderedSet.has(r)) {
      return NextResponse.json(
        { message: `요청 배열에 누락된 root id: ${r}` },
        { status: 400 }
      );
    }
  }

  // 작업 직전 백업
  const backup = await backupPostsByBoard(
    "headnum-reorder",
    `게시판 "${board.title}" 헤드넘 사용자 지정 순서 재정렬 (root id 기반)`,
    boardId,
    admin.userId
  );

  // 트랜잭션: 트리 단위로 새 headnum 부여 (id IN 으로 멤버 일괄 update).
  // id 가 unique 라 충돌 없음 — 2-step 임시 영역 불필요.
  const totalTrees = orderedRootIds.length;
  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < totalTrees; i++) {
        const rootId = orderedRootIds[i];
        const newHeadnum = -(totalTrees - i);
        const memberIds = membersByRoot.get(rootId)!;
        await tx.$executeRaw`
          UPDATE posts SET headnum = ${newHeadnum}
          WHERE boardId = ${boardId} AND id IN (${Prisma.join(memberIds)})
        `;
      }
    },
    { timeout: 180_000, maxWait: 10_000 }
  );

  return NextResponse.json({
    success: true,
    boardId,
    boardTitle: board.title,
    treeCount: totalTrees,
    backupId: backup.id,
  });
}
