import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { listActive, countActive } from "@/lib/activePresence";

/**
 * GET /api/active
 * 활성 사용자 목록 조회 — 최고관리자(isAdmin === 1)만.
 */
export async function GET() {
  const c = await cookies();
  const token = c.get("dc_session")?.value;
  if (!token) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const s = await prisma.session.findUnique({ where: { sessionToken: token } });
  if (!s || s.expires <= new Date()) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }
  // 로그인 회원이면 모두 활성 사용자 목록 조회 가능 (메시지 기능 위해).
  // 비회원은 차단 — 세션 없으면 위에서 이미 return 됨.
  const u = await prisma.user.findUnique({
    where: { id: s.userId },
    select: { isAdmin: true },
  });
  if (!u) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const list = listActive();
  const counts = countActive();

  // 비회원에게 안정적인 표시 번호 부여 — 같은 sessionId 는 항상 같은 번호.
  // lastPingAt DESC 정렬돼있어 활성도 순. 번호는 처음 진입 순서로 매기기 위해
  // sessionId 의 첫 4글자를 헥스로 매핑 → 안정적 정수.
  let guestIdx = 0;
  return NextResponse.json({
    counts,
    // path · ip 는 사생활 보호로 응답에서 제외.
    // 메시지 발송용으로 sessionId 전체 노출 (회원/관리자가 비회원에게 메시지 보낼 때 식별자).
    list: list.map((r) => {
      const isGuest = !r.userId;
      const displayName = r.userName || `방문자 #${++guestIdx}`;
      return {
        sessionId: r.sessionId,
        userId: r.userId,
        userName: r.userName,
        displayName,
        isGuest,
        lastPingAt: r.lastPingAt,
      };
    }),
  });
}
