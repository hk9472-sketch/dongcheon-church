import { PrismaClient } from "@prisma/client";

// Next.js 개발 환경에서 Hot Reload 시 PrismaClient 인스턴스가
// 여러 개 생성되는 것을 방지하는 싱글톤 패턴
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
