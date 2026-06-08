import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { isDatacenterIp } from "@/lib/datacenterIp";
import { CRAWLER_PREFIX_KEY, invalidateCrawlerCache } from "@/lib/crawlerFilter";

// ============================================================
// GET /api/cron/visitor-maintenance  (헤더 x-cron-secret: <CRON_SECRET> 필요)
//
// 방문자 봇 정리 정기 작업 (crontab 에서 매일 호출 — scripts/visitor-maintenance.sh).
//   1) 최근 14일 visitor_counts 를 행태 기반 실제값으로 재집계 (봇 제거 유지, idempotent)
//      · ★ 항상 최근 14일만 → 4/26 이전 레거시는 절대 건드리지 않음
//   2) 최근 7일 로그에서 신규 크롤러 IP 대역(앞 2옥텟) 보수적 발견 → 동적 목록에 자동 등록
//
// 카운트 정확도는 행태 필터가 1차 보장. 이 작업은 누적 카운트 청소 + IP 차단 목록 자동 확장.
// ============================================================

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET 미설정 (.env)" }, { status: 503 });
  }
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 1) 최근 14일 visitor_counts 재집계 (행태 기반). visitor_counts.date = KST일 - 1 오프셋 반영.
  const retrimmedRows = await prisma.$executeRaw`
    UPDATE visitor_counts vc
    JOIN (
      SELECT kstday, COUNT(*) realc FROM (
        SELECT DATE(createdAt + INTERVAL 9 HOUR) kstday,
               COALESCE(NULLIF(sessionId, ''), CONCAT('u:', userId), ip) k
        FROM visit_logs
        WHERE createdAt >= (DATE(UTC_TIMESTAMP() + INTERVAL 9 HOUR) - INTERVAL 14 DAY) - INTERVAL 9 HOUR
        GROUP BY kstday, k
        HAVING MAX(dwellSec) > 0
            OR COUNT(DISTINCT path) >= 2
            OR MAX(userId IS NOT NULL) = 1
            OR MAX(userAgent REGEXP 'Android|iPhone|iPad|CPU iPhone') = 1
      ) s GROUP BY kstday
    ) d ON vc.date = DATE_SUB(d.kstday, INTERVAL 1 DAY)
    SET vc.count = d.realc`;

  // 2) 최근 7일 신규 크롤러 대역 발견 (보수적: 세션 20+, 위장 데스크톱·0체류·referer無 99%+, 모바일 0)
  const candidates = await prisma.$queryRaw<{ prefix: string }[]>`
    SELECT CONCAT(SUBSTRING_INDEX(ip, '.', 1), '.', SUBSTRING_INDEX(SUBSTRING_INDEX(ip, '.', 2), '.', -1)) AS prefix
    FROM visit_logs
    WHERE createdAt >= UTC_TIMESTAMP() - INTERVAL 7 DAY
    GROUP BY prefix
    HAVING COUNT(DISTINCT COALESCE(NULLIF(sessionId, ''), ip)) >= 20
       AND 100 * SUM(userAgent REGEXP 'Mac OS X 10_15_7|Windows NT' AND dwellSec = 0 AND referer IS NULL) / COUNT(*) >= 99
       AND SUM(userAgent REGEXP 'Android|iPhone|iPad') = 0`;

  const existingRow = await prisma.siteSetting.findUnique({ where: { key: CRAWLER_PREFIX_KEY } });
  let existing: string[] = [];
  try {
    if (existingRow?.value) existing = JSON.parse(existingRow.value) || [];
  } catch {
    existing = [];
  }
  const set = new Set(existing.filter((x) => typeof x === "string"));

  const added: string[] = [];
  for (const c of candidates) {
    if (!c.prefix || set.has(c.prefix)) continue;
    const [a, b] = c.prefix.split(".").map(Number);
    // 정적 isDatacenterIp 가 이미 잡는 대역이면 동적 목록에 중복 추가 안 함 (대표 IP 로 판정)
    if (Number.isInteger(a) && Number.isInteger(b) && isDatacenterIp(`${a}.${b}.0.0`)) continue;
    set.add(c.prefix);
    added.push(c.prefix);
  }

  if (added.length > 0) {
    const merged = JSON.stringify([...set]);
    await prisma.siteSetting.upsert({
      where: { key: CRAWLER_PREFIX_KEY },
      create: { key: CRAWLER_PREFIX_KEY, value: merged },
      update: { value: merged },
    });
    invalidateCrawlerCache();
  }

  return NextResponse.json({
    ok: true,
    retrimmedRows,
    newPrefixes: added,
    dynamicPrefixCount: set.size,
  });
}
