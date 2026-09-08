import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

async function verifyAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires < new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

// POST /api/board/comment/lock
//   body: { commentIds: number[], lock: boolean }
//   lock=true  → isSecret=true (일반 사용자 열람 차단: 내용이 "(비밀댓글)" 로 가려짐)
//   lock=false → 잠금 해제
//   관리자(isAdmin<=2) 만 가능.
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  try {
    const { commentIds, lock } = await request.json();
    if (!Array.isArray(commentIds) || commentIds.length === 0) {
      return NextResponse.json({ message: "댓글을 선택하세요." }, { status: 400 });
    }
    const ids = commentIds.filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) {
      return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
    }

    const res = await prisma.comment.updateMany({
      where: { id: { in: ids } },
      data: { isSecret: !!lock },
    });

    return NextResponse.json({ updated: res.count, lock: !!lock });
  } catch (error) {
    console.error("Comment lock error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
