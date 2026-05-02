// HWP (한글 워드프로세서) PUA → 표준 Unicode 매핑.
//
// 한컴 함초롬·한컴바탕 글꼴은 일부 문자를 Private Use Area (U+E000~U+F8FF) 에
// 자체 인코딩으로 배치한다. 그 글꼴이 없는 환경에서는 □ 로 보이는데,
// 매핑을 통해 표준 unicode 로 치환하면 시스템 폰트로 정상 표시된다.
//
// 점진적 추가: 사용자가 깨진 문자를 보고할 때마다 추가.

export const HWP_PUA_MAP: Record<number, string> = {
  // 자주 쓰이는 것 — HWP 함초롬바탕에서 흔히 등장
  0xe0bc: "·", // 가운뎃점 (U+00B7 MIDDLE DOT)
  0xe0bd: "·",
  0xe0bb: "•", // BULLET
  0xe0c0: "‧", // HYPHENATION POINT
  0xf8e6: "▪",
  0xf8e7: "▫",
  0xf8f7: "○",
  0xf8f8: "●",

  // ─── 한컴바탕(HCRBatang) PUA — 사용자 보고로 확인된 매핑 ───
  // 2026-04-30 보고: 본문 inline 번호 마커로 추정 (① ② ③)
  // 만약 다른 글자였다면 (예: ・ 가운뎃점) 아래 값만 변경.
  0xf081: "①",
  0xf082: "②",
  0xf083: "③",
  0xf084: "④",
  0xf085: "⑤",
  0xf086: "⑥",
  0xf087: "⑦",
  0xf088: "⑧",
  0xf089: "⑨",
  0xf08a: "⑩",

  // ─── 사용자 보고 시 여기에 추가 ───
  // 0xE0XX: "원하는 글자",
};

const PUA_MIN = 0xe000;
const PUA_MAX = 0xf8ff;

export function isPuaCode(code: number): boolean {
  return code >= PUA_MIN && code <= PUA_MAX;
}

/**
 * 문자열의 PUA 문자를 매핑된 표준 unicode 로 치환.
 * 매핑 안 된 PUA 는 원본 유지 (사용자가 확인 가능하게) + unmapped 집합에 코드포인트 수집.
 */
export function replaceHwpPua(text: string): { result: string; unmapped: Set<number> } {
  const unmapped = new Set<number>();
  let result = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code !== undefined && isPuaCode(code)) {
      const mapped = HWP_PUA_MAP[code];
      if (mapped !== undefined) {
        result += mapped;
      } else {
        unmapped.add(code);
        result += ch; // 일단 원본 보존
      }
    } else {
      result += ch;
    }
  }
  return { result, unmapped };
}

/** 코드포인트 집합을 "U+E0BC, U+E0BD" 형식으로 출력 (사용자 보고용) */
export function fmtCodes(set: Set<number>): string {
  return Array.from(set)
    .sort((a, b) => a - b)
    .map((c) => `U+${c.toString(16).toUpperCase().padStart(4, "0")}`)
    .join(", ");
}
