import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

// POST /api/admin/boards/grant-guest-comment
// body: { action: "on" | "off" }
// 모든 게시판의 grantComment 를 일괄 ON(99, 비회원 허용) 또는 OFF(10, 회원만) 로 변경.
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("dc_session")?.value;
  if (!sessionToken) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires < new Date()) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action === "off" ? "off" : "on";
  const targetLevel = action === "on" ? 99 : 10;

  const before = await prisma.board.count({
    where: action === "on"
      ? { grantComment: { lt: 99 } }
      : { grantComment: { gt: 10 } },
  });

  await prisma.board.updateMany({
    where: {},
    data: { grantComment: targetLevel },
  });

  return NextResponse.json({
    success: true,
    message:
      action === "on"
        ? `전체 게시판의 비회원 댓글 권한을 활성화했습니다. (변경된 게시판: ${before}개 → grantComment=99)`
        : `전체 게시판의 비회원 댓글 권한을 해제했습니다. (변경된 게시판: ${before}개 → grantComment=10)`,
    affected: before,
    action,
  });
}
