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
  /** entry 일자에 유효한 표면 관리번호 (history 적용). 미등록·history 없으면 null */
  memberNoAtDate?: number | null;
};

/** memberId 목록을 모아 한 번에 조회 후 entries 에 .member + .memberNoAtDate 붙여 반환.
 *  entry 가 date 필드(@db.Date Date 객체) 를 가지면 그 일자 기준 표면 번호도 매핑. */
export async function attachMembers<
  T extends { memberId: number | null; date?: Date | string },
>(
  entries: T[],
  options?: { includeInactive?: boolean },
): Promise<WithMember<T>[]> {
  const ids = Array.from(
    new Set(entries.map((e) => e.memberId).filter((v): v is number => v != null && v > 0)),
  );
  if (ids.length === 0) {
    return entries.map((e) => ({ ...e, member: null, memberNoAtDate: null }));
  }
  const [memberRows, numberRows] = await Promise.all([
    prisma.offeringMember.findMany({
      where: {
        id: { in: ids },
        ...(options?.includeInactive ? {} : {}),
      },
      select: { id: true, name: true, groupName: true },
    }),
    prisma.offeringMemberNumber.findMany({
      where: { memberId: { in: ids } },
      orderBy: { validFrom: "desc" },
    }),
  ]);
  const memMap = new Map<number, MemberLite>();
  for (const m of memberRows) memMap.set(m.id, m);
  // memberId → 그 사람의 모든 history rows (validFrom desc)
  const numMap = new Map<number, typeof numberRows>();
  for (const n of numberRows) {
    const list = numMap.get(n.memberId) ?? [];
    list.push(n);
    numMap.set(n.memberId, list);
  }

  function resolveNoAt(memberId: number | null, date: Date | string | undefined): number | null {
    if (memberId == null) return null;
    const list = numMap.get(memberId);
    if (!list || list.length === 0) {
      // history 없는 레거시 — 내부 id 가 표면 번호
      return memberId;
    }
    if (!date) {
      // 일자 정보 없으면 가장 최근 active row
      const active = list.find((r) => r.validUntil == null) ?? list[0];
      return active?.memberNo ?? memberId;
    }
    const d = new Date(typeof date === "string" ? date : date);
    for (const r of list) {
      const from = new Date(r.validFrom);
      const until = r.validUntil ? new Date(r.validUntil) : null;
      if (from <= d && (until === null || d < until)) {
        return r.memberNo;
      }
    }
    // 매핑 못 찾으면 fallback: 내부 id
    return memberId;
  }

  return entries.map((e) => ({
    ...e,
    member: e.memberId != null ? (memMap.get(e.memberId) ?? null) : null,
    memberNoAtDate: resolveNoAt(e.memberId, e.date),
  }));
}

/** 단일 entry 용 헬퍼 */
export async function attachMember<T extends { memberId: number | null; date?: Date | string }>(
  entry: T,
): Promise<WithMember<T>> {
  if (entry.memberId == null || entry.memberId <= 0) {
    return { ...entry, member: null, memberNoAtDate: null };
  }
  const [m, numbers] = await Promise.all([
    prisma.offeringMember.findUnique({
      where: { id: entry.memberId },
      select: { id: true, name: true, groupName: true },
    }),
    prisma.offeringMemberNumber.findMany({
      where: { memberId: entry.memberId },
      orderBy: { validFrom: "desc" },
    }),
  ]);
  let memberNoAtDate: number | null = entry.memberId; // fallback
  if (numbers.length > 0) {
    if (entry.date) {
      const d = new Date(typeof entry.date === "string" ? entry.date : entry.date);
      const found = numbers.find((r) => {
        const from = new Date(r.validFrom);
        const until = r.validUntil ? new Date(r.validUntil) : null;
        return from <= d && (until === null || d < until);
      });
      memberNoAtDate = found?.memberNo ?? entry.memberId;
    } else {
      const active = numbers.find((r) => r.validUntil == null) ?? numbers[0];
      memberNoAtDate = active?.memberNo ?? entry.memberId;
    }
  }
  return { ...entry, member: m, memberNoAtDate };
}
