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

// POST /api/admin/posts/lock
//   body: { postIds: number[], lock: boolean, password?: string }
//   lock=true  → isSecret=true. password 있으면 그 비번(해시)으로 공유 열람(댓글 잠금과 동일).
//                password 비우면 관리자·작성자만 열람(비번 열람 불가).
//   lock=false → 잠금 해제(isSecret=false). password 는 보존(비회원 수정/삭제 비번 유지).
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  try {
    const { postIds, lock, password } = await req.json();
    if (!Array.isArray(postIds) || postIds.length === 0) {
      return NextResponse.json({ error: "글을 선택하세요." }, { status: 400 });
    }
    const ids = postIds.filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    if (lock) {
      const pw = typeof password === "string" ? password.trim() : "";
      const data: { isSecret: boolean; password?: string } = { isSecret: true };
      if (pw) data.password = await hashPassword(pw);
      const r = await prisma.post.updateMany({ where: { id: { in: ids } }, data });
      return NextResponse.json({ ok: true, updated: r.count, lock: true, hasPassword: !!pw });
    } else {
      const r = await prisma.post.updateMany({
        where: { id: { in: ids } },
        data: { isSecret: false }, // password 는 보존
      });
      return NextResponse.json({ ok: true, updated: r.count, lock: false });
    }
  } catch (e) {
    console.error("post lock error:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
