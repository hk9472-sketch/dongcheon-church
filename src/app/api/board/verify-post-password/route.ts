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

    // 비번 hash 가 저장된 글만 unlock 대상.
    // 비회원 글은 작성 비번이 자동으로 unlock 비번 역할.
    // 회원 글은 비밀글 작성 시 별도 unlock 비번을 설정한 경우만.
    if (!post.password) {
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

    // 평문 비번이었는지 판단 — bcrypt/legacy 형식 어디에도 안 맞으면 평문.
    // 평문 매칭이라는 건 관리자가 임시 SET 한 비번을 사용자가 입력한 케이스.
    // → 즉시 password 를 null 로 비워 다음에 작성자가 글 수정 시점에 새 비번을
    //   다시 입력하도록 강제. 그동안 unlock 쿠키로만 30분 열람 가능.
    const stored = post.password!;
    const isPlaintext =
      !stored.startsWith("$2") &&
      !(stored.length === 41 && stored.startsWith("*")) &&
      !(stored.length === 16 && /^[0-9a-fA-F]+$/.test(stored));
    if (isPlaintext) {
      await prisma.post.update({
        where: { id: postId },
        data: { password: null },
      });
    }

    const response = NextResponse.json({ success: true, plaintextReset: isPlaintext });
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
