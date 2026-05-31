import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { countActive } from "@/lib/activePresence";

// ============================================================
// 봇/크롤러 User-Agent 필터
// ============================================================
const BOT_PATTERNS = /bot|crawler|spider|crawling|slurp|mediapartners|adsbot|bingpreview|facebookexternalhit|linkedinbot|twitterbot|whatsapp|telegrambot|yandex|baidu|duckduck|archive|wget|curl|python-requests|go-http-client|java\/|httpclient|fetcher|scraper|headless|phantom|selenium|puppeteer|lighthouse|pagespeed/i;

function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // UA 없으면 봇으로 간주
  return BOT_PATTERNS.test(userAgent);
}

// ============================================================
// 봇 공격 path 필터 — 우리 앱엔 PHP 가 없는데 .php 경로를 찌르는 건 100% 봇.
// stealth Chromium 처럼 UA 를 위장한 봇이 JS 까지 실행해 POST 까지 보내는 경우
// path 로 한 번 더 거름.
// ============================================================
const ATTACK_PATH_PATTERN =
  /\.(php|asp|aspx|jsp|cgi|pl|sh|env|git|sql|bak)(\/|\?|$)|\/wp-|\/xmlrpc|\/phpmyadmin|\/\.env|\/\.git|\/admin\/setup|\/cgi-bin/i;

function isAttackPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return ATTACK_PATH_PATTERN.test(path);
}

// ============================================================
// 한국 시간(KST, UTC+9) 기준 오늘/어제 날짜 계산
// KST 자정 = UTC 전날 15:00 (UTC+9 보정)
// ============================================================
function getKoreanDates() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = now.toISOString().slice(0, 10); // KST 기준 "YYYY-MM-DD"

  // visitor_counts 테이블의 date 컬럼 (DATE 타입) 비교용
  const today = new Date(todayStr + "T00:00:00+09:00");

  // visit_logs 테이블의 createdAt (DATETIME) 범위 비교용: KST 자정 = UTC 15:00 전날
  const todayStart = new Date(todayStr + "T00:00:00+09:00"); // KST 자정 → UTC 변환

  const yesterdayDate = new Date(today);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);

  return { today, todayStart, yesterday: yesterdayDate };
}

// ============================================================
// in-memory cache — GET 응답을 짧은 TTL 동안 캐시.
// 페이지 이동마다 푸터 카운터가 GET 하므로 트래픽 급증 시에도
// 실제 DB groupBy 는 TTL 당 최대 1회. POST(새 visit) 가 들어오면 무효화.
// ============================================================
const CACHE_TTL_MS = 5_000;
let statsCache: { data: VisitorStats; expiresAt: number } | null = null;

interface VisitorStats {
  online: number;
  total: number;
  today: number;
  yesterday: number;
}

function invalidateStatsCache() {
  statsCache = null;
}

