// 감사연보 '등재용' 목록 생성 규칙 — 인쇄 미리보기와 게시판 등재가 동일 규칙을 쓰도록 공유.
//   · 1~3 고정 항목(십일조/감사/수지) + 데이터(감사내역 description) 번호 매김(연속)
//   · description 중복 제거(입력순), 빈 값/"결산차액" 제외

export const FIXED_LEADS = ["십일조 연보", "감사 연보", "수지 연보"];

export interface ThanksEntryLite {
  id: number;
  description: string | null;
}

/** description 중복 제거(입력순 id asc), 빈 값/"결산차액" 제외 */
export function buildThanksDataItems(entries: ThanksEntryLite[]): string[] {
  const ordered = [...entries].sort((a, b) => a.id - b.id);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of ordered) {
    const d = (e.description || "").trim();
    if (!d || d === "결산차액") continue;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

export function buildThanksFooterLine(totalKinds: number, envelopeCount: number): string {
  return `${totalKinds} 종류의 감사연보를 ${envelopeCount || 0} 분이 드렸습니다.`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseYmd(dateStr: string): { y: number; m: string; d: string } | null {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return {
    y: d.getFullYear(),
    m: String(d.getMonth() + 1).padStart(2, "0"),
    d: String(d.getDate()).padStart(2, "0"),
  };
}

/** 등재용 날짜 표기 (2026.05.17) */
function formatDateList(dateStr: string): string {
  const p = parseYmd(dateStr);
  return p ? `(${p.y}.${p.m}.${p.d})` : "";
}

/** 게시글 제목: 주일(2026년05월17일) 감사연보내역 */
export function buildThanksPostTitle(dateStr: string): string {
  const p = parseYmd(dateStr);
  if (!p) return `주일(${dateStr}) 감사연보내역`;
  return `주일(${p.y}년${p.m}월${p.d}일) 감사연보내역`;
}

/**
 * 게시판 등재용 HTML 본문 — 인쇄 '등재용' 레이아웃과 동일한 번호·구분선 규칙.
 * sanitizeHtml 허용 태그(p/strong/br/hr)만 사용.
 */
export function buildThanksListHtml(
  dateStr: string,
  items: string[],
  footerLine: string,
): string {
  // 항목 텍스트 → HTML: 이스케이프 + 비고 안의 줄바꿈(\n)을 <br> 로 보존(게시글에서 그대로 표시)
  const itemHtml = (t: string) => escapeHtml(t).replace(/\r?\n/g, "<br>");

  // 고정 3 + 감사내역을 연속 번호로(구분선 없음)
  const allLines = [
    ...FIXED_LEADS.map((t, i) => `${i + 1}. ${itemHtml(t)}`),
    ...items.map((t, i) => `${FIXED_LEADS.length + i + 1}. ${itemHtml(t)}`),
  ];

  const parts: string[] = [];
  parts.push(`<p><strong>지난주 감사연보 ${formatDateList(dateStr)}</strong></p>`);
  parts.push(`<p>${allLines.join("<br>")}</p>`);
  parts.push(`<p><strong>${escapeHtml(footerLine)}</strong></p>`);
  return parts.join("\n");
}
