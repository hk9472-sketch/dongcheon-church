import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { listActive, countActive } from "@/lib/activePresence";

/**
 * GET /api/active
 * 활성 사용자 목록 조회 — 최고관리자(isAdmin === 1)만.
 */
export async function GET() {
  const c = await cookies();
  const token = c.get("dc_session")?.value;
  if (!token) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const s = await prisma.session.findUnique({ where: { sessionToken: token } });
  if (!s || s.expires <= new Date()) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }
  const u = await prisma.user.findUnique({
    where: { id: s.userId },
    select: { isAdmin: true },
  });
  if (!u || u.isAdmin !== 1) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const list = listActive();
  const counts = countActive();
  return NextResponse.json({
    counts,
    list: list.map((r) => ({
      sessionId: r.sessionId.slice(0, 8), // ID 일부만 노출
      userId: r.userId,
      userName: r.userName,
      ip: r.ip,
      path: r.path,
      lastPingAt: r.lastPingAt,
    })),
  });
}
