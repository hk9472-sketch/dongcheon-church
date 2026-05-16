import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

interface Thread {
  peerKey: string;            // "u:N" | "g:SESSIONID" | "b:"
  peerName: string;
  lastContent: string;
  lastAt: string;
  unread: number;
  isBroadcast: boolean;
}

/**
 * GET /api/chat/threads?guestId=...
 * 내 대화 상대별 마지막 메시지 + 안 읽은 수.
 * broadcast 도 별도 thread 로.
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

  // 내가 발신했거나 수신한 1:1 메시지 + broadcast 별도
  const myMessages = await prisma.chatMessage.findMany({
    where: {
      toBroadcast: false,
      deletedAt: null,
      OR: [
        { fromUserId: meUserId, fromGuest: meGuest },
        ...(meUserId ? [{ toUserId: meUserId }] : []),
        ...(meGuest ? [{ toGuest: meGuest }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const threadMap = new Map<string, Thread>();
  for (const m of myMessages) {
    const isFromMe =
      (meUserId && m.fromUserId === meUserId) ||
      (meGuest && m.fromGuest === meGuest);
    const peerUserId = isFromMe ? m.toUserId : m.fromUserId;
    const peerGuest = isFromMe ? m.toGuest : m.fromGuest;
    const peerName = isFromMe ? "(상대)" : m.fromName;
    const key = peerUserId ? `u:${peerUserId}` : `g:${peerGuest}`;
    const existing = threadMap.get(key);
    if (!existing) {
      threadMap.set(key, {
        peerKey: key,
        peerName: peerUserId ? (isFromMe ? `회원#${peerUserId}` : m.fromName) : (isFromMe ? `방문자` : m.fromName),
        lastContent: m.content || (m.attachName ? `📎 ${m.attachName}` : ""),
        lastAt: m.createdAt.toISOString(),
        unread: 0,
        isBroadcast: false,
      });
    }
    // 안 읽은 수신만 카운트
    if (!isFromMe && !m.readAt) {
      const t = threadMap.get(key)!;
      t.unread += 1;
    }
  }

  // 회원 이름 보강
  const userIdsToResolve = Array.from(threadMap.keys())
    .filter((k) => k.startsWith("u:"))
    .map((k) => parseInt(k.slice(2), 10))
    .filter((n) => Number.isFinite(n));
  if (userIdsToResolve.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIdsToResolve } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(users.map((u) => [u.id, u.name]));
    for (const t of threadMap.values()) {
      if (t.peerKey.startsWith("u:")) {
        const id = parseInt(t.peerKey.slice(2), 10);
        const nm = nameMap.get(id);
        if (nm) t.peerName = nm;
      }
    }
  }

  // broadcast — 최신 한 건 + 안 읽은 수
  const broadcastList = await prisma.chatMessage.findMany({
    where: { toBroadcast: true, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  if (broadcastList.length > 0) {
    const last = broadcastList[0];
    threadMap.set("b:", {
      peerKey: "b:",
      peerName: "📢 전체 공지",
      lastContent: last.content || (last.attachName ? `📎 ${last.attachName}` : ""),
      lastAt: last.createdAt.toISOString(),
      unread: 0,
      isBroadcast: true,
    });
  }

  const threads = Array.from(threadMap.values()).sort(
    (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
  );

  return NextResponse.json({ threads });
}
