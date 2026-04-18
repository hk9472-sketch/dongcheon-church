import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// POST /api/auth/resend-verify
// 이메일 인증 메일 재발송 (선택: 이메일 주소 수정).
// 본인 확인: userId + 비밀번호. 이미 인증된 계정은 거부.
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const limit = checkRateLimit(`resend-verify:${ip}`, 5, 60 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: limit.retryAfter ? { "Retry-After": String(limit.retryAfter) } : undefined }
      );
    }

    const { userId, password, newEmail } = await request.json();

    if (!userId || !password) {
      return NextResponse.json({ message: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) {
      // 계정 존재 여부 노출 방지
      return NextResponse.json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const ok = await verifyPassword(password, user.password, user.legacyPwHash);
    if (!ok) {
      return NextResponse.json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ message: "이미 인증된 계정입니다." }, { status: 400 });
    }

    // 이메일 수정이 요청된 경우
    let targetEmail = user.email || "";
    if (newEmail && typeof newEmail === "string") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return NextResponse.json({ message: "올바른 이메일 주소를 입력하세요." }, { status: 400 });
      }
      targetEmail = newEmail;
    }

    if (!targetEmail) {
      return NextResponse.json({ message: "이메일이 등록되어 있지 않습니다." }, { status: 400 });
    }

    const verifyToken = randomBytes(32).toString("hex");
    const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: targetEmail,
        emailVerifyToken: verifyToken,
        emailVerifyExpiry: verifyExpiry,
      },
    });

    const siteUrl = process.env.SITE_URL || "http://localhost:3000";
    const verifyUrl = `${siteUrl}/api/auth/verify-email?token=${verifyToken}`;
    await sendVerificationEmail(targetEmail, verifyUrl, user.name);

    return NextResponse.json({
      message: `${targetEmail} 로 인증 메일을 재발송했습니다.`,
    });
  } catch (error) {
    console.error("Resend verify error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
