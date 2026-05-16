import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * 발신자 식별 — dc_session 쿠키 우선, 없으면 body.fromGuest (sessionId).
 * 발신자 누락이면 null 반환.
 */
async function resolveSender(body: { fromGuest?: string; fromName?: string }) {
  const c = await cookies();
  const token = c.get("dc_session")?.value;
  if (token) {
    const s = await prisma.session.findUnique({ where: { sessionToken: token } });
    if (s && s.expires > new Date()) {
      const u = await prisma.user.findUnique({
        where: { id: s.userId },
        select: { id: true, name: true },
      });
      if (u) return { userId: u.id, guest: null, name: u.name };
    }
  }
  const guest = String(body?.fromGuest || "").slice(0, 64);
  if (!guest) return null;
  const name = String(body?.fromName || "방문자").slice(0, 50);
  return { userId: null, guest, name };
}

/**
 * POST /api/chat — 메시지 발송
 * body: { toUserId?, toGuest?, content, fromGuest?, fromName? }
 *   - 발신자: 로그인 사용자 우선, 없으면 body.fromGuest 사용
 *   - 수신자: toUserId XOR toGuest 중 하나만 (Phase 1)
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`chat-send:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ message: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const sender = await resolveSender(body);
  if (!sender) {
    return NextResponse.json({ message: "발신자 식별 실패" }, { status: 400 });
  }

  const toUserId = body?.toUserId ? Number(body.toUserId) : null;
  const toGuest = body?.toGuest ? String(body.toGuest).slice(0, 64) : null;
  const content = String(body?.content || "").trim();

  if (!toUserId && !toGuest) {
    return NextResponse.json({ message: "수신자가 필요합니다." }, { status: 400 });
  }
  if (toUserId && toGuest) {
    return NextResponse.json({ message: "수신자는 하나만 지정" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ message: "내용을 입력하세요." }, { status: 400 });
  }
  if (content.length > 2000) {
    return NextResponse.json({ message: "내용이 너무 깁니다." }, { status: 400 });
  }

  const created = await prisma.chatMessage.create({
    data: {
      fromUserId: sender.userId,
      fromGuest: sender.guest,
      fromName: sender.name,
      toUserId,
      toGuest,
      content,
    },
  });

  return NextResponse.json({ id: created.id, createdAt: created.createdAt });
}

/**
 * GET /api/chat?with=u:NUMBER 또는 ?with=g:SESSIONID
 *   대화 이력 조회. me ↔ 상대방 의 메시지 전체 (시간순).
 *
 * GET /api/chat (with 없음)
 *   안 읽은 메시지 요약 — 대화상대별 unread count.
 */
export async function GET(req: NextRequest) {
  const c = await cookies();
  const token = c.get("dc_session")?.value;
  const guestId = req.nextUrl.searchParams.get("guestId");

  let meUserId: number | null = null;
  let meGuest: string | null = null;
  if (token) {
    const s = await prisma.session.findUnique({ where: { sessionToken: token } });
    if (s && s.expires > new Date()) meUserId = s.userId;
  }
  if (!meUserId && guestId) meGuest = guestId.slice(0, 64);
  if (!meUserId && !meGuest) {
    return NextResponse.json({ message: "신원 확인 불가" }, { status: 400 });
  }

  const withParam = req.nextUrl.searchParams.get("with");

  if (withParam) {
    // 대화 이력
    const m = withParam.match(/^([ug]):(.+)$/);
    if (!m) return NextResponse.json({ message: "with 형식 오류" }, { status: 400 });
    const peerIsUser = m[1] === "u";
    const peerId = m[2];

    const peerUserId = peerIsUser ? parseInt(peerId, 10) : null;
    const peerGuest = peerIsUser ? null : peerId;

    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          {
            fromUserId: meUserId,
            fromGuest: meGuest,
            toUserId: peerUserId,
            toGuest: peerGuest,
          },
          {
            fromUserId: peerUserId,
            fromGuest: peerGuest,
            toUserId: meUserId,
            toGuest: meGuest,
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    return NextResponse.json({ messages });
  }

  // 안 읽은 메시지 요약 (수신만)
  const unread = await prisma.chatMessage.findMany({
    where: {
      readAt: null,
      ...(meUserId ? { toUserId: meUserId } : { toGuest: meGuest }),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ unread });
}
