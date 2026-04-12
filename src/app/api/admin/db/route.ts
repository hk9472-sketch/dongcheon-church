import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

// 관리자 인증 확인 헬퍼
async function verifyAdmin() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("dc_session")?.value;
  if (!sessionToken) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken },
  });
  if (!session || session.expires < new Date()) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, isAdmin: true },
  });
  if (!user || user.isAdmin > 2) return null;

  return user;
}

// ============================================================
// GET /api/admin/db — DB 통계 + 테이블 데이터 조회
// query: tab=visitor-stats|site-settings|visit-logs
// ============================================================
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") || "visitor-stats";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const perPage = 30;

  try {
    if (tab === "visitor-stats") {
      const [total, records] = await Promise.all([
        prisma.visitorCount.count(),
        prisma.visitorCount.findMany({
          orderBy: { date: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
      ]);
      return NextResponse.json({
        tab,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / perPage)),
        records: records.map((r) => ({
          id: r.id,
          date: r.date.toISOString().slice(0, 10),
          count: r.count,
        })),
      });
    }

    if (tab === "site-settings") {
      const records = await prisma.siteSetting.findMany({
        orderBy: { id: "asc" },
      });
      return NextResponse.json({
        tab,
        total: records.length,
        records,
      });
    }

    if (tab === "visit-logs") {
      const keyword = searchParams.get("keyword") || "";
      const where = keyword
        ? {
            OR: [
              { ip: { contains: keyword } },
              { path: { contains: keyword } },
              { referer: { contains: keyword } },
            ],
          }
        : {};

      const [total, records] = await Promise.all([
        prisma.visitLog.count({ where }),
        prisma.visitLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
      ]);
      return NextResponse.json({
        tab,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / perPage)),
        records: records.map((r) => ({
          id: r.id,
          ip: r.ip,
          path: r.path,
          referer: r.referer,
          userAgent: r.userAgent,
          userId: r.userId,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    }

    return NextResponse.json({ error: "잘못된 탭" }, { status: 400 });
  } catch (error) {
    console.error("[Admin DB GET]", error);
    return NextResponse.json(
      { error: "데이터 조회 실패" },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/admin/db — 데이터 생성/수정
// body: { action, ...data }
// ============================================================
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    // 사이트 설정 추가/수정
    if (action === "upsert-setting") {
      const { key, value } = body;
      if (!key || value === undefined) {
        return NextResponse.json(
          { error: "key와 value가 필요합니다." },
          { status: 400 }
        );
      }
      const result = await prisma.siteSetting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });
      return NextResponse.json({ success: true, record: result });
    }

    // 테이블 초기화 (TRUNCATE + AUTO_INCREMENT 리셋)
    if (action === "truncate-table") {
      const { tableName } = body;
      // Prisma 모델명 → 실제 MySQL 테이블명 매핑
      const TABLE_MAP: Record<string, string> = {
        Post: "posts",
        Comment: "comments",
        Category: "categories",
        User: "users",
        VisitorCount: "visitor_counts",
        VisitLog: "visit_logs",
        Session: "sessions",
      };
      if (!tableName || !TABLE_MAP[tableName]) {
        return NextResponse.json(
          { error: `허용되지 않은 테이블입니다. 허용: ${Object.keys(TABLE_MAP).join(", ")}` },
          { status: 400 }
        );
      }
      const realTable = TABLE_MAP[tableName];
      // FK 제약 해제 후 TRUNCATE (AUTO_INCREMENT도 함께 초기화됨)
      await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${realTable}\``);
      await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");
      return NextResponse.json({ success: true, message: `${tableName} 테이블 초기화 완료 (AUTO_INCREMENT 리셋)` });
    }

    // 방문자 카운트 수정
    if (action === "update-visitor-count") {
      const { id, count } = body;
      if (!id || count === undefined) {
        return NextResponse.json(
          { error: "id와 count가 필요합니다." },
          { status: 400 }
        );
      }
      const result = await prisma.visitorCount.update({
        where: { id },
        data: { count: parseInt(count, 10) },
      });
      return NextResponse.json({
        success: true,
        record: {
          id: result.id,
          date: result.date.toISOString().slice(0, 10),
          count: result.count,
        },
      });
    }

    return NextResponse.json({ error: "잘못된 action" }, { status: 400 });
  } catch (error) {
    console.error("[Admin DB POST]", error);
    return NextResponse.json(
      { error: "데이터 처리 실패" },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/admin/db — 데이터 삭제
// body: { tab, ids? }
// ============================================================
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { tab, ids } = body;

    if (tab === "site-settings" && Array.isArray(ids)) {
      const result = await prisma.siteSetting.deleteMany({
        where: { id: { in: ids } },
      });
      return NextResponse.json({ success: true, count: result.count });
    }

    if (tab === "visit-logs" && Array.isArray(ids)) {
      const result = await prisma.visitLog.deleteMany({
        where: { id: { in: ids } },
      });
      return NextResponse.json({ success: true, count: result.count });
    }

    if (tab === "visit-logs-all") {
      const result = await prisma.visitLog.deleteMany({});
      return NextResponse.json({ success: true, count: result.count });
    }

    if (tab === "visitor-stats" && Array.isArray(ids)) {
      const result = await prisma.visitorCount.deleteMany({
        where: { id: { in: ids } },
      });
      return NextResponse.json({ success: true, count: result.count });
    }

    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  } catch (error) {
    console.error("[Admin DB DELETE]", error);
    return NextResponse.json(
      { error: "삭제 실패" },
      { status: 500 }
    );
  }
}
