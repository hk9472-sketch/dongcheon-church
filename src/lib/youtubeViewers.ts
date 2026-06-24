import prisma from "@/lib/db";
import { classifyService, loadWindows } from "@/lib/liveService";

// ============================================================
// YouTube 동시 시청자 폴링 + 누적 추적
//
// URL 우선순위:
//   1) NEXT_PUBLIC_YOUTUBE_LIVE_URL (.env) — 정규 실시간 예배 채널
//   2) site_settings.live_worship_url — 내계집회 전용 (fallback)
//
// URL 형식 지원:
//   - watch?v=ID, youtu.be/ID, embed/ID, live/ID, shorts/ID → video ID 직접 추출
//   - youtube.com/channel/UC... → search.list 로 라이브 영상 ID 자동 조회
//   - youtube.com/@handle → channels.list?forHandle 로 채널 ID 조회 → search.list
//   - youtube.com/c/name, /user/name → channels.list?forUsername (legacy)
//
// 폴링: 서비스 윈도우 안에서만 5s 간격
// 채널 URL → 라이브 영상 매핑은 10분 캐시 (search.list 100 units 비싸므로)
// ============================================================

interface YoutubeState {
  date: string;
  concurrent: number;
  cumulative: number;
  polledAt: number;
  videoId: string;
}

interface ChannelLiveCache {
  channelId: string;
  videoId: string | null;
  resolvedAt: number; // ms
}

const STATE_KEY = "live_youtube_state";
const CHANNEL_CACHE_KEY = "live_youtube_channel_cache";
const SETTING_URL_KEY = "live_worship_url";
const API_KEY_SETTING = "youtube_api_key";

const POLL_INTERVAL_MS = 5 * 1000;
const CHANNEL_RESOLVE_CACHE_MS = 10 * 60 * 1000; // 10분

