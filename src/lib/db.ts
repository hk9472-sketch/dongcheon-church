import { PrismaClient } from "@prisma/client";

// Next.js 개발 환경에서 Hot Reload 시 PrismaClient 인스턴스가
// 여러 개 생성되는 것을 방지하는 싱글톤 패턴
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// 커넥션 풀 크기/대기시간 보장 — DATABASE_URL 에 명시가 없으면 기본값을 주입.
//   · connection_limit: 동시 커넥션 수 (Prisma 기본 = cpu*2+1 로 작음 → 대량 일괄저장 +
//     동시 조회 시 풀 고갈로 인증 쿼리까지 실패 → 401 오인 유발). 20 으로 상향.
//   · pool_timeout: 풀에서 커넥션 획득 대기 한도(초). 혼잡 시 즉시 실패 대신 대기.
// .env 에 이미 값이 있으면 존중(덮어쓰지 않음).
function buildDbUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return base;
  try {
    const u = new URL(base);
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "20");
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "20");
    return u.toString();
  } catch {
    // URL 파싱 실패(특수문자 비밀번호 등) 시 문자열로 안전 부착
    if (/[?&]connection_limit=/.test(base)) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}connection_limit=20&pool_timeout=20`;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: buildDbUrl() } },
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
