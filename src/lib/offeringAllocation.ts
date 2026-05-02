// 연보 결산 — 화폐 매수를 일반/십일조 두 그룹으로 분배.
//
// 목표:
//   1. 정확성: 일반 분배 합계 = 일반금액, 십일조 분배 합계 = 십일조금액
//   2. 균형: 각 단위별로 일반/십일조 매수가 비율(일반금액/총금액)에 가깝게
//
// 알고리즘:
//   1. 단위별 비례 1차 분배: round(매수[d] × 일반금액 / 총금액)
//   2. 보정 루프: 일반 합계 ↔ 목표 차액을 단위 1매 이동으로 흡수
//   3. 잔여(< 단위 합으로 떨어지지 않는 부분)는 수표 총액 분배로 흡수
//
// 수표는 매수 개념이 없어 "총액의 비율 분배" 로 처리.

export const DENOM_UNITS = [50000, 10000, 5000, 1000, 500, 100, 50, 10] as const;
export type DenomKey = "w50000" | "w10000" | "w5000" | "w1000" | "w500" | "w100" | "w50" | "w10";
export const DENOM_KEYS: DenomKey[] = ["w50000", "w10000", "w5000", "w1000", "w500", "w100", "w50", "w10"];

export interface DenomCounts {
  check: number; // 수표 총액 (원)
  w50000: number; // 매수
  w10000: number;
  w5000: number;
  w1000: number;
  w500: number;
  w100: number;
  w50: number;
  w10: number;
}

export interface AllocationGroup {
  check: number; // 금액 (원)
  w50000: number; // 매수
  w10000: number;
  w5000: number;
  w1000: number;
  w500: number;
  w100: number;
  w50: number;
  w10: number;
}

export interface AllocationResult {
  general: AllocationGroup; // 일반 (= 주일+감사+특별+오일+절기)
  tithe: AllocationGroup; // 십일조
  /** 알고리즘 정확도 점검용. true 면 일반/십일조 분배 합계가 목표와 정확히 일치. */
  exact: boolean;
}

export function totalOf(counts: DenomCounts): number {
  return (
    counts.check +
    counts.w50000 * 50000 +
    counts.w10000 * 10000 +
    counts.w5000 * 5000 +
    counts.w1000 * 1000 +
    counts.w500 * 500 +
    counts.w100 * 100 +
    counts.w50 * 50 +
    counts.w10 * 10
  );
}

export function groupTotal(g: AllocationGroup): number {
  return (
    g.check +
    g.w50000 * 50000 +
    g.w10000 * 10000 +
    g.w5000 * 5000 +
    g.w1000 * 1000 +
    g.w500 * 500 +
    g.w100 * 100 +
    g.w50 * 50 +
    g.w10 * 10
  );
}

const KEY_TO_UNIT: Record<DenomKey, number> = {
  w50000: 50000,
  w10000: 10000,
  w5000: 5000,
  w1000: 1000,
  w500: 500,
  w100: 100,
  w50: 50,
  w10: 10,
};

/**
 * 매수를 일반/십일조 비율로 분배.
 *
 * @param counts 매수 입력 (수표 총액 + 단위별 매수)
 * @param generalAmount 일반(주일+감사+특별+오일+절기) 목표 금액
 * @param titheAmount 십일조 목표 금액
 *
 * generalAmount + titheAmount === totalOf(counts) 라고 가정.
 * 호출 전에 차액 반영해서 generalAmount 가 그 차액을 포함해야 함.
 */
export function allocate(
  counts: DenomCounts,
  generalAmount: number,
  titheAmount: number,
): AllocationResult {
  const total = generalAmount + titheAmount;
  if (total <= 0) {
    return {
      general: emptyGroup(),
      tithe: emptyGroup(),
      exact: total === 0,
    };
  }
  const ratio = generalAmount / total; // 일반 비율

  // 1) 단위별 비례 1차 분배
  const general: AllocationGroup = emptyGroup();
  const tithe: AllocationGroup = emptyGroup();

  for (const key of DENOM_KEYS) {
    const cnt = counts[key];
    const gCnt = Math.round(cnt * ratio);
    general[key] = gCnt;
    tithe[key] = cnt - gCnt;
  }

  // 수표 총액도 비율 분배 (1차)
  general.check = Math.round(counts.check * ratio);
  tithe.check = counts.check - general.check;

  // 2) 일반 합계와 목표 비교, 단위 1매 이동으로 보정
  // 큰 단위부터 시도해서 빠르게 수렴
  const ORDERED_KEYS: DenomKey[] = [...DENOM_KEYS]; // 50000 → 10
  let safety = 200;
  while (safety-- > 0) {
    const gSum = groupTotal(general);
    const diff = generalAmount - gSum;
    if (diff === 0) break;

    if (diff > 0) {
      // 일반에 더 필요 — 십일조에서 단위 1매 옮김 (단위 ≤ diff)
      let moved = false;
      for (const key of ORDERED_KEYS) {
        const u = KEY_TO_UNIT[key];
        if (u <= diff && tithe[key] > 0) {
          tithe[key] -= 1;
          general[key] += 1;
          moved = true;
          break;
        }
      }
      if (!moved) break;
    } else {
      // 일반이 과함 — 일반에서 단위 1매를 십일조로 (단위 ≤ -diff)
      const need = -diff;
      let moved = false;
      for (const key of ORDERED_KEYS) {
        const u = KEY_TO_UNIT[key];
        if (u <= need && general[key] > 0) {
          general[key] -= 1;
          tithe[key] += 1;
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
  }

  // 3) 단위로 못 떨어진 잔여는 수표 분배로 흡수 (수표는 임의 금액)
  const finalGSum = groupTotal(general);
  const remainder = generalAmount - finalGSum;
  if (remainder !== 0) {
    // 수표 분배 조정: 일반 ← +remainder, 십일조 ← -remainder
    general.check += remainder;
    tithe.check -= remainder;
  }

  const exact =
    groupTotal(general) === generalAmount && groupTotal(tithe) === titheAmount;

  return { general, tithe, exact };
}

function emptyGroup(): AllocationGroup {
  return {
    check: 0,
    w50000: 0,
    w10000: 0,
    w5000: 0,
    w1000: 0,
    w500: 0,
    w100: 0,
    w50: 0,
    w10: 0,
  };
}
