// 연보 결산 — 화폐 매수를 일반/십일조 두 그룹으로 분배.
//
// 핵심 아이디어: 매수(부피) 균형 우선.
//   · 단위별 매수는 50/50 로 균등 분할 (한쪽 매수가 너무 부풀지 않게)
//   · 수표 총액을 slack 변수로 사용해 금액 차이 흡수
//   · 수표만으로 못 풀리는 극단 케이스에서만 매수 이동, 그것도 작은 단위부터
//
// 사용자 요구: 십일조 금액이 커도 매수는 비슷하게 — 봉투/뭉치 다루기 편하게.

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
  /** 분배 후 양쪽이 목표 금액에 못 미치는 잔여 (담당자 별도 처리용).
   *  general/tithe 각각: 양수=부족, 음수=과부족(있을 수 없지만 안전 표기) */
  residual: { general: number; tithe: number };
  /** 잔여가 모두 0 이면 true */
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
 * 매수를 일반/십일조 두 그룹으로 분배 — 부피 균형 우선.
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
      residual: { general: 0, tithe: 0 },
      exact: total === 0,
    };
  }

  const general: AllocationGroup = emptyGroup();
  const tithe: AllocationGroup = emptyGroup();

  // Phase 1: 1000원 미만 부분(`amount % 1000`)을 작은 단위(500/100/50/10) 로 먼저 맞춤.
  //   각 측의 sub-1000 잔여를 큰 작은단위(500)부터 그리디로 채워나감.
  //   sub-1000 모두 0 이면 phase 1 noop.
  let gAmt = 0;
  let tAmt = 0;
  let gNeedSub = generalAmount % 1000;
  let tNeedSub = titheAmount % 1000;
  const SMALL_KEYS: DenomKey[] = ["w500", "w100", "w50", "w10"];
  const remainingCounts: Record<DenomKey, number> = {
    w50000: counts.w50000,
    w10000: counts.w10000,
    w5000: counts.w5000,
    w1000: counts.w1000,
    w500: counts.w500,
    w100: counts.w100,
    w50: counts.w50,
    w10: counts.w10,
  };
  for (const key of SMALL_KEYS) {
    const unit = KEY_TO_UNIT[key];
    while (gNeedSub >= unit && remainingCounts[key] > 0) {
      general[key] += 1;
      remainingCounts[key] -= 1;
      gNeedSub -= unit;
      gAmt += unit;
    }
    while (tNeedSub >= unit && remainingCounts[key] > 0) {
      tithe[key] += 1;
      remainingCounts[key] -= 1;
      tNeedSub -= unit;
      tAmt += unit;
    }
  }

  // Phase 2: 남은 매수(큰 단위 + 작은 단위 잔여) 를 "남은 부족분 비율" 로 분배.
  //   큰 단위가 큰 쪽을 채우면 작은 단위는 자동으로 작은 쪽에 더 감 → 매수 균형.
  for (const key of DENOM_KEYS) {
    const cnt = remainingCounts[key];
    const unit = KEY_TO_UNIT[key];
    if (cnt === 0) continue;

    const remG = Math.max(0, generalAmount - gAmt);
    const remT = Math.max(0, titheAmount - tAmt);
    const denomSum = remG + remT;

    let gCnt: number;
    if (denomSum <= 0) {
      gCnt = cnt >> 1; // 양쪽 다 채워짐 → 50/50 부피 균형
    } else if (remT === 0) {
      gCnt = cnt;
    } else if (remG === 0) {
      gCnt = 0;
    } else {
      const frac = remG / denomSum;
      gCnt = Math.round(cnt * frac);
      const maxG = Math.floor(remG / unit);
      if (gCnt > maxG) gCnt = maxG;
      const maxT = Math.floor(remT / unit);
      if (cnt - gCnt > maxT) gCnt = cnt - maxT;
      gCnt = Math.max(0, Math.min(cnt, gCnt));
    }
    const tCnt = cnt - gCnt;
    general[key] += gCnt;
    tithe[key] += tCnt;
    gAmt += gCnt * unit;
    tAmt += tCnt * unit;
  }
  // 3) 수표 slack — 양쪽 다 양수일 때만 그대로 사용. 음수면 매수 이동 시도 후
  //    그래도 안 풀리면 수표 0 으로 clip 하고 부족분을 residual 로 보고.
  let gCheck = generalAmount - gAmt;
  let tCheck = counts.check - gCheck;

  // 매수 이동 보정 (작은 단위부터 — over-shoot 최소화)
  const ASCENDING: DenomKey[] = [...DENOM_KEYS].reverse();
  let safety = 1000;
  while (safety-- > 0 && (gCheck < 0 || tCheck < 0)) {
    if (gCheck < 0) {
      const need = -gCheck;
      let u = moveOne(ASCENDING, general, tithe, need);
      if (!u) u = moveAny(ASCENDING, general, tithe);
      if (!u) break;
      gCheck += u;
      tCheck -= u;
    } else {
      const need = -tCheck;
      let u = moveOne(ASCENDING, tithe, general, need);
      if (!u) u = moveAny(ASCENDING, tithe, general);
      if (!u) break;
      gCheck -= u;
      tCheck += u;
    }
  }

  // 수표가 여전히 음수면 0 으로 clip — 잔여는 residual 로 따로 보고
  general.check = Math.max(0, gCheck);
  tithe.check = Math.max(0, tCheck);

  // residual = 목표 - 실제 분배 합계 (양수면 그 만큼 부족, 담당자가 처리)
  const residual = {
    general: generalAmount - groupTotal(general),
    tithe: titheAmount - groupTotal(tithe),
  };

  const exact = residual.general === 0 && residual.tithe === 0;
  return { general, tithe, residual, exact };
}

/** from 에서 to 로 단위 ≤ need 인 매수 1매 이동 — 가능했으면 그 단위 반환, 아니면 0 */
function moveOne(
  order: DenomKey[],
  from: AllocationGroup,
  to: AllocationGroup,
  need: number,
): number {
  for (const key of order) {
    const u = KEY_TO_UNIT[key];
    if (u <= need && from[key] > 0) {
      from[key] -= 1;
      to[key] += 1;
      return u;
    }
  }
  return 0;
}

/** from 에 매수가 남은 가장 작은 단위 1매 이동 (over-shoot 허용) */
function moveAny(
  order: DenomKey[],
  from: AllocationGroup,
  to: AllocationGroup,
): number {
  for (const key of order) {
    if (from[key] > 0) {
      const u = KEY_TO_UNIT[key];
      from[key] -= 1;
      to[key] += 1;
      return u;
    }
  }
  return 0;
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
