// 간단한 인메모리 Rate Limiter (슬라이딩 윈도우)
// 서버 재시작 시 초기화됨. 단일 인스턴스 환경 기준.
// 다중 인스턴스(예: 서버리스, 수평 확장)에선 Redis 등으로 교체 필요.

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets: Map<string, Bucket> = new Map();

// 주기적으로 만료된 버킷 정리 (메모리 누수 방지)
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10분
let lastCleanup = Date.now();

function cleanupExpired(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  cleanupExpired(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    // 윈도우 시작
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= maxRequests) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  bucket.count += 1;
  return { allowed: true };
}

// 요청 헤더에서 클라이언트 IP 추출
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}
