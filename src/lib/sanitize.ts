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
  const clean = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li",
      "blockquote", "pre", "code", "h1", "h2", "h3", "h4",
      "img", "span", "div", "mark", "table", "thead", "tbody", "tr", "td", "th", "hr",
      // 멀티미디어
      "video", "audio", "source", "iframe",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "src", "alt", "title", "download",
      "class", "style", "width", "height", "colspan", "rowspan", "colwidth",
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
  // TipTap 등 리치 에디터는 연속 Enter 를 <p></p><p></p>... 로 출력하는데,
  // 브라우저는 내용이 없는 <p></p> 를 0 높이로 렌더하고 인접 margin 도 collapse 되어
  // 입력한 공백 줄이 화면에서 사라진다. 빈 단락 안에 <br> 을 넣어 한 줄 높이를 확보.
  const withEmptyP = clean.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "<p><br></p>");

  // 렌더 시점에 <video>/<audio> 뒤에 '📥 다운로드' 링크 자동 삽입.
  // iframe(YouTube/Vimeo) 은 플랫폼이 차단하므로 제외.
  // 저장된 HTML 자체에는 링크가 없고 출력 시에만 덧붙이므로, 이후 에디터 편집 시
  // 중복으로 저장되지 않고, 링크를 제거하려면 이 함수만 고치면 된다.
  //
  // 브라우저는 외부 도메인 파일에 대해 <a download> 속성을 CORS 정책으로 무시한다.
  // 따라서 자체 서버의 /api/board/media-download 를 경유해 Content-Disposition:
  // attachment 헤더로 내려받도록 한다. 자체 경로(/api/board/media?path=...)는
  // 해당 라우트가 리다이렉트로 처리.
  const withDownload = withEmptyP.replace(
    /<(video|audio)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (full, _tag, attrs, inner) => {
      const srcMatch = (attrs + inner).match(/\bsrc=(?:"([^"]+)"|'([^']+)')/i);
      const src = srcMatch ? srcMatch[1] || srcMatch[2] : "";
      if (!src) return full;
      const lastSeg = src.split("?")[0].split("/").filter(Boolean).pop() || "";
      const proxyHref =
        `/api/board/media-download?src=${encodeURIComponent(src)}` +
        (lastSeg ? `&name=${encodeURIComponent(lastSeg)}` : "");
      return `${full}<a class="media-download-link" href="${proxyHref}" download rel="noopener noreferrer">📥 다운로드</a>`;
    }
  );
  return withDownload;
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
