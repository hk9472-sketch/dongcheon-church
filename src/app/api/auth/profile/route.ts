import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";

// ============================================================
// GET /api/auth/profile — 현재 로그인한 사용자 프로필 조회
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("dc_session")?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const session = await prisma.session.findUnique({
      where: { sessionToken },
    });
    if (!session || session.expires < new Date()) {
      return NextResponse.json(
        { message: "세션이 만료되었습니다. 다시 로그인해 주세요." },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        userId: true,
        name: true,
        email: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: "사용자를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/auth/profile — 프로필 수정
// ============================================================
export async function PUT(request: NextRequest) {
  try {
    // 1) 세션 확인
    const sessionToken = request.cookies.get("dc_session")?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const session = await prisma.session.findUnique({
      where: { sessionToken },
    });
    if (!session || session.expires < new Date()) {
      return NextResponse.json(
        { message: "세션이 만료되었습니다. 다시 로그인해 주세요." },
        { status: 401 }
      );
    }

    // 2) 요청 본문 파싱
    const body = await request.json();
    const { name, email, currentPassword, newPassword } = body as {
      name?: string;
      email?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    // 3) 이름 필수 검증
    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { message: "이름은 필수 입력 항목입니다." },
        { status: 400 }
      );
    }

    // 4) 이메일 형식 검증 (입력된 경우)
    if (email && email.trim().length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { message: "올바른 이메일 형식이 아닙니다." },
          { status: 400 }
        );
      }
    }

    // 5) 비밀번호 변경 처리
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      name: name.trim(),
      email: email ? email.trim() : null,
    };

    if (newPassword) {
      // 새 비밀번호를 설정하려면 현재 비밀번호가 필요
      if (!currentPassword) {
        return NextResponse.json(
          { message: "비밀번호 변경을 위해 현재 비밀번호를 입력해 주세요." },
          { status: 400 }
        );
      }

      if (newPassword.length < 8) {
        return NextResponse.json(
          { message: "새 비밀번호는 8자 이상이어야 합니다." },
          { status: 400 }
        );
      }

      // 현재 사용자 비밀번호 조회
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { password: true },
      });

      if (!user) {
        return NextResponse.json(
          { message: "사용자를 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      // 현재 비밀번호 검증 (bcrypt 해시 비교)
      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!isPasswordValid) {
        return NextResponse.json(
          { message: "현재 비밀번호가 일치하지 않습니다." },
          { status: 400 }
        );
      }

      // 새 비밀번호 해시 생성
      updateData.password = await bcrypt.hash(newPassword, 12);
    }

    // 6) DB 업데이트
    const updatedUser = await prisma.user.update({
      where: { id: session.userId },
      data: updateData,
      select: {
        userId: true,
        name: true,
        email: true,
      },
    });

    return NextResponse.json({
      message: "프로필이 성공적으로 수정되었습니다.",
      user: updatedUser,
    });
  } catch {
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
