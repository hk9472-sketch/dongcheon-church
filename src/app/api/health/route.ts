import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/health - Docker 헬스체크 + 모니터링 (uptime/memory/session count 포함)
export async function GET() {
  const start = Date.now();
  let dbOk = false;
  let activeSessions: number | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  if (dbOk) {
    try {
      activeSessions = await prisma.session.count({
        where: { expires: { gt: new Date() } },
      });
    } catch {
      activeSessions = null;
    }
  }

  const status = dbOk ? "ok" : "degraded";
  const httpStatus = dbOk ? 200 : 503;

  const mem = process.memoryUsage();
  const toMB = (b: number) => Math.round((b / 1024 / 1024) * 10) / 10;

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      uptimeHuman: formatUptime(process.uptime()),
      db: dbOk ? "connected" : "disconnected",
      activeSessions,
      memory: {
        rssMB: toMB(mem.rss),
        heapUsedMB: toMB(mem.heapUsed),
        heapTotalMB: toMB(mem.heapTotal),
        externalMB: toMB(mem.external),
      },
      node: process.version,
      responseTime: `${Date.now() - start}ms`,
    },
    { status: httpStatus }
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}
