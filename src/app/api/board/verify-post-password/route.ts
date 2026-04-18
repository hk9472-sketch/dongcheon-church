import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isSecureRequest } from "@/lib/cookieSecure";

// POST /api/board/verify-post-password
// body: { postId: number, password: string }
// 성공 시: dc_post_unlock_${postId} 쿠키 30분 설정, { success: true }
// 실패 시: { success: false, message: "비밀번호가 일치하지 않습니다" }
export async function POST(request: NextRequest) {
  try {
    // Rate limit: IP당 5분에 5회 (무차별 대입 방지)
    const ip = getClientIp(request);
    const limit = checkRateLimit(`post-verify:${ip}`, 5, 5 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, message: "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: limit.retryAfter ? { "Retry-After": String(limit.retryAfter) } : undefined }
      );
    }

    const body = await request.json().catch(() => ({}));
    const postId = Number(body?.postId);
    const password = typeof body?.password === "string" ? body.password : "";

    if (!postId || Number.isNaN(postId) || !password) {
      return NextResponse.json(
        { success: false, message: "잘못된 요청입니다." },
        { status: 400 }
      );
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      return NextResponse.json(
        { success: false, message: "게시글이 존재하지 않습니다." },
        { status: 404 }
      );
    }

    // 비회원이 작성한 비밀글만 unlock 대상
    if (post.authorId !== null || !post.password) {
      return NextResponse.json(
        { success: false, message: "비밀번호로 열람할 수 없는 글입니다." },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(password, post.password);
    if (!valid) {
      return NextResponse.json(
        { success: false, message: "비밀번호가 일치하지 않습니다." },
        { status: 403 }
      );
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(`dc_post_unlock_${postId}`, "1", {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: "lax",
      maxAge: 30 * 60, // 30분
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("verify-post-password error:", error);
    return NextResponse.json(
      { success: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}