async function getVisitorStatsCached(): Promise<VisitorStats> {
  if (statsCache && statsCache.expiresAt > Date.now()) {
    return statsCache.data;
  }
  const data = await getVisitorStats();
  statsCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

// ============================================================
// 방문자 통계 조회 헬퍼
// ============================================================
async function getVisitorStats(): Promise<VisitorStats> {
  const { today, todayStart, yesterday } = getKoreanDates();

  // KST 기준 시간 범위
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

  // 병렬로 모든 데이터 조회
  const [totalAgg, todayIps, yesterdayIps, baseSetting] =
    await Promise.all([
      // 전체 일별 카운트 합계
      prisma.visitorCount.aggregate({
        _sum: { count: true },
      }),
      // 오늘 고유 IP 수 (visit_logs에서 직접 계산 — KST 자정 기준)
      prisma.visitLog.groupBy({
        by: ["ip"],
        where: { createdAt: { gte: todayStart, lt: todayEnd } },
      }),
      // 어제 고유 IP 수 (visit_logs에서 직접 계산 — KST 자정 기준)
      prisma.visitLog.groupBy({
        by: ["ip"],
        where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
      }),
      // 기본 누적 카운트 (제로보드 이전 데이터 등)
      prisma.siteSetting.findUnique({
        where: { key: "visitor_base_count" },
      }),
    ]);

  // 현재 접속자 — heartbeat 기반(60초 윈도우, activePresence Map).
  // 위젯과 일관된 "지금 화면 보고 있는 사람" 의미.
  // 이전엔 visit_logs 의 15분 윈도우라 닫고 나간 사람도 포함됐음.
  const online = countActive().total;

  const baseCount = baseSetting ? parseInt(baseSetting.value, 10) || 0 : 0;
  const dailyTotal = totalAgg._sum.count ?? 0;

  return {
    online,
    total: dailyTotal + baseCount,
    today: todayIps.length,
    yesterday: yesterdayIps.length,
  };
}

// ============================================================
// GET /api/visitor - 방문자 통계 반환
// ============================================================
export async function GET() {
  try {
    const stats = await getVisitorStatsCached();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[Visitor GET] Error:", error);
    return NextResponse.json(
      { error: "방문자 통계를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/visitor - 방문 기록 (카운트 증가 + 로그 생성)
// 같은 IP의 중복 방문은 로그만 기록하고 카운트는 증가시키지 않음
// ============================================================
export async function POST(request: NextRequest) {
  try {
    // Rate limit: IP당 12회/분 (5초당 1회 이하)
    const rlIp = getClientIp(request);
    const rl = checkRateLimit(`visitor:${rlIp}`, 12, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { path, referer, userAgent, userId, sessionId } = body as {
      path?: string;
      referer?: string;
      userAgent?: string;
      userId?: number;
      sessionId?: string;
    };

    // 봇/크롤러 필터링 (UA 기반)
    if (isBot(userAgent)) {
      return NextResponse.json({ skipped: true, reason: "bot" });
    }

    // 봇 공격 path 필터링 (stealth Chromium 등 UA 위장 봇 우회용)
    if (isAttackPath(path)) {
      return NextResponse.json({ skipped: true, reason: "attack-path" });
    }

    // IP는 서버 헤더에서 추출
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";

    const { today, todayStart } = getKoreanDates();
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // 중복 POST 거름 — 같은 (ip, path) 가 최근 10초 안에 들어온 적 있으면 skip.
    // VisitorTracker (3초 dwell POST) + VisitorCounter (즉시 mount POST) 가 한 페이지
    // 진입에 둘 다 fire 해 visit_logs row 가 2배로 쌓이는 문제 차단. 진짜 사용자가
    // 10초 안에 같은 페이지를 새로 본 거라면 행동상 1회로 봐도 무방.
    const dupCutoff = new Date(Date.now() - 10_000);
    const recentDup = await prisma.visitLog.findFirst({
      where: {
        ip,
        path: path || "/",
        createdAt: { gte: dupCutoff },
      },
      select: { id: true },
    });
    if (recentDup) {
      return NextResponse.json({ skipped: true, reason: "duplicate" });
    }

    // 오늘 이 IP로 이미 방문 기록이 있는지 확인 (KST 자정 기준)
    const existingVisit = await prisma.visitLog.findFirst({
      where: {
        ip,
        createdAt: { gte: todayStart, lt: tomorrowStart },
      },
      select: { id: true },
    });

    if (existingVisit) {
      // 이미 오늘 카운트된 IP → 로그만 추가 (카운트 증가 안 함)
      await prisma.visitLog.create({
        data: {
          ip: ip || "unknown",
          path: path || "/",
          referer: referer || null,
          userAgent: userAgent || null,
          userId: userId || null,
          sessionId: sessionId ? String(sessionId).slice(0, 64) : null,
        },
      });
    } else {
      // 오늘 첫 방문 IP → 카운트 증가 + 로그 생성.
      // Prisma upsert 는 내부적으로 SELECT + INSERT/UPDATE 라 동시 요청이 몰리면 P2002
      // (유니크 제약 위반) 가 발생한다. MySQL 의 INSERT ... ON DUPLICATE KEY UPDATE 로
      // 원자적 처리하여 경합 상황에서도 오류 없이 카운트 1 증가.
      await prisma.$transaction([
        prisma.$executeRaw`
          INSERT INTO visitor_counts (date, count)
          VALUES (${today}, 1)
          ON DUPLICATE KEY UPDATE count = count + 1
        `,
        prisma.visitLog.create({
          data: {
            ip: ip || "unknown",
            path: path || "/",
            referer: referer || null,
            userAgent: userAgent || null,
            userId: userId || null,
            sessionId: sessionId ? String(sessionId).slice(0, 64) : null,
          },
        }),
      ]);
    }

    // 새 visit 으로 stats 가 변했으므로 캐시 무효화 + fresh 계산.
    // 다음 GET 들이 이 fresh 결과를 캐시에 채워 쓰게 됨.
    invalidateStatsCache();
    const stats = await getVisitorStatsCached();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[Visitor POST] Error:", error);
    return NextResponse.json(
      { error: "방문 기록에 실패했습니다." },
      { status: 500 }
    );
  }
}
