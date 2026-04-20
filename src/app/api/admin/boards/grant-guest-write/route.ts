import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

// POST /api/admin/boards/grant-guest-write
// 모든 게시판의 grantList/grantView/grantWrite/grantReply 를 99(비회원 허용)로 일괄 변경.
// 쓰기를 허용하려면 당연히 목록·열람도 가능해야 하므로 함께 개방.
// grantComment 는 별도 버튼(grant-guest-comment) 으로 ON/OFF 관리.
export async function POST(_request: NextRequest) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("dc_session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }
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

  const before = await prisma.board.count({
    where: {
      OR: [
        { grantList: { lt: 99 } },
        { grantView: { lt: 99 } },
        { grantWrite: { lt: 99 } },
        { grantReply: { lt: 99 } },
      ],
    },
  });

  await prisma.board.updateMany({
    where: {},
    data: { grantList: 99, grantView: 99, grantWrite: 99, grantReply: 99 },
  });

  return NextResponse.json({
    success: true,
    message: `전체 게시판의 비회원 열람·글쓰기·답글 권한을 활성화했습니다. (이전 제한: ${before}개)`,
    affected: before,
  });
}
