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

  // ─── 한컴바탕(HCRBatang) 원문자 ① ~ 50 ───
  // 2026-04-30 사용자 보고로 F081~F083 = ①②③ 확정. 패턴상 sequential 매핑.
  0xf081: "①", 0xf082: "②", 0xf083: "③", 0xf084: "④", 0xf085: "⑤",
  0xf086: "⑥", 0xf087: "⑦", 0xf088: "⑧", 0xf089: "⑨", 0xf08a: "⑩",
  0xf08b: "⑪", 0xf08c: "⑫", 0xf08d: "⑬", 0xf08e: "⑭", 0xf08f: "⑮",
  0xf090: "⑯", 0xf091: "⑰", 0xf092: "⑱", 0xf093: "⑲", 0xf094: "⑳",
  // 21~50 (U+3251~U+3263 + U+32B1~U+32BF)
  0xf095: "㉑", 0xf096: "㉒", 0xf097: "㉓", 0xf098: "㉔", 0xf099: "㉕",
  0xf09a: "㉖", 0xf09b: "㉗", 0xf09c: "㉘", 0xf09d: "㉙", 0xf09e: "㉚",
  0xf09f: "㉛", 0xf0a0: "㉜", 0xf0a1: "㉝", 0xf0a2: "㉞", 0xf0a3: "㉟",
  0xf0a4: "㊱", 0xf0a5: "㊲", 0xf0a6: "㊳", 0xf0a7: "㊴", 0xf0a8: "㊵",
  0xf0a9: "㊶", 0xf0aa: "㊷", 0xf0ab: "㊸", 0xf0ac: "㊹", 0xf0ad: "㊺",
  0xf0ae: "㊻", 0xf0af: "㊼", 0xf0b0: "㊽", 0xf0b1: "㊾", 0xf0b2: "㊿",

  // ─── 추가로 확인된 매핑은 여기에 ───
};

const PUA_MIN = 0xe000;
const PUA_MAX = 0xf8ff;

export function isPuaCode(code: number): boolean {
  return code >= PUA_MIN && code <= PUA_MAX;
}

/** 매핑 안 된 PUA 한 건의 컨텍스트 — 코드포인트 + 앞뒤 글자 (식별용) */
export interface UnmappedSample {
  code: number;
  context: string; // "...앞 [□] 뒤..." 형식
}

/**
 * 문자열의 PUA 문자를 매핑된 표준 unicode 로 치환.
 * 매핑 안 된 PUA 는 원본 유지 + 코드포인트별 첫 등장 컨텍스트 수집 (사용자 보고용).
 */
export function replaceHwpPua(
  text: string,
): { result: string; unmapped: Set<number>; samples: UnmappedSample[] } {
  const chars = Array.from(text); // 코드포인트 단위 split
  const unmapped = new Set<number>();
  const samples = new Map<number, UnmappedSample>(); // 코드포인트당 첫 등장만
  const out: string[] = [];

  const CTX = 6; // 앞뒤 글자 수
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const code = ch.codePointAt(0);
    if (code !== undefined && isPuaCode(code)) {
      const mapped = HWP_PUA_MAP[code];
      if (mapped !== undefined) {
        out.push(mapped);
      } else {
        unmapped.add(code);
        if (!samples.has(code)) {
          const before = chars.slice(Math.max(0, i - CTX), i).join("");
          const after = chars.slice(i + 1, i + 1 + CTX).join("");
          // HTML 태그·엔티티 노이즈 줄여서 단순 텍스트로
          const clean = (s: string) =>
            s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
          samples.set(code, {
            code,
            context: `${clean(before)}[□]${clean(after)}`,
          });
        }
        out.push(ch); // 일단 원본 보존
      }
    } else {
      out.push(ch);
    }
  }
  return { result: out.join(""), unmapped, samples: Array.from(samples.values()) };
}

/** 코드포인트 집합을 "U+E0BC, U+E0BD" 형식으로 출력 (사용자 보고용) */
export function fmtCodes(set: Set<number>): string {
  return Array.from(set)
    .sort((a, b) => a - b)
    .map((c) => `U+${c.toString(16).toUpperCase().padStart(4, "0")}`)
    .join(", ");
}

/** 컨텍스트 샘플들을 "U+F081 [...] 앞[□]뒤" 여러 줄로 포맷 */
export function fmtSamples(samples: UnmappedSample[]): string {
  return samples
    .slice()
    .sort((a, b) => a.code - b.code)
    .map(
      (s) =>
        `  • U+${s.code.toString(16).toUpperCase().padStart(4, "0")}  ${s.context}`,
    )
    .join("\n");
}
