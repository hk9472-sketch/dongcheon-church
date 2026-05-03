import prisma from "./db";

// 연보 관리번호 이력 헬퍼.
//   OfferingMember.id 는 내부 stable id, memberNo 는 시기별로 변경 가능.
//   특정 일자의 (memberNo) → 내부 memberId 로 해석하거나 그 반대로 조회.

function toDateOnly(date: Date | string): Date {
  if (typeof date === "string") return new Date(`${date}T00:00:00Z`);
  // 이미 Date 면 UTC 자정으로 정규화
  const d = new Date(date);
  return new Date(
    `${d.toISOString().slice(0, 10)}T00:00:00Z`,
  );
}

/** 특정 일자에 유효한 (memberNo → memberId) 매핑 조회 */
export async function resolveMemberIdByNo(
  memberNo: number,
  date: Date | string,
): Promise<number | null> {
  const d = toDateOnly(date);
  const row = await prisma.offeringMemberNumber.findFirst({
    where: {
      memberNo,
      validFrom: { lte: d },
      OR: [{ validUntil: null }, { validUntil: { gt: d } }],
    },
    orderBy: { validFrom: "desc" },
  });
  return row?.memberId ?? null;
}

/** 특정 일자에 회원의 표면 memberNo 조회 */
export async function getCurrentMemberNo(
  memberId: number,
  date: Date | string,
): Promise<number | null> {
  const d = toDateOnly(date);
  const row = await prisma.offeringMemberNumber.findFirst({
    where: {
      memberId,
      validFrom: { lte: d },
      OR: [{ validUntil: null }, { validUntil: { gt: d } }],
    },
    orderBy: { validFrom: "desc" },
  });
  return row?.memberNo ?? null;
}

/** 다수 memberId 의 일자별 memberNo 한 번에 조회 (성명 매핑처럼 batch) */
export async function getMemberNosBulk(
  memberIds: number[],
  date: Date | string,
): Promise<Map<number, number>> {
  const ids = Array.from(new Set(memberIds.filter((v) => v != null && v > 0)));
  const result = new Map<number, number>();
  if (ids.length === 0) return result;
  const d = toDateOnly(date);
  const rows = await prisma.offeringMemberNumber.findMany({
    where: {
      memberId: { in: ids },
      validFrom: { lte: d },
      OR: [{ validUntil: null }, { validUntil: { gt: d } }],
    },
    orderBy: { validFrom: "desc" },
  });
  for (const r of rows) {
    if (!result.has(r.memberId)) result.set(r.memberId, r.memberNo);
  }
  return result;
}

/** 기존 OfferingMember 들 중 history 가 없는 사람들에게 초기 row 생성 (idempotent).
 *  validFrom = 1900-01-01 (먼 과거), memberNo = OfferingMember.id (기존 동작 호환).
 */
export async function migrateInitialNumbers(): Promise<{ created: number }> {
  const members = await prisma.offeringMember.findMany({
    select: { id: true, isActive: true },
  });
  const existing = await prisma.offeringMemberNumber.findMany({
    where: { memberId: { in: members.map((m) => m.id) } },
    select: { memberId: true },
  });
  const existingSet = new Set(existing.map((e) => e.memberId));
  const epoch = new Date("1900-01-01T00:00:00Z");
  let created = 0;
  for (const m of members) {
    if (existingSet.has(m.id)) continue;
    await prisma.offeringMemberNumber.create({
      data: {
        memberId: m.id,
        memberNo: m.id, // 기존: id 자체가 표면 번호였으므로 그대로 사용
        validFrom: epoch,
        validUntil: null,
      },
    });
    created += 1;
  }
  return { created };
}

/** 일괄 번호 변경 — 기준일자 D 에 여러 사람의 memberNo 변경.
 *  각 변경: 기존 active row.validUntil = D, 새 row {memberId, memberNo, validFrom: D}.
 *  같은 (memberId, validFrom) 충돌 방지를 위해 idempotent: 이미 D 부터 같은 번호면 noop.
 */
export async function applyBatchChange(
  effectiveDate: Date | string,
  changes: Array<{ memberId: number; memberNo: number }>,
): Promise<void> {
  const d = toDateOnly(effectiveDate);
  await prisma.$transaction(async (tx) => {
    for (const ch of changes) {
      // 현재 active row (validUntil null) 확인 — 같은 번호면 skip
      const active = await tx.offeringMemberNumber.findFirst({
        where: { memberId: ch.memberId, validUntil: null },
        orderBy: { validFrom: "desc" },
      });
      if (active && active.memberNo === ch.memberNo) continue;
      if (active) {
        // active row 닫기
        await tx.offeringMemberNumber.update({
          where: { id: active.id },
          data: { validUntil: d },
        });
      }
      // 같은 (memberId, validFrom) 이미 있으면 update, 없으면 create
      const existing = await tx.offeringMemberNumber.findFirst({
        where: { memberId: ch.memberId, validFrom: d },
      });
      if (existing) {
        await tx.offeringMemberNumber.update({
          where: { id: existing.id },
          data: { memberNo: ch.memberNo, validUntil: null },
        });
      } else {
        await tx.offeringMemberNumber.create({
          data: {
            memberId: ch.memberId,
            memberNo: ch.memberNo,
            validFrom: d,
            validUntil: null,
          },
        });
      }
    }
  });
}
