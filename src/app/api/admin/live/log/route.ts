import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";

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
 * GET /api/admin/live/log?from=YYYY-MM-DD&to=YYYY-MM-DD&service=&page=1
 * 관리자 — 실시간 예배 방문 로그 기간별 조회 + 일자×서비스 unique IP 요약.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const service = sp.get("service") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const perPage = 100;

  const where: Prisma.LiveServiceVisitWhereInput = {};
  if (from || to) {
    where.serviceDate = {};
    if (from) where.serviceDate.gte = new Date(from + "T00:00:00+09:00");
    if (to) where.serviceDate.lte = new Date(to + "T23:59:59+09:00");
  }
  if (service) where.serviceCode = service;

  const [total, rows] = await Promise.all([
    prisma.liveServiceVisit.count({ where }),
    prisma.liveServiceVisit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  // 일자×서비스 unique IP 요약 (Prisma groupBy 로 고유 ip 카운트는 직접 안 됨 → raw query)
  const fromDate = from ? new Date(from + "T00:00:00+09:00") : new Date("2000-01-01");
  const toDate = to ? new Date(to + "T23:59:59+09:00") : new Date("2099-12-31");
  const summaryRows = service
    ? await prisma.$queryRaw<{ d: Date; serviceCode: string; cnt: bigint }[]>`
        SELECT serviceDate AS d, serviceCode, COUNT(DISTINCT ip) AS cnt
        FROM live_service_visits
        WHERE serviceDate >= ${fromDate} AND serviceDate <= ${toDate}
          AND serviceCode = ${service}
        GROUP BY serviceDate, serviceCode
        ORDER BY serviceDate DESC, serviceCode
      `
    : await prisma.$queryRaw<{ d: Date; serviceCode: string; cnt: bigint }[]>`
        SELECT serviceDate AS d, serviceCode, COUNT(DISTINCT ip) AS cnt
        FROM live_service_visits
        WHERE serviceDate >= ${fromDate} AND serviceDate <= ${toDate}
        GROUP BY serviceDate, serviceCode
        ORDER BY serviceDate DESC, serviceCode
      `;

  return NextResponse.json({
    total,
    page,
    perPage,
    rows,
    summary: summaryRows.map((s) => ({
      date: new Date(s.d).toISOString().slice(0, 10),
      serviceCode: s.serviceCode,
      count: Number(s.cnt),
    })),
  });
}
