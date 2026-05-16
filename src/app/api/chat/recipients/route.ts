import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { listActive } from "@/lib/activePresence";

/**
 * GET /api/chat/recipients?q=...&limit=300
 * 회원 목록 — 선별 발송용. 관리자(isAdmin <= 2) 만 호출 가능.
 * 활성 상태(heartbeat 60초) 도 함께 표시.
 */
export async function GET(req: NextRequest) {
  const c = await cookies();
  const token = c.get("dc_session")?.value;
  if (!token) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const s = await prisma.session.findUnique({ where: { sessionToken: token } });
  if (!s || s.expires <= new Date()) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }
  const me = await prisma.user.findUnique({
    where: { id: s.userId },
    select: { isAdmin: true },
  });
  if (!me || me.isAdmin > 2) {
    return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const limit = Math.min(500, parseInt(req.nextUrl.searchParams.get("limit") || "300", 10) || 300);

  const users = await prisma.user.findMany({
    where: q ? {
      OR: [
        { name: { contains: q } },
        { userId: { contains: q } },
      ],
    } : {},
    select: { id: true, userId: true, name: true, isAdmin: true, email: true },
    orderBy: { name: "asc" },
    take: limit,
  });

  // 활성 사용자 매핑
  const activeIds = new Set(listActive().filter((r) => r.userId).map((r) => r.userId!));

  return NextResponse.json({
    list: users.map((u) => ({
      id: u.id,
      userId: u.userId,
      name: u.name,
      hasEmail: !!u.email,
      isAdmin: u.isAdmin <= 2,
      isActive: activeIds.has(u.id),
    })),
  });
}
