import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { verifyCaptcha } from "@/lib/captcha";
import { sendVerificationEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// POST /api/auth/register
export async function POST(request: NextRequest) {
  try {
    // Rate limit: IP당 1시간에 3회
    const ip = getClientIp(request);
    const limit = checkRateLimit(`register:${ip}`, 3, 60 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "회원가입 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: limit.retryAfter ? { "Retry-After": String(limit.retryAfter) } : undefined }
      );
    }

    const {
      userId, password, passwordConfirm, name, email, phone,
      captchaAnswer, captchaToken,
    } = await request.json();

    // CAPTCHA 검증
    if (!captchaAnswer || !captchaToken || !verifyCaptcha(captchaAnswer, captchaToken)) {
      return NextResponse.json({ message: "자동 입력 방지 정답이 올바르지 않습니다." }, { status: 400 });
    }

    // 유효성 검사
    if (!userId || !password || !name || !email) {
      return NextResponse.json({ message: "아이디, 비밀번호, 이름, 이메일은 필수입니다." }, { status: 400 });
    }
    if (userId.length < 3 || userId.length > 20) {
      return NextResponse.json({ message: "아이디는 3~20자로 입력하세요." }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(userId)) {
      return NextResponse.json({ message: "아이디는 영문, 숫자, 밑줄만 사용 가능합니다." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ message: "비밀번호는 8자 이상 입력하세요." }, { status: 400 });
    }
    if (password !== passwordConfirm) {
      return NextResponse.json({ message: "비밀번호가 일치하지 않습니다." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: "올바른 이메일 주소를 입력하세요." }, { status: 400 });
    }

    // 중복 확인
    const existing = await prisma.user.findUnique({ where: { userId } });
    if (existing) {
      return NextResponse.json({ message: "이미 사용 중인 아이디입니다." }, { status: 409 });
    }

    // 이메일 인증 토큰 생성 (24시간 유효)
    const verifyToken = randomBytes(32).toString("hex");
    const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        userId,
        password: hashedPassword,
        name,
        email,
        phone: phone || null,
        level: 10,
        isAdmin: 3,
        groupNo: 1,
        emailVerified: false,
        emailVerifyToken: verifyToken,
        emailVerifyExpiry: verifyExpiry,
      },
    });

    // 인증 메일 발송
    const siteUrl = process.env.SITE_URL || "http://localhost:3000";
    const verifyUrl = `${siteUrl}/api/auth/verify-email?token=${verifyToken}`;

    try {
      await sendVerificationEmail(email, verifyUrl, name);
    } catch (emailErr) {
      console.error("[REGISTER] 인증 메일 발송 실패:", emailErr);
      // 메일 발송 실패해도 가입은 완료 처리 (SMTP 미설정 환경 고려)
    }

    return NextResponse.json({
      message: "회원가입이 완료되었습니다. 입력하신 이메일로 인증 링크를 발송했습니다.",
      needEmailVerify: true,
      user: { id: user.id, userId: user.userId, name: user.name },
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
