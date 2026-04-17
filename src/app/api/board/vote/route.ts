import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const VOTE_COOKIE_NAME = "dc_vote_token";
const VOTE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1년

// POST /api/board/vote
export async function POST(request: NextRequest) {
  try {
    // Rate limit: IP당 20회/10분 — NAT/Wi-Fi 에서 교인 다수 허용하되 봇 도배는 차단
    const ip = getClientIp(request);
    const rl = checkRateLimit(`vote:${ip}`, 20, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } }
      );
    }

    const { postId } = await request.json();
    if (!postId || typeof postId !== "number") {
      return NextResponse.json({ message: "유효하지 않은 ID" }, { status: 400 });
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      return NextResponse.json({ message: "게시글이 존재하지 않습니다." }, { status: 404 });
    }

    // 사용자 식별
    let userId: number | null = null;
    const sessionToken = request.cookies.get("dc_session")?.value;
    if (sessionToken) {
      const session = await prisma.session.findUnique({ where: { sessionToken } });
      if (session && session.expires > new Date()) {
        userId = session.userId;
      }
    }

    // 비로그인자용 클라이언트 토큰 (쿠키) — IP 대신 중복 체크에 사용
    // 교회 Wi-Fi / 모바일 캐리어 NAT 환경에서 동일 IP 교인 전체가 1표만 가능했던 문제 해결
    let voteToken: string | null = null;
    let issueCookie = false;
    if (!userId) {
      voteToken = request.cookies.get(VOTE_COOKIE_NAME)?.value || null;
      if (!voteToken || voteToken.length !== 32 || !/^[a-f0-9]+$/.test(voteToken)) {
        voteToken = randomBytes(16).toString("hex");
        issueCookie = true;
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
    } else if (voteToken) {
      // 비로그인자: 쿠키 토큰으로 유니크 체크 (ip 필드 재사용, 스키마 변경 없음)
      const existing = await prisma.postVote.findUnique({
        where: { postId_ip: { postId, ip: voteToken } },
      });
      if (existing) {
        // 기존 쿠키 토큰이 DB에 이미 있어도 쿠키가 만료/삭제됐다 재발급됐을 수 있음 → 응답으로 다시 셋
        const res = NextResponse.json(
          { message: "이미 추천하셨습니다.", vote: post.vote },
          { status: 409 }
        );
        if (issueCookie) {
          res.cookies.set(VOTE_COOKIE_NAME, voteToken, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: VOTE_COOKIE_MAX_AGE,
            path: "/",
          });
        }
        return res;
      }
    }

    // 추천 기록 저장 + 카운트 증가
    // 비로그인자의 경우 PostVote.ip 필드에 쿠키 토큰을 저장 (NAT 환경 대응)
    const voteIdentifier = userId ? ip : (voteToken as string);
    await prisma.$transaction([
      prisma.postVote.create({
        data: { postId, userId, ip: voteIdentifier },
      }),
      prisma.post.updateMany({
        where: { id: postId },
        data: { vote: { increment: 1 } },
      }),
    ]);

    const updated = await prisma.post.findUnique({ where: { id: postId } });
    const res = NextResponse.json({ vote: updated?.vote ?? post.vote + 1 });

    if (issueCookie && voteToken) {
      res.cookies.set(VOTE_COOKIE_NAME, voteToken, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: VOTE_COOKIE_MAX_AGE,
        path: "/",
      });
    }

    return res;
  } catch (error) {
    console.error("Vote error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
