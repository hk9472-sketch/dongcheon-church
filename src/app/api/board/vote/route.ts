import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

// POST /api/board/vote
export async function POST(request: NextRequest) {
  try {
    const { postId } = await request.json();
    if (!postId || typeof postId !== "number") {
      return NextResponse.json({ message: "유효하지 않은 ID" }, { status: 400 });
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      return NextResponse.json({ message: "게시글이 존재하지 않습니다." }, { status: 404 });
    }

    // 사용자/IP 식별
    const ip = getClientIp(request);
    let userId: number | null = null;
    const sessionToken = request.cookies.get("dc_session")?.value;
    if (sessionToken) {
      const session = await prisma.session.findUnique({ where: { sessionToken } });
      if (session && session.expires > new Date()) {
        userId = session.userId;
      }
    }

    // 중복 추천 확인
    if (userId) {
      const existing = await prisma.postVote.findUnique({
        where: { postId_userId: { postId, userId } },
      });
      if (existing) {
        return NextResponse.json({ message: "이미 추천하셨습니다.", vote: post.vote }, { status: 409 });
      }
    } else {
      const existing = await prisma.postVote.findUnique({
        where: { postId_ip: { postId, ip } },
      });
      if (existing) {
        return NextResponse.json({ message: "이미 추천하셨습니다.", vote: post.vote }, { status: 409 });
      }
    }

    // 추천 기록 저장 + 카운트 증가
    await prisma.$transaction([
      prisma.postVote.create({
        data: { postId, userId, ip },
      }),
      prisma.post.update({
        where: { id: postId },
        data: { vote: { increment: 1 } },
      }),
    ]);

    const updated = await prisma.post.findUnique({ where: { id: postId } });
    return NextResponse.json({ vote: updated?.vote ?? post.vote + 1 });
  } catch (error) {
    console.error("Vote error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
