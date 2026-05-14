/**
 * 다양한 YouTube URL 형식을 iframe embed URL 로 변환.
 *
 * 지원 입력:
 *   - 채널 ID 직접 ("UC..." 24자)
 *   - youtube.com/channel/UC...           → embed/live_stream?channel=UC...
 *   - youtube.com/embed/live_stream?channel=UC...
 *   - youtu.be/VIDEO_ID                   → embed/VIDEO_ID
 *   - youtube.com/watch?v=VIDEO_ID        → embed/VIDEO_ID
 *   - youtube.com/embed/VIDEO_ID          → 그대로
 *   - youtube.com/live/VIDEO_ID, /shorts/VIDEO_ID → embed/VIDEO_ID
 *
 * 미지원: @handle, /c/, /user/ — iframe embed 가 channel ID(UC...)를 요구하므로 hint 로 안내.
 *
 * 반환:
 *   { embed: "https://www.youtube.com/embed/..." | null,
 *     hint:  사용자에게 보여줄 안내 메시지 | null }
 */
export function parseYouTubeLiveUrl(raw: string): { embed: string | null; hint: string | null } {
  if (!raw) return { embed: null, hint: null };

  // 1) 채널 ID 직접 (UC + 22자)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(raw)) {
    return {
      embed: `https://www.youtube.com/embed/live_stream?channel=${raw}&autoplay=1`,
      hint: null,
    };
  }

  // 2) URL 파싱
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { embed: null, hint: "유효하지 않은 URL 형식입니다. 관리자에게 문의해 주세요." };
  }

  // youtu.be/VIDEO_ID
  if (u.hostname === "youtu.be" || u.hostname.endsWith(".youtu.be")) {
    const videoId = u.pathname.slice(1).split("/")[0];
    if (videoId) {
      return { embed: `https://www.youtube.com/embed/${videoId}?autoplay=1`, hint: null };
    }
  }

  // youtube.com/channel/UC... (경로형 채널 라이브)
  const channelMatch = u.pathname.match(/^\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (channelMatch) {
    return {
      embed: `https://www.youtube.com/embed/live_stream?channel=${channelMatch[1]}&autoplay=1`,
      hint: null,
    };
  }

  // ?channel=UC... 쿼리 파라미터
  const qChannel = u.searchParams.get("channel");
  if (qChannel && /^UC[a-zA-Z0-9_-]{22}$/.test(qChannel)) {
    return {
      embed: `https://www.youtube.com/embed/live_stream?channel=${qChannel}&autoplay=1`,
      hint: null,
    };
  }

  // watch?v=VIDEO_ID
  const videoId = u.searchParams.get("v");
  if (videoId) {
    return { embed: `https://www.youtube.com/embed/${videoId}?autoplay=1`, hint: null };
  }

  // /embed/VIDEO_ID
  const embedMatch = u.pathname.match(/^\/embed\/([^/?]+)/);
  if (embedMatch) {
    const id = embedMatch[1];
    if (id === "live_stream") {
      return {
        embed: null,
        hint: "embed URL 에 channel 파라미터가 없습니다. 채널 ID(UC...)를 함께 설정해 주세요.",
      };
    }
    return { embed: `https://www.youtube.com/embed/${id}?autoplay=1`, hint: null };
  }

  // /live/VIDEO_ID, /shorts/VIDEO_ID
  const liveMatch = u.pathname.match(/^\/(?:live|shorts)\/([a-zA-Z0-9_-]{11})/);
  if (liveMatch) {
    return { embed: `https://www.youtube.com/embed/${liveMatch[1]}?autoplay=1`, hint: null };
  }

  // @handle, /c/, /user/ → embed 가 채널 ID 를 요구하므로 안내
  if (u.pathname.startsWith("/@") || u.pathname.startsWith("/c/") || u.pathname.startsWith("/user/")) {
    return {
      embed: null,
      hint: "YouTube 채널 ID(UC...) 또는 /channel/UC... 형식으로 입력해주세요. @handle, /c/, /user/ 형식은 iframe embed 에서 지원되지 않습니다.",
    };
  }

  return { embed: null, hint: "지원되지 않는 YouTube URL 형식입니다. 관리자에게 문의해 주세요." };
}