function todayKstYmd(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// ============================================================
// YouTube ToS 준수 — III.E.4: API 로 받은 통계(동시 시청자 등)를 30일 초과
// 저장·표시 금지. 30일 초과 행을 삭제하면 저장·표시(데이터 없음) 둘 다 자동 충족.
// 대상: service/minute/hour 통계(= YouTube API 동시시청자 파생) + embed 표본.
// ============================================================
export const YT_RETENTION_DAYS = 30;

export async function purgeOldYoutubeStats(): Promise<number> {
  const cutoffYmd = new Date(Date.now() - YT_RETENTION_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const cutoff = new Date(`${cutoffYmd}T00:00:00.000Z`);
  const [a, b, c, d] = await Promise.all([
    prisma.liveYoutubeServiceStat.deleteMany({ where: { serviceDate: { lt: cutoff } } }),
    prisma.liveYoutubeMinuteStat.deleteMany({ where: { serviceDate: { lt: cutoff } } }),
    prisma.liveYoutubeHourStat.deleteMany({ where: { serviceDate: { lt: cutoff } } }),
    prisma.liveYoutubeEmbedSample.deleteMany({ where: { serviceDate: { lt: cutoff } } }),
  ]);
  return a.count + b.count + c.count + d.count;
}

/** URL → video ID 직접 추출 (watch/youtu.be/embed/live/shorts) */
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

/** URL → 채널 식별자 추출.
 *  type: 'id' (UC...), 'handle' (@xxx), 'username' (c/, user/) */
export function extractChannelRef(
  url: string,
): { type: "id" | "handle" | "username"; value: string } | null {
  if (!url) return null;
  // /channel/UC... (24 chars including UC)
  let m = url.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (m) return { type: "id", value: m[1] };
  // /@handle (URL 인코딩 가능)
  m = url.match(/youtube\.com\/@([^/?#&]+)/);
  if (m) {
    try {
      return { type: "handle", value: decodeURIComponent(m[1]) };
    } catch {
      return { type: "handle", value: m[1] };
    }
  }
  // /c/customname or /user/legacyname
  m = url.match(/youtube\.com\/(?:c|user)\/([^/?#&]+)/);
  if (m) {
    try {
      return { type: "username", value: decodeURIComponent(m[1]) };
    } catch {
      return { type: "username", value: m[1] };
    }
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

async function loadChannelCache(): Promise<ChannelLiveCache | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key: CHANNEL_CACHE_KEY } });
  if (!row?.value) return null;
  try {
    const obj = JSON.parse(row.value);
    if (
      typeof obj?.channelId === "string" &&
      typeof obj?.resolvedAt === "number" &&
      (obj?.videoId === null || typeof obj?.videoId === "string")
    ) {
      return obj as ChannelLiveCache;
    }
  } catch {}
  return null;
}

async function saveChannelCache(c: ChannelLiveCache): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key: CHANNEL_CACHE_KEY },
    create: { key: CHANNEL_CACHE_KEY, value: JSON.stringify(c) },
    update: { value: JSON.stringify(c) },
  });
}

/** 채널 식별자 → 채널 ID (UC...). handle/username 은 channels.list 로 1회 조회 */
async function resolveChannelId(
  ref: { type: "id" | "handle" | "username"; value: string },
  apiKey: string,
): Promise<string | null> {
  if (ref.type === "id") return ref.value;
  const param =
    ref.type === "handle" ? `forHandle=@${encodeURIComponent(ref.value)}` : `forUsername=${encodeURIComponent(ref.value)}`;
  const url = `https://www.googleapis.com/youtube/v3/channels?${param}&part=id&key=${apiKey}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const data = await r.json();
    const id = data?.items?.[0]?.id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

/** 채널 ID → 현재 라이브 영상 ID (search.list, 100 units). 없으면 null */
async function findLiveVideoOnChannel(
  channelId: string,
  apiKey: string,
): Promise<string | null> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&eventType=live&type=video&maxResults=1&key=${apiKey}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const data = await r.json();
    const id = data?.items?.[0]?.id?.videoId;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

interface PollResult {
  ok: boolean;
  hasApiKey: boolean;
  hasUrl: boolean;
  videoId: string | null;
  concurrent: number;
  cumulative: number;
  polledAt: number;
  cached: boolean;
  error?: string;
  reason: string;
}

/** 메인 폴링 함수. URL 은 env 우선, 없으면 DB live_worship_url. */
export async function pollYoutubeViewers(force = false): Promise<PollResult> {
  // 키 + URL 로드
  const settingRows = await prisma.siteSetting.findMany({
    where: { key: { in: [SETTING_URL_KEY, API_KEY_SETTING] } },
  });
  const settingMap = new Map(settingRows.map((r) => [r.key, r.value]));
  const apiKey = (settingMap.get(API_KEY_SETTING) || "").trim();
  const envUrl = (process.env.NEXT_PUBLIC_YOUTUBE_LIVE_URL || "").trim();
  const dbUrl = (settingMap.get(SETTING_URL_KEY) || "").trim();
  const url = envUrl || dbUrl;

  if (!apiKey) {
    return {
      ok: false, hasApiKey: false, hasUrl: !!url, videoId: null,
      concurrent: 0, cumulative: 0, polledAt: 0, cached: false,
      error: "API key not set", reason: "no-key",
    };
  }
  if (!url) {
    return {
      ok: false, hasApiKey: true, hasUrl: false, videoId: null,
      concurrent: 0, cumulative: 0, polledAt: 0, cached: false,
      error: "URL not set", reason: "no-url",
    };
  }

  const today = todayKstYmd();
  const prev = await loadState();
  const now = Date.now();

  // 날짜가 바뀐 첫 폴링에서 30일 초과 통계 1회 정리 (cron 백업과 별개 자가치유 — ToS III.E.4)
  if (prev && prev.date !== today) {
    purgeOldYoutubeStats().catch(() => {});
  }

  // 서비스 윈도우 검사 — 윈도우 밖이면 외부 API 호출 0건 (quota 절약)
  const windows = await loadWindows();
  const svc = classifyService(new Date(now), windows);
  const inServiceWindow = svc.inProgress;

  if (!force && !inServiceWindow) {
    // 채널/영상 해결도 스킵 — cached state 그대로
    return {
      ok: true, hasApiKey: true, hasUrl: true,
      videoId: prev?.videoId ?? null,
      concurrent: prev?.date === today ? prev.concurrent : 0,
      cumulative: prev?.date === today ? prev.cumulative : 0,
      polledAt: prev?.polledAt ?? 0, cached: true,
      reason: "outside-window",
    };
  }

  // (서비스 윈도우 안) video ID 추출 — 직접 추출 → 채널 URL 자동 해결
  let videoId = extractVideoId(url);
  if (!videoId) {
    const channelRef = extractChannelRef(url);
    if (!channelRef) {
      return {
        ok: false, hasApiKey: true, hasUrl: true, videoId: null,
        concurrent: 0, cumulative: 0, polledAt: 0, cached: false,
        error: "URL 형식 인식 실패", reason: "bad-url",
      };
    }

    // 캐시 확인 — 10분 안이면 그대로 사용 (search.list 100 units 절약)
    const cache = await loadChannelCache();
    const channelIdResolved =
      cache && cache.channelId.startsWith("UC") &&
      Date.now() - cache.resolvedAt < CHANNEL_RESOLVE_CACHE_MS
        ? cache.channelId
        : await resolveChannelId(channelRef, apiKey);

    if (!channelIdResolved) {
      return {
        ok: false, hasApiKey: true, hasUrl: true, videoId: null,
        concurrent: 0, cumulative: 0, polledAt: 0, cached: false,
        error: "채널 ID 조회 실패", reason: "channel-resolve-fail",
      };
    }

    if (cache && cache.videoId && cache.channelId === channelIdResolved &&
        Date.now() - cache.resolvedAt < CHANNEL_RESOLVE_CACHE_MS) {
      videoId = cache.videoId;
    } else {
      videoId = await findLiveVideoOnChannel(channelIdResolved, apiKey);
      await saveChannelCache({
        channelId: channelIdResolved,
        videoId,
        resolvedAt: Date.now(),
      });
    }

    if (!videoId) {
      return {
        ok: true, hasApiKey: true, hasUrl: true, videoId: null,
        concurrent: 0, cumulative: prev?.date === today ? prev.cumulative : 0,
        polledAt: 0, cached: false,
        error: "현재 라이브 중 영상 없음", reason: "no-live",
      };
    }
  }

  // 5s 캐시
  if (!force && prev && prev.videoId === videoId && prev.date === today &&
      now - prev.polledAt < POLL_INTERVAL_MS) {
    return {
      ok: true, hasApiKey: true, hasUrl: true, videoId,
      concurrent: prev.concurrent, cumulative: prev.cumulative,
      polledAt: prev.polledAt, cached: true, reason: "ok",
    };
  }

  // 외부 호출
  let concurrent = 0;
  try {
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=liveStreamingDetails&key=${apiKey}`;
    const r = await fetch(apiUrl, { cache: "no-store" });
    if (!r.ok) {
      return {
        ok: false, hasApiKey: true, hasUrl: true, videoId,
        concurrent: prev?.concurrent ?? 0, cumulative: prev?.cumulative ?? 0,
        polledAt: prev?.polledAt ?? 0, cached: false,
        error: `youtube api ${r.status}`, reason: "api-error",
      };
    }
    const data = await r.json();
    const item = data?.items?.[0];
    const cv = item?.liveStreamingDetails?.concurrentViewers;
    concurrent = cv ? parseInt(String(cv), 10) || 0 : 0;
  } catch (e) {
    return {
      ok: false, hasApiKey: true, hasUrl: true, videoId,
      concurrent: prev?.concurrent ?? 0, cumulative: prev?.cumulative ?? 0,
      polledAt: prev?.polledAt ?? 0, cached: false,
      error: e instanceof Error ? e.message : "fetch error",
      reason: "api-error",
    };
  }

  // 누적 갱신 — cumulative 는 daily monotonic counter
  // cumulativeStart 는 이 서비스의 '첫 폴링 직전' 값 = 다른 서비스로부터 carry over 된 daily cum
  const cumulativeBeforeThisPoll =
    prev && prev.date === today && prev.videoId === videoId ? prev.cumulative : 0;

  let cumulative: number;
  if (!prev || prev.videoId !== videoId || prev.date !== today) {
    cumulative = concurrent;
  } else {
    cumulative = prev.cumulative + Math.max(0, concurrent - prev.concurrent);
  }
  await saveState({ date: today, concurrent, cumulative, polledAt: now, videoId });

  // 서비스별 일자별 통계 — ★ 예배마다 완전히 독립된 카운터.
  //   (글로벌 daily cumulative 는 더 이상 사용하지 않음. 두 예배가 같은 라이브 영상을
  //    공유하거나 연속 송출이면 이전 글로벌 누적이 다음 예배로 이어지던 버그를 제거.)
  // - cumulativeStart: 항상 0 (서비스 시작 = 0 에서 출발)
  // - cumulativeEnd:   해당 서비스 동안 동시접속이 '올라간 만큼'의 누적 = 그 예배에 새로 들어온 인원 근사치
  // - delta:           이 예배의 직전 표본(minute_stats) 대비 증가분. 같은 예배 폴링끼리만 비교 → 다른 예배와 절대 안 섞임
  // - peakConcurrent:  서비스 동안 동시 시청자 최대
  try {
    const serviceDateForStat = new Date(today + "T00:00:00.000Z");

    // 이 예배의 직전 표본 concurrent (분단위 최신값) — minute_stats 는 아래에서 갱신되므로
    // 지금 읽으면 '이전 폴링' 값. 첫 폴링이면 null → delta=0 (cumEnd 는 create 의 concurrent 로 시작).
    const lastSample = await prisma.liveYoutubeMinuteStat.findFirst({
      where: { serviceCode: svc.code, serviceDate: serviceDateForStat },
      orderBy: { minuteKst: "desc" },
      select: { concurrent: true },
    });
    const prevConcurrentThisService = lastSample?.concurrent ?? concurrent;
    const serviceDelta = Math.max(0, concurrent - prevConcurrentThisService);

    await prisma.liveYoutubeServiceStat.upsert({
      where: {
        serviceCode_serviceDate: {
          serviceCode: svc.code,
          serviceDate: serviceDateForStat,
        },
      },
      create: {
        serviceCode: svc.code,
        serviceDate: serviceDateForStat,
        peakConcurrent: concurrent,
        cumulativeStart: 0,
        cumulativeEnd: concurrent,
        videoId,
      },
      // cumulativeEnd 증가 + peak 는 아래 raw 에서 처리 (Prisma inline 증감/MAX 미지원)
      update: { videoId },
    });
    await prisma.$executeRaw`
      UPDATE live_youtube_service_stats
      SET cumulativeEnd = cumulativeEnd + ${serviceDelta},
          peakConcurrent = GREATEST(peakConcurrent, ${concurrent})
      WHERE serviceCode = ${svc.code} AND serviceDate = ${serviceDateForStat}
    `;

    // 시간대(KST hour)별 upsert — 매트릭스 시간대 컬럼용
    const kstHour = new Date(now + 9 * 3600 * 1000).getUTCHours();
    await prisma.liveYoutubeHourStat.upsert({
      where: { serviceDate_hourKst: { serviceDate: serviceDateForStat, hourKst: kstHour } },
      create: {
        serviceDate: serviceDateForStat,
        hourKst: kstHour,
        peakConcurrent: concurrent,
        cumulativeStart: cumulativeBeforeThisPoll,
        cumulativeEnd: cumulative,
        videoId,
      },
      update: { cumulativeEnd: cumulative, videoId },
    });
    await prisma.$executeRaw`
      UPDATE live_youtube_hour_stats
      SET peakConcurrent = GREATEST(peakConcurrent, ${concurrent})
      WHERE serviceDate = ${serviceDateForStat} AND hourKst = ${kstHour}
    `;

    // 분 단위(KST minute) 표본 — 시계열 차트용
    const kstDate = new Date(now + 9 * 3600 * 1000);
    const minuteKst = kstDate.getUTCHours() * 60 + kstDate.getUTCMinutes();
    await prisma.liveYoutubeMinuteStat.upsert({
      where: {
        serviceCode_serviceDate_minuteKst: {
          serviceCode: svc.code,
          serviceDate: serviceDateForStat,
          minuteKst,
        },
      },
      create: {
        serviceCode: svc.code,
        serviceDate: serviceDateForStat,
        minuteKst,
        concurrent,
      },
      // 같은 분 내 마지막 값으로 갱신 (5초 폴링이 12회 들어옴)
      update: { concurrent },
    });
  } catch {
    // 통계 저장 실패는 메인 폴링 결과에 영향 X
  }

  return {
    ok: true, hasApiKey: true, hasUrl: true, videoId,
    concurrent, cumulative, polledAt: now, cached: false, reason: "ok",
  };
}
