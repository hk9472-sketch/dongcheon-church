import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
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

    const admin = await prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!admin || admin.isAdmin > 2) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }

    const body = await request.json();
    const { userIds, newLevel } = body as {
      userIds: number[];
      newLevel: number;
    };

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: "변경할 회원을 선택해주세요." },
        { status: 400 }
      );
    }

    if (typeof newLevel !== "number" || newLevel < 1 || newLevel > 99) {
      return NextResponse.json(
        { error: "레벨은 1~99 사이여야 합니다." },
        { status: 400 }
      );
    }

    // 최고관리자(isAdmin=1)는 레벨 변경 대상에서 제외
    const result = await prisma.user.updateMany({
      where: {
        id: { in: userIds },
        isAdmin: { gt: 1 },
      },
      data: { level: newLevel },
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `${result.count}명의 레벨이 ${newLevel}로 변경되었습니다.`,
    });
  } catch (error) {
    console.error("Change level error:", error);
    return NextResponse.json(
      { error: "레벨 변경 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
