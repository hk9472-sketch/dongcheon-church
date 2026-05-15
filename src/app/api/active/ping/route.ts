import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { recordPing } from "@/lib/activePresence";
import { getClientIp } from "@/lib/rateLimit";

/**
 * POST /api/active/ping
 * body: { sessionId: string; path?: string }
 *
 * 모든 클라이언트(로그인/비로그인) 가 30초마다 호출.
 * dc_session 쿠키에서 user 자동 추출.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessionId = String(body?.sessionId || "").slice(0, 64);
  const path = String(body?.path || "/").slice(0, 200);
  if (!sessionId) {
    return NextResponse.json({ skipped: true, reason: "no-session-id" }, { status: 400 });
  }

  // 로그인 사용자 식별 (선택)
  let userId: number | null = null;
  let userName: string | null = null;
  try {
    const c = await cookies();
    const token = c.get("dc_session")?.value;
    if (token) {
      const s = await prisma.session.findUnique({ where: { sessionToken: token } });
      if (s && s.expires > new Date()) {
        const u = await prisma.user.findUnique({
          where: { id: s.userId },
          select: { id: true, name: true },
        });
        if (u) {
          userId = u.id;
          userName = u.name;
        }
      }
    }
  } catch {
    // 인증 실패해도 ping 자체는 기록 (비회원으로)
  }

  const ip = getClientIp(req);

  recordPing({ sessionId, userId, userName, ip, path });

  return NextResponse.json({ ok: true });
}
