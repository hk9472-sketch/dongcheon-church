import prisma from "./db";

// OfferingEntry → OfferingMember manual JOIN.
// 스키마에서 FK 제거됨 (미등록 관리번호 입력 허용을 위해).
// Prisma 의 include: { member } 가 동작 안 해서 app 코드에서 batch 로 조회·매핑.

export interface MemberLite {
  id: number;
  name: string;
  groupName: string | null;
}

export type WithMember<T extends { memberId: number | null }> = T & {
  member: MemberLite | null;
};

/** memberId 목록을 모아 한 번에 조회 후 entries 에 .member 를 붙여 반환 */
export async function attachMembers<T extends { memberId: number | null }>(
  entries: T[],
  options?: { includeInactive?: boolean },
): Promise<WithMember<T>[]> {
  const ids = Array.from(
    new Set(entries.map((e) => e.memberId).filter((v): v is number => v != null && v > 0)),
  );
  if (ids.length === 0) {
    return entries.map((e) => ({ ...e, member: null }));
  }
  const rows = await prisma.offeringMember.findMany({
    where: {
      id: { in: ids },
      ...(options?.includeInactive ? {} : {}), // 미등록·삭제 자동 처리는 app 단에서
    },
    select: { id: true, name: true, groupName: true },
  });
  const map = new Map<number, MemberLite>();
  for (const r of rows) map.set(r.id, r);
  return entries.map((e) => ({
    ...e,
    member: e.memberId != null ? (map.get(e.memberId) ?? null) : null,
  }));
}

/** 단일 entry 용 헬퍼 */
export async function attachMember<T extends { memberId: number | null }>(
  entry: T,
): Promise<WithMember<T>> {
  if (entry.memberId == null || entry.memberId <= 0) {
    return { ...entry, member: null };
  }
  const m = await prisma.offeringMember.findUnique({
    where: { id: entry.memberId },
    select: { id: true, name: true, groupName: true },
  });
  return { ...entry, member: m };
}
