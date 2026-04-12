import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { hashPassword } from "@/lib/auth";

// POST /api/auth/migration-login
// 이관된 레거시 회원의 최초 비밀번호 설정 + 로그인
// legacyPwHash가 남아 있는 계정만 사용 가능
export async function POST(request: NextRequest) {
  try {
    const { userId, password, confirmPassword } = await request.json();

    if (!userId || !password || !confirmPassword) {
      return NextResponse.json({ message: "필수 항목을 입력하세요." }, { status: 400 });
    }

    if (password.length < 4) {
      return NextResponse.json({ message: "비밀번호는 4자 이상 입력하세요." }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ message: "비밀번호가 일치하지 않습니다." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) {
      return NextResponse.json({ message: "존재하지 않는 아이디입니다." }, { status: 401 });
    }

    // 이관된 레거시 회원만 이 플로우 사용 가능 (legacyPwHash != null)
    // 이미 비밀번호를 설정한 계정은 일반 로그인 또는 비밀번호 초기화 이용
    if (!user.legacyPwHash) {
      return NextResponse.json(
        { message: "이미 비밀번호가 설정된 계정입니다. 비밀번호 초기화를 이용해 주세요." },
        { status: 400 }
      );
    }

    // 새 비밀번호 설정: bcrypt 해시 저장, legacyPwHash 초기화
    const hashedPassword = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, legacyPwHash: null },
    });

    console.log("[MIGRATION-LOGIN] 비밀번호 설정 완료:", userId);

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
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Migration login error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
