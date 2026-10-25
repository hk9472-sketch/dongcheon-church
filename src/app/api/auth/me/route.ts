import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { isSecureRequest } from "@/lib/cookieSecure";
import { signLegacyToken } from "@/lib/legacyToken";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
// 남은 기간이 이보다 짧으면 연장(sliding). 6일 → 활동 중이면 하루 1회 정도만 DB 갱신.
const RENEW_BELOW_MS = 6 * 24 * 60 * 60 * 1000;

// GET /api/auth/me
//   ★ sliding session: 활동 중인 사용자의 세션을 자동 연장.
//   세션이 '로그인 시점 + 고정 7일'이라, 며칠 전 로그인한 쿠키로 들어와 작업하던 중
//   7일 경계를 넘으면 저장 시점에 '로그인 필요'가 뜨던 문제를 막는다.
export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("dc_session")?.value;
    if (!sessionToken) {
      return NextResponse.json({ user: null });
    }

    const session = await prisma.session.findUnique({ where: { sessionToken } });
    if (!session || session.expires < new Date()) {
      return NextResponse.json({ user: null });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        userId: true,
        name: true,
        level: true,
        isAdmin: true,
        email: true,
        groupNo: true,
        councilAccess: true,
        accountAccess: true,
        accLedgerAccess: true,
        accOfferingAccess: true,
        accDuesAccess: true,
        accMemberEditAccess: true,
      },
    });

    const response = NextResponse.json({ user });

    // sliding 연장 — 남은 기간이 짧으면 DB 세션 + 쿠키를 다시 7일로
    if (user && session.expires.getTime() - Date.now() < RENEW_BELOW_MS) {
      const expires = new Date(Date.now() + SESSION_TTL_MS);
      try {
        await prisma.session.update({ where: { sessionToken }, data: { expires } });
        response.cookies.set("dc_session", sessionToken, {
          httpOnly: true,
          secure: isSecureRequest(request),
          sameSite: "lax",
          expires,
          path: "/",
        });
        // 레거시 ZB(:8080) SSO 토큰도 같은 만료로 갱신 (로그인 라우트와 동일 속성)
        if (process.env.LEGACY_TOKEN_SECRET) {
          response.cookies.set(
            "dc_legacy_token",
            signLegacyToken({ userId: user.id, expires: expires.getTime() }),
            { httpOnly: true, secure: false, sameSite: "lax", expires, path: "/" },
          );
        }
      } catch {
        /* 연장 실패해도 현재 응답은 정상 반환 */
      }
    }

    return response;
  } catch {
    return NextResponse.json({ user: null });
  }
}
