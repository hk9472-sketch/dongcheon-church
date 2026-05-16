import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

async function getMe(req: NextRequest) {
  const c = await cookies();
  const token = c.get("dc_session")?.value;
  let userId: number | null = null;
  let isAdmin = 99;
  if (token) {
    const s = await prisma.session.findUnique({ where: { sessionToken: token } });
    if (s && s.expires > new Date()) {
      const u = await prisma.user.findUnique({
        where: { id: s.userId },
        select: { id: true, isAdmin: true },
      });
      if (u) {
        userId = u.id;
        isAdmin = u.isAdmin;
      }
    }
  }
  const guestId =
    req.nextUrl.searchParams.get("guestId") ||
    (await req.clone().json().catch(() => ({})))?.guestId ||
    null;
  return { userId, isAdmin, guestId: guestId ? String(guestId).slice(0, 64) : null };
}

/**
 * DELETE /api/chat/:id  → 본인이 발신한 메시지만 soft delete.
 *   관리자(isAdmin <= 2) 는 누구의 메시지든 삭제 가능 (운영 목적).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mid = parseInt(id, 10);
  if (!Number.isFinite(mid)) {
    return NextResponse.json({ message: "id 오류" }, { status: 400 });
  }
  const me = await getMe(req);

  const msg = await prisma.chatMessage.findUnique({ where: { id: mid } });
  if (!msg) return NextResponse.json({ message: "메시지를 찾을 수 없음" }, { status: 404 });

  const isSenderUser = me.userId && msg.fromUserId === me.userId;
  const isSenderGuest = me.guestId && msg.fromGuest === me.guestId;
  const isAdmin = me.isAdmin <= 2;

  if (!isSenderUser && !isSenderGuest && !isAdmin) {
    return NextResponse.json({ message: "본인이 보낸 메시지만 삭제할 수 있습니다." }, { status: 403 });
  }

  await prisma.chatMessage.update({
    where: { id: mid },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
