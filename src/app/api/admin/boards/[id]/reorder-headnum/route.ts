import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { backupPostsByBoard } from "@/lib/operationBackup";

// 게시판 단위 headnum 일괄 재정렬.
// · 트리(같은 headnum 공유) 단위 보존
// · 트리 안 가장 오래된 글의 createdAt DESC → 최신 트리가 가장 작은 음수(=위)
// · 새 headnum: -1 (최신) ~ -N (가장 오래된 트리)
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
  tree_count: bigint;
  root_subject: string | null;
}

// GET — 미리보기 (실제 변경 X). 상위 30개 트리 반환.
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

  const trees = await prisma.$queryRaw<TreeRow[]>`
    SELECT
      headnum,
      MIN(createdAt) AS tree_oldest,
      COUNT(*) AS tree_count,
      MAX(CASE WHEN depth = 0 THEN subject END) AS root_subject
    FROM posts
    WHERE boardId = ${boardId}
    GROUP BY headnum
    ORDER BY MIN(createdAt) DESC, MIN(id) DESC
  `;

  const totalTrees = trees.length;
  const totalPosts = trees.reduce((s, t) => s + Number(t.tree_count), 0);

  // 위젯·목록 정렬은 headnum ASC (작을수록 최신).
  // 최신 트리(rank=1)에 가장 작은 음수(-N) 부여 → ASC 시 맨 위.
  // 오래된 트리(rank=N)에 -1 부여 → ASC 시 맨 아래.

  // 모든 트리의 매핑 계산 (변경 여부 판정 + 변경되는 트리 우선 표시용)
  const allMapped = trees.map((t, i) => ({
    rank: i + 1,
    oldHeadnum: t.headnum,
    newHeadnum: -(totalTrees - i),
    treeOldest: t.tree_oldest,
    treeCount: Number(t.tree_count),
    rootSubject: t.root_subject,
    changed: t.headnum !== -(totalTrees - i),
  }));

  const changedCount = allMapped.filter((r) => r.changed).length;

  // 미리보기 50개 — 변경되는 트리 우선, 그 다음 변경 없는 트리
  const changed = allMapped.filter((r) => r.changed);
  const unchanged = allMapped.filter((r) => !r.changed);
  const preview = [...changed, ...unchanged].slice(0, 50);

  return NextResponse.json({
    boardId,
    boardTitle: board.title,
    totalTrees,
    totalPosts,
    changedCount,
    preview,
  });
}

// POST — 실제 재정렬 실행.
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

  const trees = await prisma.$queryRaw<TreeRow[]>`
    SELECT headnum, MIN(createdAt) AS tree_oldest, COUNT(*) AS tree_count
    FROM posts
    WHERE boardId = ${boardId}
    GROUP BY headnum
    ORDER BY MIN(createdAt) DESC, MIN(id) DESC
  `;

  if (trees.length === 0) {
    return NextResponse.json({ message: "글이 없습니다.", treeCount: 0 }, { status: 200 });
  }

  // 작업 직전 백업 — 게시판의 모든 글 snapshot
  const backup = await backupPostsByBoard(
    "headnum-reorder",
    `게시판 "${board.title}" 헤드넘 createdAt 재정렬`,
    boardId,
    admin.userId
  );

  // 트랜잭션: 단계 1) 모든 headnum 을 임시 양수로
  //          단계 2) 트리별로 최종 음수 부여
  //
  // 위젯·목록 정렬은 headnum ASC (작을수록 최신).
  // 최신 트리(i=0)에 가장 작은 음수 -N 부여 → ASC 정렬 시 맨 위.
  // 가장 오래된 트리(i=N-1)에 -1 부여 → ASC 시 맨 아래.
  // 새 글이 추가되면 MIN(-N) - 1 = -(N+1) 부여되어 자연스럽게 시퀀스 연장.
  const totalTrees = trees.length;
  await prisma.$transaction(
    async (tx) => {
      // 단계 1
      await tx.$executeRaw`
        UPDATE posts SET headnum = headnum + ${TEMP_OFFSET}
        WHERE boardId = ${boardId}
      `;
      // 단계 2
      for (let i = 0; i < trees.length; i++) {
        const oldH = trees[i].headnum;
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
    treeCount: trees.length,
    backupId: backup.id,
  });
}
