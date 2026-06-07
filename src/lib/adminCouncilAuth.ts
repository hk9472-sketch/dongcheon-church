import { cookies } from "next/headers";
import prisma from "@/lib/db";

/**
 * 관리자 또는 권찰회 접근 권한자만 통과. GET 통계 조회용.
 * 변경(POST/PUT/DELETE) 은 별도의 requireAdmin 그대로 사용해야 함.
 */
export async function requireAdminOrCouncil() {
  const c = await cookies();
  const token = c.get("dc_session")?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { sessionToken: token } });
  if (!s || s.expires <= new Date()) return null;
  const u = await prisma.user.findUnique({ where: { id: s.userId } });
  if (!u) return null;
  if (u.isAdmin <= 2 || u.councilAccess) return u;
  return null;
}
