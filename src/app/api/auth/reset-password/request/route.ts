import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// POST /api/auth/reset-password/request
export async function POST(request: NextRequest) {
  try {
    // Rate limit: IP당 1시간 3회
    const ip = getClientIp(request);
    const ipLimit = checkRateLimit(`pw-reset-ip:${ip}`, 3, 60 * 60 * 1000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: ipLimit.retryAfter ? { "Retry-After": String(ipLimit.retryAfter) } : undefined }
      );
    }

    const { userId, email } = await request.json();

    if (!userId || !email) {
      return NextResponse.json(
        { message: "아이디와 이메일을 입력하세요." },
        { status: 400 }
      );
    }

    // 이메일 기준 Rate limit: 이메일당 1시간 3회
    const emailKey = typeof email === "string" ? email.toLowerCase().trim() : "";
    if (emailKey) {
      const emailLimit = checkRateLimit(`pw-reset-email:${emailKey}`, 3, 60 * 60 * 1000);
      if (!emailLimit.allowed) {
        return NextResponse.json(
          { message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
          { status: 429, headers: emailLimit.retryAfter ? { "Retry-After": String(emailLimit.retryAfter) } : undefined }
        );
      }
    }

    // 항상 동일한 응답 (유저 열거 방지)
    const successMessage = "입력하신 정보와 일치하는 계정이 있으면 이메일이 발송됩니다.";

    const user = await prisma.user.findUnique({ where: { userId } });

    if (!user) {
      return NextResponse.json({ message: successMessage });
    }

    if (!user.email) {
      return NextResponse.json({ message: successMessage });
    }

    if (user.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ message: successMessage });
    }

    // 사용자당 활성 토큰 최대 3개 제한
    const activeTokenCount = await prisma.passwordReset.count({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (activeTokenCount >= 3) {
      return NextResponse.json({ message: successMessage });
    }

    // 토큰 생성 (1시간 유효)
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordReset.create({
      data: { token, userId: user.id, expiresAt },
    });

    const siteUrl = process.env.SITE_URL || "http://localhost:3000";
    const resetUrl = `${siteUrl}/auth/reset-password?token=${token}`;

    await sendPasswordResetEmail(user.email, resetUrl, user.name);

    return NextResponse.json({ message: successMessage });
  } catch (error) {
    console.error("Password reset request error:", error);
    return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
