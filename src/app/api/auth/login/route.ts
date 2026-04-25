import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isSecureRequest } from "@/lib/cookieSecure";
import { signLegacyToken } from "@/lib/legacyToken";

// POST /api/auth/login
export async function POST(request: NextRequest) {
  try {
    // Rate limit: IP당 10분에 5회
    const ip = getClientIp(request);
    const limit = checkRateLimit(`login:${ip}`, 5, 10 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: limit.retryAfter ? { "Retry-After": String(limit.retryAfter) } : undefined }
      );
    }

    const { userId, password } = await request.json();

    if (!userId || !password) {
      return NextResponse.json({ message: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) {
      return NextResponse.json({ message: "존재하지 않는 아이디입니다." }, { status: 401 });
    }

    // verifyPassword 내부에서 legacyPwHash도 검증함 (이관 회원은 구 비밀번호로도 로그인 가능)
    const valid = await verifyPassword(password, user.password, user.legacyPwHash, user.id);
    if (!valid) {
      return NextResponse.json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    // 세션 생성
    const sessionToken = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7일

    await prisma.session.create({
      data: { sessionToken, userId: user.id, expires },
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        userId: user.userId,
        name: user.name,
        level: user.level,
        isAdmin: user.isAdmin,
      },
    });

    response.cookies.set("dc_session", sessionToken, {
      httpOnly: true,
      // HTTPS 요청일 때만 Secure (HTTP 배포 중에도 로그인 유지 위해)
      secure: isSecureRequest(request),
      sameSite: "lax",
      expires,
      path: "/",
    });

    // 레거시 ZB 사이트 (pkistdc.net:8080) SSO 게이트용 토큰.
    // HTTP 포트라 Secure 플래그는 설정하지 않음 (설정하면 :8080 에서 전송 안 됨).
    // 신홈 세션과 별개의 stateless HMAC 토큰 — 만료 7일.
    if (process.env.LEGACY_TOKEN_SECRET) {
      const legacyToken = signLegacyToken({ userId: user.id, expires: expires.getTime() });
      response.cookies.set("dc_legacy_token", legacyToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        expires,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
