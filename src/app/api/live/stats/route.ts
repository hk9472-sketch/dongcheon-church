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
  const days = Math.max(1, Math.min(60, parseInt(req.nextUrl.searchParams.get("days") || "14", 10)));

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
    // 진행 중이 아니면 최근 5분 내 unique IP (단순 viewer 표시용)
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const r = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(DISTINCT ip) AS cnt
      FROM live_service_visits
      WHERE createdAt >= ${fiveMinAgo}
    `;
    currentCount = r[0] ? Number(r[0].cnt) : 0;
  }

  // 2) 최근 N일 — 일자×서비스 unique IP 카운트
  const sinceDate = new Date(now.getTime() - (days - 1) * 24 * 3600 * 1000);
  const sinceDay = new Date(sinceDate.toISOString().slice(0, 10) + "T00:00:00+09:00");
  const rows = await prisma.$queryRaw<
    { d: Date; serviceCode: string; cnt: bigint }[]
  >`
    SELECT serviceDate AS d, serviceCode, COUNT(DISTINCT ip) AS cnt
    FROM live_service_visits
    WHERE serviceDate >= ${sinceDay}
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

  // 4) 응답 정형화 — 오늘 분리 + recent 배열
  const todayYmd = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const todayPerService = byDay.get(todayYmd) ?? {};

  const recentDates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + 9 * 3600 * 1000 - i * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    recentDates.push(d);
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
          enabled: yt.hasApiKey && yt.videoId !== null,
          concurrent: yt.concurrent,
          cumulative: yt.cumulative,
          polledAt: yt.polledAt,
        }
      : { enabled: false, concurrent: 0, cumulative: 0, polledAt: 0 },
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
