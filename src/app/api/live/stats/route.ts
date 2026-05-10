import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { classifyService, nextServiceStart, SERVICE_CODES, loadWindows, type ServiceCode } from "@/lib/liveService";
import { pollYoutubeViewers } from "@/lib/youtubeViewers";

/**
 * GET /api/live/stats
 * 공개 — 현재 진행 서비스 정보 + 오늘 서비스별 unique IP 합계 + 최근 N일 (기본 14일) 일자×서비스 카운트.
 *
 * Response:
 * {
 *   currentService: { code, label, inProgress, start, end, currentCount },
 *   nextService: { code, label, start },
 *   today: { date, perService: { dawn:N, eve:N, ... } },
 *   recent: [ { date, perService: {...}, total: N }, ... ] // 최근 N일 (오늘 포함)
 * }
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const days = Math.max(1, Math.min(365, parseInt(sp.get("days") || "14", 10)));
  const fromStr = sp.get("from"); // YYYY-MM-DD (KST)
  const toStr = sp.get("to");

  const now = new Date();
  const windows = await loadWindows();
  const svc = classifyService(now, windows);
  const next = nextServiceStart(now, windows);

  // 1) 현재 서비스가 진행 중이면, 이 서비스 윈도우 안에서 unique IP 카운트
  let currentCount = 0;
  if (svc.inProgress && svc.start && svc.end) {
    const r = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(DISTINCT ip) AS cnt
      FROM live_service_visits
      WHERE serviceCode = ${svc.code}
        AND createdAt >= ${svc.start}
        AND createdAt < ${svc.end}
    `;
    currentCount = r[0] ? Number(r[0].cnt) : 0;
  } else {
    // 진행 중이 아니면 최근 30초 내 unique IP — heartbeat 30s 간격이라 활성 시청자만 잡힘
    const cutoff = new Date(now.getTime() - 30 * 1000);
    const r = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(DISTINCT ip) AS cnt
      FROM live_service_visits
      WHERE createdAt >= ${cutoff}
    `;
    currentCount = r[0] ? Number(r[0].cnt) : 0;
  }

  // 2) 일자×서비스 unique IP 카운트 — from/to 우선, 없으면 최근 N일
  const todayKstYmd = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let sinceDayStr: string;
  let untilDayStr: string;
  if (fromStr || toStr) {
    sinceDayStr = fromStr || "2009-01-01";
    untilDayStr = toStr || todayKstYmd;
  } else {
    const sinceDate = new Date(now.getTime() - (days - 1) * 24 * 3600 * 1000);
    sinceDayStr = new Date(sinceDate.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    untilDayStr = todayKstYmd;
  }
  // DATE 컬럼 비교용 — UTC 자정 기준으로 통일 (저장 시점과 일치)
  const sinceDay = new Date(sinceDayStr + "T00:00:00.000Z");
  const untilDay = new Date(untilDayStr + "T23:59:59.999Z");
  const rows = await prisma.$queryRaw<
    { d: Date; serviceCode: string; cnt: bigint }[]
  >`
    SELECT serviceDate AS d, serviceCode, COUNT(DISTINCT ip) AS cnt
    FROM live_service_visits
    WHERE serviceDate >= ${sinceDay} AND serviceDate <= ${untilDay}
    GROUP BY serviceDate, serviceCode
    ORDER BY serviceDate DESC, serviceCode ASC
  `;

  // 3) 일자별로 묶기
  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const ymd = new Date(r.d).toISOString().slice(0, 10);
    if (!byDay.has(ymd)) byDay.set(ymd, {});
    byDay.get(ymd)![r.serviceCode] = Number(r.cnt);
  }

  // 4) 응답 정형화 — 오늘 분리 + recent 배열 (sinceDayStr ~ untilDayStr 범위)
  const todayYmd = todayKstYmd;
  const todayPerService = byDay.get(todayYmd) ?? {};

  // sinceDay → untilDay 일자 시퀀스 생성 (DESC). UTC 정오 기준으로 timezone 안전.
  const recentDates: string[] = [];
  const startDate = new Date(sinceDayStr + "T12:00:00.000Z");
  const endDate = new Date(untilDayStr + "T12:00:00.000Z");
  const cursor = new Date(endDate);
  while (cursor.getTime() >= startDate.getTime()) {
    recentDates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (recentDates.length > 366) break;
  }

  const recent = recentDates.map((d) => {
    const per = byDay.get(d) ?? {};
    const total = Object.values(per).reduce((s, n) => s + n, 0);
    return { date: d, perService: per, total };
  });

  // YouTube 시청자 (옵션 — API 키 미설정 시 0)
  const yt = await pollYoutubeViewers().catch(() => null);

  // 자체 사이트의 오늘 누적 (모든 서비스 포함)
  const webTotalToday = Object.values(todayPerService).reduce((s, n) => s + (n as number), 0);

  return NextResponse.json({
    currentService: {
      code: svc.code,
      label: svc.label,
      inProgress: svc.inProgress,
      start: svc.start ?? null,
      end: svc.end ?? null,
      currentCount,
    },
    nextService: next
      ? { code: next.code, label: next.label, start: next.start }
      : null,
    today: {
      date: todayYmd,
      perService: todayPerService,
      total: webTotalToday,
    },
    recent,
    serviceCodes: SERVICE_CODES,
    youtube: yt
      ? {
          enabled: yt.hasApiKey && yt.hasUrl,
          concurrent: yt.concurrent,
          cumulative: yt.cumulative,
          polledAt: yt.polledAt,
          reason: yt.reason,
          hasApiKey: yt.hasApiKey,
          hasUrl: yt.hasUrl,
          videoId: yt.videoId,
        }
      : { enabled: false, concurrent: 0, cumulative: 0, polledAt: 0, reason: "error", hasApiKey: false, hasUrl: false, videoId: null },
    combined: {
      // 현재 시청 중 — 웹 활성 + 유튜브 동시
      currentNow: currentCount + (yt?.concurrent ?? 0),
      // 총 시청 — 웹 오늘 누적 + 유튜브 오늘 누적
      cumulativeToday: webTotalToday + (yt?.cumulative ?? 0),
    },
  });
}

/** 서비스 코드 type narrowing helper — 외부 사용 안 함 */
export const _SERVICE_CODE_TYPE: ServiceCode | null = null;
