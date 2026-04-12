import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    // 관리자 인증 확인
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("dc_session")?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }

    const session = await prisma.session.findUnique({
      where: { sessionToken },
    });
    if (!session || session.expires < new Date()) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user || user.isAdmin > 2) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }

    // 요청 데이터 파싱
    const body = await request.json();
    const { userIds, newPassword } = body as {
      userIds: number[];
      newPassword: string;
    };

    // 유효성 검사
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: "변경할 회원을 선택해주세요." },
        { status: 400 }
      );
    }

    if (!newPassword || newPassword.length < 4) {
      return NextResponse.json(
        { error: "비밀번호는 4자 이상이어야 합니다." },
        { status: 400 }
      );
    }

    // 비밀번호 해시 생성
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // 선택된 회원들의 비밀번호 일괄 변경
    const result = await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: {
        password: hashedPassword,
        legacyPwHash: null, // 레거시 해시 제거
      },
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `${result.count}명의 비밀번호가 변경되었습니다.`,
    });
  } catch (error) {
    console.error("Password reset error:", error);
    return NextResponse.json(
      { error: "비밀번호 변경 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
