import prisma from "@/lib/db";
import { isDatacenterIp } from "@/lib/datacenterIp";

// ============================================================
// 크롤러 IP 차단 — 정적(datacenterIp.ts) + DB 동적 목록.
//
// 새 크롤러 대역은 코드 배포 없이 site_settings.crawler_ip_prefixes (JSON "a.b" 배열) 에
// 추가된다(유지보수 cron 이 자동 등록). 핫패스에서 매번 DB 조회하지 않도록 60초 캐시.
// 카운트 정확도는 행태 필터가 1차로 보장하므로, 이 IP 차단은 로그 유입을 줄이는 보조 방어선.
// ============================================================

export const CRAWLER_PREFIX_KEY = "crawler_ip_prefixes";

const TTL_MS = 60_000;
let cache: { set: Set<string>; at: number } | null = null;

/** "1.2.3.4" → "1.2" (앞 2 옥텟) */
export function prefixOf(ip: string): string {
  const p = ip.split(".");
  return p.length >= 2 ? `${p[0]}.${p[1]}` : ip;
}

async function loadDynamic(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.set;
  let set = new Set<string>();
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: CRAWLER_PREFIX_KEY } });
    if (row?.value) {
      const arr = JSON.parse(row.value);
      if (Array.isArray(arr)) set = new Set(arr.filter((x): x is string => typeof x === "string"));
    }
  } catch {
    /* 설정 없음/파싱 실패 → 정적 목록만 사용 */
  }
  cache = { set, at: Date.now() };
  return set;
}

/** 캐시 무효화 (유지보수 작업이 목록을 갱신했을 때 호출) */
export function invalidateCrawlerCache(): void {
  cache = null;
}

/** ingest 차단 판정 — 정적 클라우드 대역 + DB 동적 prefix 목록 */
export async function isCrawlerIp(ip: string | null | undefined): Promise<boolean> {
  if (!ip) return false;
  if (isDatacenterIp(ip)) return true;
  const dyn = await loadDynamic();
  return dyn.has(prefixOf(ip));
}
