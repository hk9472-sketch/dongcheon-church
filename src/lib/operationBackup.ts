import prisma from "./db";

// 운영 작업 백업/복원 유틸.
// 일괄이동·헤드넘 재정렬 같은 글 메타데이터 변경 작업 직전에 호출.
// snapshot 은 영향받는 posts 행의 (id, boardId, categoryId, headnum, arrangenum, depth) 만 저장.
// content 등 본문은 안 건드리는 작업이라 별도 백업 필요 X.

export interface PostSnapshotRow {
  id: number;
  boardId: number;
  categoryId: number | null;
  headnum: number;
  arrangenum: number;
  depth: number;
}

const TEMP_OFFSET = 100_000_000; // headnum 충돌 회피용

export async function backupPosts(
  operation: string,
  description: string,
  postIds: number[],
  createdBy?: string
): Promise<{ id: number; rowCount: number }> {
  if (postIds.length === 0) {
    throw new Error("백업할 글 ID 가 없습니다.");
  }
  const rows = await prisma.post.findMany({
    where: { id: { in: postIds } },
    select: {
      id: true,
      boardId: true,
      categoryId: true,
      headnum: true,
      arrangenum: true,
      depth: true,
    },
  });
  const snapshot: PostSnapshotRow[] = rows;
  const created = await prisma.operationBackup.create({
    data: {
      operation,
      description,
      rowCount: snapshot.length,
      snapshot: snapshot as unknown as object,
      createdBy: createdBy ?? null,
    },
    select: { id: true, rowCount: true },
  });
  return created;
}

export async function backupPostsByBoard(
  operation: string,
  description: string,
  boardId: number,
  createdBy?: string
): Promise<{ id: number; rowCount: number }> {
  const rows = await prisma.post.findMany({
    where: { boardId },
    select: {
      id: true,
      boardId: true,
      categoryId: true,
      headnum: true,
      arrangenum: true,
      depth: true,
    },
  });
  const snapshot: PostSnapshotRow[] = rows;
  const created = await prisma.operationBackup.create({
    data: {
      operation,
      description,
      rowCount: snapshot.length,
      snapshot: snapshot as unknown as object,
      createdBy: createdBy ?? null,
    },
    select: { id: true, rowCount: true },
  });
  return created;
}

export async function restoreBackup(backupId: number): Promise<{ restored: number }> {
  const backup = await prisma.operationBackup.findUnique({ where: { id: backupId } });
  if (!backup) throw new Error("백업을 찾을 수 없습니다.");
  if (backup.restoredAt) {
    throw new Error("이미 복원된 백업입니다. 동일 백업을 두 번 복원할 수 없습니다.");
  }
  const snapshot = backup.snapshot as unknown as PostSnapshotRow[];
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    throw new Error("백업 데이터가 비어있습니다.");
  }

  // 두 단계 UPDATE: 1) headnum 을 임시 양수 영역으로 → 2) 최종값으로
  // 같은 boardId 안에서 headnum 충돌 회피 (재정렬 백업 복원 시 필요).
  await prisma.$transaction(
    async (tx) => {
      // 영향받는 boardId 들
      const affectedBoardIds = Array.from(new Set(snapshot.map((s) => s.boardId)));

      // 1단계: 영향 boardId 의 모든 headnum 을 임시 양수로
      for (const bid of affectedBoardIds) {
        await tx.$executeRaw`
          UPDATE posts SET headnum = headnum + ${TEMP_OFFSET}
          WHERE boardId = ${bid}
        `;
      }

      // 2단계: snapshot 의 각 행 복원
      for (const s of snapshot) {
        if (s.categoryId === null) {
          await tx.$executeRaw`
            UPDATE posts
            SET boardId = ${s.boardId},
                categoryId = NULL,
                headnum = ${s.headnum},
                arrangenum = ${s.arrangenum},
                depth = ${s.depth}
            WHERE id = ${s.id}
          `;
        } else {
          await tx.$executeRaw`
            UPDATE posts
            SET boardId = ${s.boardId},
                categoryId = ${s.categoryId},
                headnum = ${s.headnum},
                arrangenum = ${s.arrangenum},
                depth = ${s.depth}
            WHERE id = ${s.id}
          `;
        }
      }

      // 3단계: 백업에 없지만 1단계에서 임시값으로 옮겨진 행 = 백업 후 새로 들어온 글.
      //   임시값에서 원래 값으로 복귀 (headnum - TEMP_OFFSET)
      for (const bid of affectedBoardIds) {
        await tx.$executeRaw`
          UPDATE posts SET headnum = headnum - ${TEMP_OFFSET}
          WHERE boardId = ${bid} AND headnum >= ${TEMP_OFFSET}
        `;
      }

      // 백업에 복원 시각 기록
      await tx.operationBackup.update({
        where: { id: backupId },
        data: { restoredAt: new Date() },
      });
    },
    { timeout: 120_000, maxWait: 10_000 }
  );

  return { restored: snapshot.length };
}

export async function listBackups(limit = 50) {
  return prisma.operationBackup.findMany({
    select: {
      id: true,
      operation: true,
      description: true,
      rowCount: true,
      restoredAt: true,
      createdBy: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
