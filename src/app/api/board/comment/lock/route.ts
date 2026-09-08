import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hashPassword } from "@/lib/auth";

async function verifyAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires < new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

// POST /api/board/comment/lock
//   body: { commentIds: number[], lock: boolean, password?: string }
//   lock=true  → isSecret=true. password 있으면 그 비번(해시)으로 공유 열람 가능(게시글 비밀글과 동일).
//                password 비우면 관리자·작성자만 열람(비번 열람 불가).
//   lock=false → 잠금 해제(isSecret=false). password 는 건드리지 않음(비회원 댓글의 수정·삭제 비번 보존).
//   관리자(isAdmin<=2) 만 가능.
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  try {
    const { commentIds, lock, password } = await request.json();
    if (!Array.isArray(commentIds) || commentIds.length === 0) {
      return NextResponse.json({ message: "댓글을 선택하세요." }, { status: 400 });
    }
    const ids = commentIds.filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) {
      return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
    }

    let res;
    if (lock) {
      const pw = typeof password === "string" ? password.trim() : "";
      const data: { isSecret: boolean; password?: string } = { isSecret: true };
      if (pw) data.password = await hashPassword(pw); // 공유 열람 비번(해시)
      res = await prisma.comment.updateMany({ where: { id: { in: ids } }, data });
      return NextResponse.json({ updated: res.count, lock: true, hasPassword: !!pw });
    } else {
      res = await prisma.comment.updateMany({
        where: { id: { in: ids } },
        data: { isSecret: false }, // password 는 보존(비회원 수정/삭제 비번 유지)
      });
      return NextResponse.json({ updated: res.count, lock: false });
    }
  } catch (error) {
    console.error("Comment lock error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
