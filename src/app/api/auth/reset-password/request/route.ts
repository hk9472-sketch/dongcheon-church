import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";

// POST /api/auth/reset-password/request
export async function POST(request: NextRequest) {
  try {
    const { userId, email } = await request.json();

    if (!userId || !email) {
      return NextResponse.json(
        { message: "아이디와 이메일을 입력하세요." },
        { status: 400 }
      );
    }

    // 항상 동일한 응답 (유저 열거 방지)
    const successMessage = "입력하신 정보와 일치하는 계정이 있으면 이메일이 발송됩니다.";

    const user = await prisma.user.findUnique({ where: { userId } });

    if (!user) {
      console.log("[PW-RESET] 사용자 없음:", userId);
      return NextResponse.json({ message: successMessage });
    }

    if (!user.email) {
      console.log("[PW-RESET] 이메일 미등록 사용자:", userId);
      return NextResponse.json({ message: successMessage });
    }

    if (user.email.toLowerCase() !== email.toLowerCase()) {
      console.log("[PW-RESET] 이메일 불일치:", userId, "| DB:", user.email, "| 입력:", email);
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
      console.log("[PW-RESET] 토큰 제한 초과:", userId, "| 활성 토큰:", activeTokenCount);
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

    console.log("[PW-RESET] 이메일 발송 시도:", user.email);
    console.log("[PW-RESET] SMTP 설정:", {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 3)}***` : "(미설정)",
      pass: process.env.SMTP_PASS ? "(설정됨)" : "(미설정)",
    });

    await sendPasswordResetEmail(user.email, resetUrl, user.name);

    console.log("[PW-RESET] 이메일 발송 성공:", user.email);
    return NextResponse.json({ message: successMessage });
  } catch (error) {
    console.error("Password reset request error:", error);
    return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
