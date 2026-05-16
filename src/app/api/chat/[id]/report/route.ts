import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

/**
 * POST /api/chat/:id/report  → 메시지 신고.
 * body: { note?: string }
 * 회원만 신고 가능 (비회원은 식별 어려움). 같은 회원이 두 번 신고하면
 * note 만 갱신.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mid = parseInt(id, 10);
  if (!Number.isFinite(mid)) {
    return NextResponse.json({ message: "id 오류" }, { status: 400 });
  }

  const c = await cookies();
  const token = c.get("dc_session")?.value;
  if (!token) return NextResponse.json({ message: "로그인 필요" }, { status: 401 });
  const s = await prisma.session.findUnique({ where: { sessionToken: token } });
  if (!s || s.expires <= new Date()) {
    return NextResponse.json({ message: "로그인 필요" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const note = body?.note ? String(body.note).slice(0, 500) : null;

  const msg = await prisma.chatMessage.findUnique({ where: { id: mid } });
  if (!msg) return NextResponse.json({ message: "메시지를 찾을 수 없음" }, { status: 404 });

  await prisma.chatMessage.update({
    where: { id: mid },
    data: {
      reportedBy: s.userId,
      reportedAt: new Date(),
      reportNote: note,
    },
  });

  return NextResponse.json({ ok: true });
}
