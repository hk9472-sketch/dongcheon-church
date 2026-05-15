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
 * GET /api/admin/visit-logs
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD     KST 기준 일자 범위 (createdAt)
 *   &ip=...     IP contains (부분 일치)
 *   &path=...   path contains
 *   &ua=...     userAgent contains
 *   &referer=...
 *   &userId=...   회원 id 정확 일치 (숫자) — "0" 이면 비회원만, 빈값이면 무시
 *   &page=1&perPage=100
 *
 * 응답:
 *   { total, page, perPage, rows: [...] }
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const ip = (sp.get("ip") || "").trim();
  const path = (sp.get("path") || "").trim();
  const ua = (sp.get("ua") || "").trim();
  const referer = (sp.get("referer") || "").trim();
  const userIdRaw = (sp.get("userId") || "").trim();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const perPage = Math.min(500, Math.max(10, parseInt(sp.get("perPage") || "100", 10)));

  const where: Prisma.VisitLogWhereInput = {};

  // KST 자정 ↔ UTC 변환. to 는 해당 일 끝까지 포함 — to + 1일 00:00 미만.
  if (from || to) {
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = new Date(from + "T00:00:00+09:00");
    if (to) {
      const t = new Date(to + "T00:00:00+09:00");
      t.setUTCDate(t.getUTCDate() + 1);
      range.lt = t;
    }
    where.createdAt = range;
  }
  if (ip) where.ip = { contains: ip };
  if (path) where.path = { contains: path };
  if (ua) where.userAgent = { contains: ua };
  if (referer) where.referer = { contains: referer };
  if (userIdRaw === "0") {
    where.userId = null;
  } else if (userIdRaw) {
    const uid = parseInt(userIdRaw, 10);
    if (Number.isFinite(uid)) where.userId = uid;
  }

  const [total, rows] = await Promise.all([
    prisma.visitLog.count({ where }),
    prisma.visitLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  return NextResponse.json({ total, page, perPage, rows });
}
