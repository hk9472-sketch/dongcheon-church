import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { verifyPassword } from "@/lib/auth";

// POST /api/auth/login
export async function POST(request: NextRequest) {
  try {
    const { userId, password } = await request.json();

    if (!userId || !password) {
      return NextResponse.json({ message: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) {
      return NextResponse.json({ message: "존재하지 않는 아이디입니다." }, { status: 401 });
    }

    console.log("[LOGIN] 로그인 시도:", userId, "| pw해시:", user.password.substring(0, 20) + "...", "| legacy:", user.legacyPwHash);
    const valid = await verifyPassword(password, user.password, user.legacyPwHash, user.id);
    console.log("[LOGIN] 비밀번호 검증 결과:", valid);
    if (!valid) {
      // 이관된 레거시 회원(legacyPwHash 존재)은 비밀번호 설정 플로우로 안내
      if (user.legacyPwHash) {
        return NextResponse.json(
          { message: "이관된 계정입니다.", isMigrationUser: true },
          { status: 401 }
        );
      }
      return NextResponse.json({ message: "비밀번호가 일치하지 않습니다." }, { status: 401 });
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

    const isHttps = (process.env.SITE_URL || "").startsWith("https");
    response.cookies.set("dc_session", sessionToken, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      expires,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
