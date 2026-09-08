import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isSecureRequest } from "@/lib/cookieSecure";

// POST /api/board/comment/verify-password
// body: { commentId: number, password: string }
// 성공 시: dc_comment_unlock_${commentId} 쿠키 30분 설정, { success: true }
// (게시글 verify-post-password 와 동일 프로세스)
export async function POST(request: NextRequest) {
  try {
    // Rate limit: IP당 5분에 5회 (무차별 대입 방지)
    const ip = getClientIp(request);
    const limit = checkRateLimit(`comment-verify:${ip}`, 5, 5 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, message: "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: limit.retryAfter ? { "Retry-After": String(limit.retryAfter) } : undefined },
      );
    }

    const body = await request.json().catch(() => ({}));
    const commentId = Number(body?.commentId);
    const password = typeof body?.password === "string" ? body.password : "";

    if (!commentId || Number.isNaN(commentId) || !password) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) {
      return NextResponse.json({ success: false, message: "댓글이 존재하지 않습니다." }, { status: 404 });
    }
    if (!comment.isSecret || !comment.password) {
      return NextResponse.json(
        { success: false, message: "비밀번호로 열람할 수 없는 댓글입니다." },
        { status: 400 },
      );
    }

    const valid = await verifyPassword(password, comment.password);
    if (!valid) {
      return NextResponse.json({ success: false, message: "비밀번호가 일치하지 않습니다." }, { status: 403 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(`dc_comment_unlock_${commentId}`, "1", {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: "lax",
      maxAge: 30 * 60, // 30분
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("verify-comment-password error:", error);
    return NextResponse.json({ success: false, message: "서버 오류" }, { status: 500 });
  }
}
