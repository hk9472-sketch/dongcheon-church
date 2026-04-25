import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/admin/backup/history?limit=30
// 최근 백업 이력. 관리자 전용.

async function requireAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(100, Math.max(1, parseInt(limitRaw || "30", 10) || 30));

  const items = await prisma.backupHistory.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    items: items.map((it) => ({
      id: it.id,
      startedAt: it.startedAt.toISOString(),
      endedAt: it.endedAt ? it.endedAt.toISOString() : null,
      durationMs: it.durationMs,
      type: it.type,
      trigger: it.trigger,
      success: it.success,
      filesCount: it.filesCount,
      details: it.details,
      errorMessage: it.errorMessage,
    })),
  });
}
