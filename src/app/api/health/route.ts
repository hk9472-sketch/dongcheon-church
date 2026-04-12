import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/health - Docker 헬스체크 + 모니터링
export async function GET() {
  const start = Date.now();
  let dbOk = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const status = dbOk ? "ok" : "degraded";
  const httpStatus = dbOk ? 200 : 503;

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: dbOk ? "connected" : "disconnected",
      responseTime: `${Date.now() - start}ms`,
    },
    { status: httpStatus }
  );
}
