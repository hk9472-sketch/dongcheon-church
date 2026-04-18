import DOMPurify from "isomorphic-dompurify";

// ============================================================
// 사용자 생성 HTML 정화
//  · img/style/data-align : 이미지 리사이즈+정렬 지원
//  · video/audio/source   : 멀티미디어 본문 임베드 허용
//  · iframe (제한적)       : YouTube · Vimeo · 카카오TV · 네이버TV 등
//                          신뢰 호스트만 통과 (XSS 방지)
// ============================================================

const ALLOWED_IFRAME_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "player.vimeo.com",
  "vimeo.com",
  "tv.kakao.com",
  "play-tv.kakao.com",
  "tv.naver.com",
  "serviceapi.nmv.naver.com",
  "soklee88.ipdisk.co.kr", // 기존 게시글에서 사용한 외부 호스트
];

let hookRegistered = false;
function registerIframeHook() {
  if (hookRegistered) return;
  hookRegistered = true;
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "iframe") return;
    const el = node as Element;
    const src = el.getAttribute("src") || "";
    let ok = false;
    try {
      const u = new URL(src, "https://example.com");
      if ((u.protocol === "http:" || u.protocol === "https:") && ALLOWED_IFRAME_HOSTS.includes(u.hostname)) {
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      el.parentNode?.removeChild(el);
    }
  });
}

/**
 * 사용자 생성 HTML을 안전하게 정화(sanitize)한다.
 * dangerouslySetInnerHTML 에 주입하기 전에 반드시 사용할 것.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  registerIframeHook();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li",
      "blockquote", "pre", "code", "h1", "h2", "h3", "h4",
      "img", "span", "div", "table", "thead", "tbody", "tr", "td", "th", "hr",
      // 멀티미디어
      "video", "audio", "source", "iframe",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "src", "alt", "title",
      "class", "style", "width", "height", "colspan", "rowspan",
      "data-align",
      // <video>/<audio>
      "controls", "autoplay", "loop", "muted", "preload", "poster", "playsinline",
      // <source>
      "type", "media",
      // <iframe>
      "frameborder", "allow", "allowfullscreen", "referrerpolicy", "sandbox", "loading",
    ],
    ALLOW_DATA_ATTR: false,
    // 외부 iframe 도 허용해야 하므로 ADD_TAGS 가 아닌 ALLOWED_TAGS 로 처리
    ADD_TAGS: [],
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
