/**
 * 관리자 계정 복구/생성 스크립트
 *
 * 사용법:
 *   npx tsx scripts/bootstrap-admin.ts [userId] [password] [name]
 *
 * 인자 없이 실행하면 env 변수 사용:
 *   ADMIN_USERID  / ADMIN_PASSWORD / ADMIN_NAME
 *
 * 동작:
 *   - 해당 userId 존재 → 비밀번호 재설정 + isAdmin=1/level=1 승격
 *   - 존재하지 않음   → 새 관리자 계정 생성
 *
 * 마이그레이션/truncate 등으로 관리자를 잃었을 때 복구용.
 */
import prisma from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

async function main() {
  const [, , argUserId, argPassword, argName] = process.argv;

  const userId = argUserId || process.env.ADMIN_USERID || "admin";
  const password = argPassword || process.env.ADMIN_PASSWORD;
  const name = argName || process.env.ADMIN_NAME || "최고관리자";

  if (!password) {
    console.error("❌ 비밀번호가 필요합니다.");
    console.error("   npx tsx scripts/bootstrap-admin.ts <userId> <password> [name]");
    console.error("   또는 ADMIN_PASSWORD 환경변수 설정");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("❌ 비밀번호는 8자 이상이어야 합니다.");
    process.exit(1);
  }

  const hash = await hashPassword(password);

  const existing = await prisma.user.findUnique({ where: { userId } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        password: hash,
        legacyPwHash: null,           // 레거시 해시 제거 (새 비번 고정)
        isAdmin: 1,                   // 최고관리자
        level: 1,
        emailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      },
    });
    console.log(`✅ 기존 계정 '${userId}' 를 최고관리자로 승격/재설정했습니다.`);
    console.log(`   id=${existing.id}, name=${existing.name}`);
  } else {
    const created = await prisma.user.create({
      data: {
        userId,
        password: hash,
        name,
        email: null,
        emailVerified: true,
        isAdmin: 1,
        level: 1,
        groupNo: 1,
      },
    });
    console.log(`✅ 새 최고관리자 '${userId}' 생성 완료.`);
    console.log(`   id=${created.id}, name=${created.name}`);
  }

  // 현재 관리자 목록 확인
  const admins = await prisma.user.findMany({
    where: { isAdmin: { lte: 2 } },
    select: { id: true, userId: true, name: true, isAdmin: true },
    orderBy: { isAdmin: "asc" },
  });
  console.log(`\n현재 관리자 (isAdmin ≤ 2): ${admins.length}명`);
  for (const a of admins) {
    console.log(`  · ${a.userId} (${a.name}) — isAdmin=${a.isAdmin}, id=${a.id}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ 오류:", e);
    process.exit(1);
  });
