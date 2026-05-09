import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyPassword } from "@/lib/auth";

/**
 * POST /api/board/verify-password
 * body: { postId, password }
 * 글의 비밀번호가 맞는지만 확인 (수정 모드 진입 전 사전 검증).
 * 실제 수정/삭제 시에도 한 번 더 검증됨 (서버 신뢰).
 */
export async function POST(req: NextRequest) {
  try {
    const { postId, password } = await req.json();
    if (!postId || typeof postId !== "number") {
      return NextResponse.json({ ok: false, message: "유효하지 않은 ID" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return NextResponse.json({ ok: false, message: "비밀번호가 필요합니다." }, { status: 400 });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { password: true },
    });
    if (!post) {
      return NextResponse.json({ ok: false, message: "글이 없습니다." }, { status: 404 });
    }
    if (!post.password) {
      return NextResponse.json(
        { ok: false, message: "비밀번호가 설정되지 않은 글입니다." },
        { status: 400 },
      );
    }

    const valid = await verifyPassword(password, post.password);
    if (!valid) {
      return NextResponse.json({ ok: false, message: "비밀번호가 일치하지 않습니다." }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, message: "서버 오류" }, { status: 500 });
  }
}
