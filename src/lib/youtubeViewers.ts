import prisma from "@/lib/db";

// ============================================================
// YouTube 동시 시청자 폴링 + 누적 추적
//
// - YouTube Data API v3: videos.list?id=VIDEO_ID&part=liveStreamingDetails&key=API_KEY
// - 30초 캐시 (호출 quota 보호)
// - state 는 site_settings.live_youtube_state 에 JSON 저장
//   { date, concurrent, cumulative, polledAt, videoId }
// - concurrent 가 직전 샘플보다 늘어나면 그 차이만큼 cumulative 증가
// - concurrent 가 줄어도 cumulative 는 monotonic (총 시청)
// - KST 자정에 자동 리셋
// ============================================================

interface YoutubeState {
  date: string; // KST YYYY-MM-DD
  concurrent: number;
  cumulative: number;
  polledAt: number; // ms epoch
  videoId: string;
}

const STATE_KEY = "live_youtube_state";
const URL_KEY = "live_worship_url";
const API_KEY = "youtube_api_key";

const POLL_INTERVAL_MS = 30 * 1000;

function todayKstYmd(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function extractVideoId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function loadState(): Promise<YoutubeState | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key: STATE_KEY } });
  if (!row?.value) return null;
  try {
    const obj = JSON.parse(row.value);
    if (
      typeof obj?.date === "string" &&
      typeof obj?.concurrent === "number" &&
      typeof obj?.cumulative === "number" &&
      typeof obj?.polledAt === "number" &&
      typeof obj?.videoId === "string"
    ) {
      return obj as YoutubeState;
    }
  } catch {
    // pass
  }
  return null;
}

async function saveState(s: YoutubeState): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value: JSON.stringify(s) },
    update: { value: JSON.stringify(s) },
  });
}

interface PollResult {
  ok: boolean;
  hasApiKey: boolean;
  videoId: string | null;
  concurrent: number;
  cumulative: number;
  polledAt: number; // ms
  cached: boolean;
  error?: string;
}

/**
 * YouTube 시청자 수 조회 (30s 캐시).
 * - 캐시 만료된 경우 fresh fetch + 누적 업데이트.
 * - 키/URL 누락 시 0 반환 (에러 X — UI 가 깔끔하게 처리하도록).
 */
export async function pollYoutubeViewers(force = false): Promise<PollResult> {
  // 키 + URL 로드
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [URL_KEY, API_KEY] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const apiKey = (map.get(API_KEY) || "").trim();
  const url = (map.get(URL_KEY) || "").trim();

  if (!apiKey) {
    return {
      ok: false,
      hasApiKey: false,
      videoId: null,
      concurrent: 0,
      cumulative: 0,
      polledAt: 0,
      cached: false,
      error: "API key not set",
    };
  }
  const videoId = extractVideoId(url);
  if (!videoId) {
    return {
      ok: false,
      hasApiKey: true,
      videoId: null,
      concurrent: 0,
      cumulative: 0,
      polledAt: 0,
      cached: false,
      error: "video id not found",
    };
  }

  const today = todayKstYmd();
  const prev = await loadState();
  const now = Date.now();

  // 캐시 적용 — videoId 같고 날짜 같고 30s 이내면 그대로 반환
  if (
    !force &&
    prev &&
    prev.videoId === videoId &&
    prev.date === today &&
    now - prev.polledAt < POLL_INTERVAL_MS
  ) {
    return {
      ok: true,
      hasApiKey: true,
      videoId,
      concurrent: prev.concurrent,
      cumulative: prev.cumulative,
      polledAt: prev.polledAt,
      cached: true,
    };
  }

  // 외부 호출
  let concurrent = 0;
  try {
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=liveStreamingDetails&key=${apiKey}`;
    const r = await fetch(apiUrl, { cache: "no-store" });
    if (!r.ok) {
      return {
        ok: false,
        hasApiKey: true,
        videoId,
        concurrent: prev?.concurrent ?? 0,
        cumulative: prev?.cumulative ?? 0,
        polledAt: prev?.polledAt ?? 0,
        cached: false,
        error: `youtube api ${r.status}`,
      };
    }
    const data = await r.json();
    const item = data?.items?.[0];
    const cv = item?.liveStreamingDetails?.concurrentViewers;
    concurrent = cv ? parseInt(String(cv), 10) || 0 : 0;
  } catch (e) {
    return {
      ok: false,
      hasApiKey: true,
      videoId,
      concurrent: prev?.concurrent ?? 0,
      cumulative: prev?.cumulative ?? 0,
      polledAt: prev?.polledAt ?? 0,
      cached: false,
      error: e instanceof Error ? e.message : "fetch error",
    };
  }

  // 상태 업데이트
  let cumulative: number;
  if (!prev || prev.videoId !== videoId || prev.date !== today) {
    // 새 영상/새 날짜 → 누적 리셋. 시작 시점의 concurrent 가 곧 시작 누적
    cumulative = concurrent;
  } else {
    // 같은 영상/같은 날 — concurrent 증가분만큼 누적 +
    cumulative = prev.cumulative + Math.max(0, concurrent - prev.concurrent);
  }

  const next: YoutubeState = {
    date: today,
    concurrent,
    cumulative,
    polledAt: now,
    videoId,
  };
  await saveState(next);

  return {
    ok: true,
    hasApiKey: true,
    videoId,
    concurrent,
    cumulative,
    polledAt: now,
    cached: false,
  };
}
