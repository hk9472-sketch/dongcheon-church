import prisma from "./db";
import { cookies } from "next/headers";

const SESSION_COOKIE = "dc_session";

export type AccPermission = "ledger" | "offering" | "dues" | "memberEdit";

export interface AccAccessResult {
  ok: boolean;
  userId?: number;
  isAdmin?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user?: any;
  status?: number;
  error?: string;
}

/**
 * 회계/연보 접근 권한 중앙 확인 헬퍼
 *
 * 권한 체계:
 * - isAdmin <= 2: 모든 권한 허용 (최고/부관리자)
 * - accountAccess (legacy, true): ledger + offering 권한 (memberEdit은 제외)
 * - accLedgerAccess: 회계(장부) 권한
 * - accOfferingAccess: 연보 권한
 * - accMemberEditAccess: 교인 관리번호 입력/수정 + 성명 조회 권한
 */
export async function checkAccAccess(
  permission: AccPermission
): Promise<AccAccessResult> {
  // 세션 토큰
  let sessionToken: string | undefined;
  try {
    const cookieStore = await cookies();
    sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  } catch {
    return { ok: false, status: 503, error: "일시적인 서버 오류입니다. 잠시 후 다시 시도하세요." };
  }
  if (!sessionToken) return { ok: false, status: 401, error: "로그인이 필요합니다." };

  // ★ 회계/연보/월정 영역 한정 — DB 오류(커넥션풀 고갈·타임아웃 등)를 '미로그인'(401)이
  //    아니라 '일시 서버 오류'(503)로 구분한다. (getCurrentUser 의 catch→null = 로그인오인
  //    함정을 우회. 대량 일괄저장 중 401 '로그인 필요'로 오인 표시되던 문제 대응.)
  let user;
  try {
    const session = await prisma.session.findUnique({ where: { sessionToken } });
    if (!session || session.expires < new Date()) {
      return { ok: false, status: 401, error: "세션이 만료되었습니다. 다시 로그인하세요." };
    }
    user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        isAdmin: true,
        name: true,
        userId: true,
        accountAccess: true,
        accLedgerAccess: true,
        accOfferingAccess: true,
        accDuesAccess: true,
        accMemberEditAccess: true,
      },
    });
  } catch (e) {
    console.error("[checkAccAccess] 인증 조회 DB 오류:", e);
    return { ok: false, status: 503, error: "일시적인 서버 오류입니다. 잠시 후 다시 시도하세요." };
  }
  if (!user) return { ok: false, status: 401, error: "세션이 만료되었습니다. 다시 로그인하세요." };

  const isAdmin = user.isAdmin <= 2;
  if (isAdmin) return { ok: true, userId: user.id, isAdmin: true, user };

  // legacy accountAccess=true grants both ledger+offering (but NOT memberEdit)
  const legacyFull = user.accountAccess === true;

  if (permission === "ledger" && (user.accLedgerAccess || legacyFull)) {
    return { ok: true, userId: user.id, isAdmin: false, user };
  }
  if (permission === "offering" && (user.accOfferingAccess || legacyFull)) {
    return { ok: true, userId: user.id, isAdmin: false, user };
  }
  if (permission === "dues" && user.accDuesAccess) {
    return { ok: true, userId: user.id, isAdmin: false, user };
  }
  if (permission === "memberEdit" && user.accMemberEditAccess) {
    return { ok: true, userId: user.id, isAdmin: false, user };
  }

  return { ok: false, status: 403, error: "접근 권한이 없습니다." };
}

/**
 * memberEdit 권한 보유 여부 (회계 라우트에서 성명 조회 가능 여부 판단용)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hasMemberEdit(user: any): boolean {
  if (!user) return false;
  return user.isAdmin <= 2 || user.accMemberEditAccess === true;
}
