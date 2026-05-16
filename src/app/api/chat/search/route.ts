import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

/**
 * GET /api/chat/search?q=...&guestId=...
 * 내가 발신/수신한 메시지의 content 부분 일치 검색.
 * 결과 50건. broadcast 도 포함.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ messages: [] });
  }

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

  const messages = await prisma.chatMessage.findMany({
    where: {
      deletedAt: null,
      content: { contains: q },
      OR: [
        { toBroadcast: true },
        ...(meUserId
          ? [{ fromUserId: meUserId }, { toUserId: meUserId }]
          : []),
        ...(meGuest
          ? [{ fromGuest: meGuest }, { toGuest: meGuest }]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ messages });
}
