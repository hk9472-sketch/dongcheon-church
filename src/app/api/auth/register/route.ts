import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { verifyCaptcha } from "@/lib/captcha";
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

    // 유효성 검사 — email 은 선택 입력
    if (!userId || !password || !name) {
      return NextResponse.json({ message: "아이디, 비밀번호, 이름은 필수입니다." }, { status: 400 });
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
    // 이메일 입력한 경우에만 형식 검증
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: "올바른 이메일 주소를 입력하세요." }, { status: 400 });
    }

    // 아이디 중복 확인
    const existingId = await prisma.user.findUnique({ where: { userId } });
    if (existingId) {
      return NextResponse.json({ message: "이미 사용 중인 아이디입니다." }, { status: 409 });
    }

    // 이메일 중복 확인 — 입력된 경우만. 빈 이메일은 중복으로 안 잡음.
    if (email) {
      const existingEmail = await prisma.user.findFirst({ where: { email } });
      if (existingEmail) {
        return NextResponse.json(
          { message: "이미 사용 중인 이메일입니다. 비밀번호를 잊으셨다면 비밀번호 찾기를 이용해 주세요." },
          { status: 409 }
        );
      }
    }

    const hashedPassword = await hashPassword(password);

    // 즉시 활성 가입 — 이메일 인증/관리자 승인 단계 없음.
    // 부적절한 가입자는 사후 회원 관리 페이지에서 삭제(탈퇴 처리).
    const user = await prisma.user.create({
      data: {
        userId,
        password: hashedPassword,
        name,
        email: email || null,
        phone: phone || null,
        level: 10,
        isAdmin: 3,
        groupNo: 1,
        emailVerified: true,
      },
    });

    return NextResponse.json({
      message: "회원가입이 완료되었습니다. 바로 로그인하실 수 있습니다.",
      user: { id: user.id, userId: user.userId, name: user.name },
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
