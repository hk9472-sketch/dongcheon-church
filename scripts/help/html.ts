/**
 * 도움말(매뉴얼) HTML 조각 헬퍼.
 *
 * - 도움말 본문은 sanitizeHtml(DOMPurify) 를 거치므로 허용 태그만 사용:
 *   p, br, strong, em, u, a, ul, ol, li, blockquote, pre, code, h2~h4, img, span, div, mark, table/thead/tbody/tr/td/th, hr
 *   (figure/figcaption/h5 불가). 꾸밈은 Tailwind 클래스 대신 inline style 로 한다.
 * - 이미지는 public/help/<영역>/<이름>.png → src="/help/<영역>/<이름>.png"
 *   (가상 데이터 DB 에서 캡처 — 실제 교인 정보·금액 노출 금지)
 */

export type HelpSeed = { slug: string; title: string; sortOrder: number; content: string };

/** 화면 캡처 + 그림 설명 */
export function img(src: string, caption?: string): string {
  return (
    `<p style="text-align:center;margin:14px 0 4px"><img src="${src}" alt="${caption ?? ""}" ` +
    `style="max-width:100%;border:1px solid #e5e7eb;border-radius:8px"></p>` +
    (caption ? `<p style="text-align:center;font-size:0.82em;color:#6b7280;margin:0 0 16px">${caption}</p>` : "")
  );
}

/** 도움말 팁 (초록) */
export function tip(html: string): string {
  return `<div style="background:#ecfdf5;border-left:4px solid #10b981;padding:10px 14px;border-radius:6px;margin:12px 0;font-size:0.95em">${html}</div>`;
}

/** 주의 (빨강) */
export function warn(html: string): string {
  return `<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:10px 14px;border-radius:6px;margin:12px 0;font-size:0.95em">${html}</div>`;
}

/** 참고 (파랑) */
export function note(html: string): string {
  return `<div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:10px 14px;border-radius:6px;margin:12px 0;font-size:0.95em">${html}</div>`;
}

/** 번호 표시(①②…) — 캡처 위 빨간 번호와 맞춰 쓴다 */
export function num(n: number): string {
  return `<span style="display:inline-block;min-width:1.4em;height:1.4em;line-height:1.4em;border-radius:0.7em;background:#e11d48;color:#fff;font-size:0.8em;font-weight:bold;text-align:center;margin-right:4px">${n}</span>`;
}

/** 단순 표 — rows[0] 이 머리글 */
export function table(rows: string[][]): string {
  const [head, ...body] = rows;
  const th = head.map((h) => `<th style="border:1px solid #d1d5db;background:#f3f4f6;padding:6px 8px;text-align:left">${h}</th>`).join("");
  const trs = body
    .map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #d1d5db;padding:6px 8px;vertical-align:top">${c}</td>`).join("")}</tr>`)
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-size:0.92em;margin:10px 0"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

/** 다른 매뉴얼로 가는 링크 (새 창 전체 화면 보기) */
export function link(slug: string, label: string): string {
  return `<a href="/manual/${slug}" target="_blank" rel="noopener">${label}</a>`;
}
