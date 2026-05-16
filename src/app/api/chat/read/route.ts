import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

/**
 * POST /api/chat/read
 * body: { with: "u:N" | "g:SESSIONID", guestId?: string }
 * 대화상대로부터 받은 메시지를 모두 읽음 처리.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const withParam = String(body?.with || "");
  const guestId = body?.guestId ? String(body.guestId).slice(0, 64) : null;

  const c = await cookies();
  const token = c.get("dc_session")?.value;
  let meUserId: number | null = null;
  let meGuest: string | null = null;
  if (token) {
    const s = await prisma.session.findUnique({ where: { sessionToken: token } });
    if (s && s.expires > new Date()) meUserId = s.userId;
  }
  if (!meUserId && guestId) meGuest = guestId;
  if (!meUserId && !meGuest) {
    return NextResponse.json({ message: "신원 확인 불가" }, { status: 400 });
  }

  const m = withParam.match(/^([ug]):(.+)$/);
  if (!m) return NextResponse.json({ message: "with 형식 오류" }, { status: 400 });
  const peerIsUser = m[1] === "u";
  const peerId = m[2];

  await prisma.chatMessage.updateMany({
    where: {
      readAt: null,
      ...(meUserId ? { toUserId: meUserId } : { toGuest: meGuest }),
      fromUserId: peerIsUser ? parseInt(peerId, 10) : null,
      fromGuest: peerIsUser ? null : peerId,
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
