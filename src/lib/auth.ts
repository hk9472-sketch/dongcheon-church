import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import prisma from "./db";

// ============================================================
// 비밀번호 처리
// ============================================================

/**
 * bcrypt로 비밀번호 해시 생성
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * MySQL PASSWORD() 함수 구현 (MySQL 4.1+ 신형 해시, 41자)
 * 결과: '*' + SHA1(SHA1(password)) (uppercase hex)
 * MySQL 8.0에서 PASSWORD()가 제거되어 Node.js crypto로 직접 구현
 */
function mysqlNewPassword(password: string): string {
  const step1 = createHash("sha1").update(password, "utf8").digest();
  const step2 = createHash("sha1").update(step1).digest("hex").toUpperCase();
  return "*" + step2;
}

/**
 * MySQL OLD_PASSWORD() 함수 구현 (MySQL 4.0 이전, 16자 hex)
 * 제로보드 4.1 초기 배포본이 사용하던 구형 해시. 두 개의 31bit 정수를
 * 8자 hex 씩 이어 붙여 16자 총 출력.
 * 알고리즘: nr / add / nr2 를 유지하며 문자마다 비트 시프트/xor 연산.
 * 탭(0x09)/스페이스(0x20) 는 건너뜀 (MySQL 원본 구현과 동일).
 */
function mysqlOldPassword(password: string): string {
  let nr = 1345345333;
  let add = 7;
  let nr2 = 0x12345671;
  for (let i = 0; i < password.length; i++) {
    const c = password.charCodeAt(i);
    if (c === 0x20 || c === 0x09) continue;
    // C 원본: nr ^= (((nr & 63) + add) * c + (nr << 8));
    // JS: 곱/합 후 한 번에 >>> 0 로 32bit 으로 잘라냄
    nr ^= (((nr & 63) + add) * c + ((nr << 8) >>> 0)) >>> 0;
    nr2 = (nr2 + (((nr2 << 8) >>> 0) ^ nr)) >>> 0;
    add += c;
  }
  const a = (nr & 0x7fffffff).toString(16).padStart(8, "0");
  const b = (nr2 & 0x7fffffff).toString(16).padStart(8, "0");
  return a + b;
}

/**
 * 비밀번호 검증
 * - 새 시스템: bcrypt 해시 비교
 * - 레거시 이관 사용자: legacyPwHash와 비교 후 자동으로 bcrypt로 업그레이드
 *
 * 주의: 이관 시 password 필드에 임시 bcrypt 해시("__legacy_migration__")가 저장되므로
 * bcrypt 비교가 실패해도 legacyPwHash 검사로 fall-through해야 함
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string,
  legacyHash?: string | null,
  userId?: number
): Promise<boolean> {
  // 1) bcrypt 해시 비교 (실제 bcrypt로 저장된 경우)
  if (hashedPassword && hashedPassword.startsWith("$2")) {
    const bcryptMatch = await bcrypt.compare(password, hashedPassword);
    if (bcryptMatch) return true;
    // bcrypt 비교 실패 → legacyHash 검사로 fall-through
    // (이관 사용자의 경우 password 필드가 "__legacy_migration__"의 bcrypt 해시이므로 항상 실패)
  }

  // 2) 제로보드 레거시 해시 비교
  //    · 41자 "*...": MySQL 4.1+ PASSWORD() → mysqlNewPassword
  //    · 16자 hex:    MySQL 4.0 이전 OLD_PASSWORD() → mysqlOldPassword
  if (legacyHash) {
    let matched = false;
    if (legacyHash.length === 41 && legacyHash.startsWith("*")) {
      matched = mysqlNewPassword(password) === legacyHash;
    } else if (legacyHash.length === 16 && /^[0-9a-fA-F]+$/.test(legacyHash)) {
      matched = mysqlOldPassword(password) === legacyHash.toLowerCase();
    }
    if (matched) {
      // 로그인 성공 → bcrypt 로 업그레이드 (이후엔 bcrypt 만 사용)
      if (userId) {
        const newHash = await hashPassword(password);
        await prisma.user.update({
          where: { id: userId },
          data: { password: newHash, legacyPwHash: null },
        });
      }
      return true;
    }
  }

  return false;
}

// ============================================================
// 세션 관리 (간단한 쿠키 기반)
// ============================================================

const SESSION_COOKIE = "dc_session";

export interface SessionUser {
  id: number;
  userId: string;
  name: string;
  level: number;
  isAdmin: number;
  groupNo: number;
}

/**
 * 현재 로그인한 사용자 정보 조회
 * 제로보드의 member_info() 함수에 해당
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return null;

  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken },
    });

    if (!session || session.expires < new Date()) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        userId: true,
        name: true,
        level: true,
        isAdmin: true,
        groupNo: true,
      },
    });

    return user;
  } catch {
    return null;
  }
}

// ============================================================
// 권한 체크 (제로보드의 레벨 시스템 매핑)
// ============================================================

/**
 * 제로보드 권한 체계:
 * - level 1: 최고 관리자
 * - level 2~9: 부관리자/특별 회원
 * - level 10: 일반 회원
 * - 비회원: level 없음 (10 이상으로 취급)
 *
 * grant 값이 낮을수록 높은 권한 필요
 * 예: grant_write=10 → 일반회원도 글쓰기 가능
 *     grant_write=2  → 관리자급만 글쓰기 가능
 */

/**
 * 사용자가 특정 권한을 가지고 있는지 확인
 * 제로보드: if($setup[grant_xxx] < $member[level] && !$is_admin) Error(...)
 */
export function hasPermission(
  userLevel: number | undefined,
  requiredGrant: number,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  const level = userLevel ?? 99; // 비회원은 99 (가장 낮은 권한)
  return level <= requiredGrant;
}

/**
 * 게시판 관리자 여부 확인
 * 제로보드: 전체관리자(is_admin=1) || 그룹관리자(is_admin=2 && 같은 그룹)
 */
export function isBoardAdmin(
  user: SessionUser | null,
  boardGroupNo: number
): boolean {
  if (!user) return false;
  if (user.isAdmin === 1) return true; // 전체 관리자
  if (user.isAdmin === 2 && user.groupNo === boardGroupNo) return true; // 그룹 관리자
  return false;
}
