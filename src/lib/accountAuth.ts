import prisma from "./db";
import { getCurrentUser } from "./auth";

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
  const session = await getCurrentUser();
  if (!session) return { ok: false, status: 401, error: "로그인이 필요합니다." };

  const user = await prisma.user.findUnique({
    where: { id: session.id },
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
  if (!user) return { ok: false, status: 401, error: "세션 만료" };

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
