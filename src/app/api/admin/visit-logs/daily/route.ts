import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

async function requireAdmin() {
  const c = await cookies();
  const token = c.get("dc_session")?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { sessionToken: token } });
  if (!s || s.expires <= new Date()) return null;
  const u = await prisma.user.findUnique({ where: { id: s.userId } });
  if (!u || u.isAdmin > 2) return null;
  return u;
}

/**
 * GET /api/admin/visit-logs/daily?days=30
 *   일일 고유 방문자 시계열. 봇 제거된 visitor_counts 기반.
 *   visitor_counts.date 는 KST일 - 1 로 저장되므로 +1 DAY 보정해 KST 일자로 라벨링.
 *   응답: { days, points: [{ day: "YYYY-MM-DD", visitors }] }
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const raw = parseInt(req.nextUrl.searchParams.get("days") || "30", 10);
  const days = Number.isFinite(raw) ? Math.min(365, Math.max(7, raw)) : 30;

  const rows = await prisma.$queryRaw<{ day: string; visitors: number | bigint }[]>`
    SELECT CAST(DATE_ADD(date, INTERVAL 1 DAY) AS CHAR) AS day, count AS visitors
    FROM visitor_counts
    WHERE date > DATE_SUB(CURDATE(), INTERVAL ${days} DAY)
    ORDER BY date`;

  return NextResponse.json({
    days,
    points: rows.map((r) => ({ day: r.day, visitors: Number(r.visitors) })),
  });
}
