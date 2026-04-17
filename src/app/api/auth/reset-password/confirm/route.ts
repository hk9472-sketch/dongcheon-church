import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hashPassword } from "@/lib/auth";

// POST /api/auth/reset-password/confirm
export async function POST(request: NextRequest) {
  try {
    const { token, password, passwordConfirm } = await request.json();

    if (!token || !password) {
      return NextResponse.json(
        { message: "필수 항목을 입력하세요." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { message: "비밀번호는 8자 이상 입력하세요." },
        { status: 400 }
      );
    }

    if (password !== passwordConfirm) {
      return NextResponse.json(
        { message: "비밀번호가 일치하지 않습니다." },
        { status: 400 }
      );
    }

    // 유효한 토큰 확인 (미사용 + 미만료)
    const resetRecord = await prisma.passwordReset.findUnique({
      where: { token },
    });

    if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
      return NextResponse.json(
        { message: "유효하지 않거나 만료된 링크입니다. 다시 요청해 주세요." },
        { status: 400 }
      );
    }

    // 비밀번호 해시 후 업데이트 (트랜잭션)
    const hashedPassword = await hashPassword(password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: {
          password: hashedPassword,
          legacyPwHash: null,
        },
      }),
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // 보안: 해당 사용자의 모든 세션 삭제
    await prisma.session.deleteMany({
      where: { userId: resetRecord.userId },
    });

    return NextResponse.json({
      message: "비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.",
    });
  } catch (error) {
    console.error("Password reset confirm error:", error);
    return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
