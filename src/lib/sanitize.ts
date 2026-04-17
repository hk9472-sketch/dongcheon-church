import DOMPurify from "isomorphic-dompurify";

/**
 * 사용자 생성 HTML을 안전하게 정화(sanitize)한다.
 * dangerouslySetInnerHTML 에 주입하기 전에 반드시 사용할 것.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li",
      "blockquote", "pre", "code", "h1", "h2", "h3", "h4",
      "img", "span", "div", "table", "thead", "tbody", "tr", "td", "th", "hr",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "src", "alt", "title",
      "class", "style", "width", "height", "colspan", "rowspan",
    ],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * HTML 태그를 완전히 제거하고 순수 텍스트만 반환한다.
 * 댓글처럼 리치 텍스트가 필요없는 경우 사용.
 */
export function stripAllHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  // DOMPurify로 모든 태그 제거
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}
