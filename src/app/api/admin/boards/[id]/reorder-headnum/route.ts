import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { backupPostsByBoard } from "@/lib/operationBackup";

// 게시판 단위 headnum 일괄 재정렬.
// · 트리(같은 headnum 공유) 단위 보존
// · 사용자가 미리보기에서 정한 정렬 순서대로 새 headnum 부여
// · 새 headnum: -1 (맨 아래) ~ -N (맨 위 = ASC 정렬 시 가장 작은 음수)
// · 두 단계 UPDATE — 충돌 회피 (임시 양수 영역 → 최종 음수)

const TEMP_OFFSET = 100_000_000;

async function requireAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

interface TreeRow {
  headnum: number;
  tree_oldest: Date;
  tree_newest: Date;
  tree_count: bigint;
  root_subject: string | null;
}

// GET — 게시판의 모든 트리 반환. 클라이언트가 정렬·매핑 계산.
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

  const rows = await prisma.$queryRaw<TreeRow[]>`
    SELECT
      headnum,
      MIN(createdAt) AS tree_oldest,
      MAX(createdAt) AS tree_newest,
      COUNT(*) AS tree_count,
      MAX(CASE WHEN depth = 0 THEN subject END) AS root_subject
    FROM posts
    WHERE boardId = ${boardId}
    GROUP BY headnum
    ORDER BY headnum ASC
  `;

  const trees = rows.map((t) => ({
    oldHeadnum: t.headnum,
    treeOldest: t.tree_oldest,
    treeNewest: t.tree_newest,
    treeCount: Number(t.tree_count),
    rootSubject: t.root_subject,
  }));

  return NextResponse.json({
    boardId,
    boardTitle: board.title,
    totalTrees: trees.length,
    totalPosts: trees.reduce((s, t) => s + t.treeCount, 0),
    trees,
  });
}

// POST — 사용자가 정한 순서대로 재정렬 실행.
// body: { orderedHeadnums: number[] }
//   배열의 i 번째(0-based) 헤드넘이 rank=i+1 → newHeadnum = -(totalTrees - i)
//   즉 배열 첫 번째 = 맨 위 (가장 작은 음수), 마지막 = 맨 아래 (-1).
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
  const orderedHeadnums: number[] = Array.isArray(body?.orderedHeadnums)
    ? (body.orderedHeadnums as unknown[])
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n))
    : [];

  if (orderedHeadnums.length === 0) {
    return NextResponse.json(
      { message: "orderedHeadnums 배열이 필요합니다." },
      { status: 400 }
    );
  }

  // 검증: 게시판의 distinct headnum 집합과 일치하는지
  const existing = await prisma.$queryRaw<{ headnum: number }[]>`
    SELECT DISTINCT headnum FROM posts WHERE boardId = ${boardId}
  `;
  const existingSet = new Set(existing.map((r) => r.headnum));
  const orderedSet = new Set(orderedHeadnums);

  if (existingSet.size !== orderedSet.size) {
    return NextResponse.json(
      {
        message: `트리 수 불일치 — 게시판: ${existingSet.size}, 요청: ${orderedSet.size}`,
      },
      { status: 400 }
    );
  }
  if (orderedHeadnums.length !== orderedSet.size) {
    return NextResponse.json(
      { message: "orderedHeadnums 에 중복된 값이 있습니다." },
      { status: 400 }
    );
  }
  for (const h of existingSet) {
    if (!orderedSet.has(h)) {
      return NextResponse.json(
        { message: `요청 배열에 누락된 headnum: ${h}` },
        { status: 400 }
      );
    }
  }

  // 작업 직전 백업
  const backup = await backupPostsByBoard(
    "headnum-reorder",
    `게시판 "${board.title}" 헤드넘 사용자 지정 순서 재정렬`,
    boardId,
    admin.userId
  );

  // 두 단계 UPDATE: 1) 임시 양수 → 2) 최종 음수
  const totalTrees = orderedHeadnums.length;
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        UPDATE posts SET headnum = headnum + ${TEMP_OFFSET}
        WHERE boardId = ${boardId}
      `;
      for (let i = 0; i < totalTrees; i++) {
        const oldH = orderedHeadnums[i];
        const newH = -(totalTrees - i);
        await tx.$executeRaw`
          UPDATE posts SET headnum = ${newH}
          WHERE boardId = ${boardId} AND headnum = ${oldH + TEMP_OFFSET}
        `;
      }
    },
    { timeout: 120_000, maxWait: 10_000 }
  );

  return NextResponse.json({
    success: true,
    boardId,
    boardTitle: board.title,
    treeCount: totalTrees,
    backupId: backup.id,
  });
}
