import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { hashPassword } from "@/lib/auth";

async function requireAdmin() {
  const c = await cookies();
  const token = c.get("dc_session")?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { sessionToken: token } });
  if (!s || s.expires <= new Date()) return null;
  const u = await prisma.user.findUnique({ where: { id: s.userId } });
  if (!u || u.isAdmin > 2) return null;
  return u;
}

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/posts/[id]/password
 * body: { password: string }
 *   - 비어있으면 비번 제거 (NULL)
 *   - 값이 있으면 hash 후 저장
 *
 * 관리자가 게시글에 비번을 직접 부여/초기화하기 위함.
 * 부여 후 비로그인 사용자도 그 비번으로 수정/삭제 가능.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id))
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const pw = String(body?.password ?? "");

  const post = await prisma.post.findUnique({ where: { id }, select: { id: true } });
  if (!post) return NextResponse.json({ error: "글 없음" }, { status: 404 });

  if (pw.trim().length === 0) {
    // 비번 제거
    await prisma.post.update({
      where: { id },
      data: { password: null },
    });
    return NextResponse.json({ ok: true, action: "cleared" });
  }

  const hashed = await hashPassword(pw);
  await prisma.post.update({
    where: { id },
    data: { password: hashed },
  });
  return NextResponse.json({ ok: true, action: "set" });
}
