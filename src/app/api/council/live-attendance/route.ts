import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// 관리자/권찰회 권한 확인
async function requireCouncilAccess(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || (!user.councilAccess && user.isAdmin > 2)) return null;
  return user;
}

// 한국시간 기준 날짜 포맷
function formatDate(d: Date | string): string {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/\. /g, "-").replace(".", "");
}

// 한국시간 오늘 시작/끝
function todayRangeKST(): { start: Date; end: Date } {
  const now = new Date();
  const kstStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
  return {
    start: new Date(kstStr + "T00:00:00+09:00"),
    end: new Date(kstStr + "T23:59:59+09:00"),
  };
}

// GET /api/council/live-attendance?date=2026-03-08
// GET /api/council/live-attendance?from=2026-01-01&to=2026-03-15
export async function GET(request: NextRequest) {
  const user = await requireCouncilAccess(request);
  if (!user) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");

  // 개별 날짜의 레코드 목록 (date 파라미터 없으면 오늘 KST)
  let records: { id: number; name: string; createdAt: Date }[] = [];
  {
    let startDate: Date, endDate: Date;
    if (dateParam) {
      startDate = new Date(dateParam + "T00:00:00+09:00");
      endDate = new Date(dateParam + "T23:59:59+09:00");
    } else {
      const today = todayRangeKST();
      startDate = today.start;
      endDate = today.end;
    }
    records = await prisma.liveAttendance.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true },
    });
  }

  // 날짜별 집계 (from/to 기간 또는 기본 최근 30일)
  let rangeStart: Date;
  let rangeEnd: Date;

  if (fromParam && toParam) {
    rangeStart = new Date(fromParam + "T00:00:00+09:00");
    rangeEnd = new Date(toParam + "T23:59:59+09:00");
  } else {
    // 기본: 최근 30일
    rangeEnd = new Date();
    rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - 30);
  }

  const dateCounts = await prisma.$queryRaw<{ date: Date | string; count: bigint }[]>`
    SELECT DATE(createdAt) as date, COUNT(*) as count
    FROM live_attendances
    WHERE createdAt >= ${rangeStart} AND createdAt <= ${rangeEnd}
    GROUP BY DATE(createdAt)
    ORDER BY date DESC
  `;

  return NextResponse.json({
    records: records.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
    })),
    dates: dateCounts.map((d) => ({
      date: formatDate(d.date),
      count: Number(d.count),
    })),
  });
}

// DELETE /api/council/live-attendance?id=123
export async function DELETE(request: NextRequest) {
  const user = await requireCouncilAccess(request);
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const idParam = request.nextUrl.searchParams.get("id");
  if (!idParam) {
    return NextResponse.json({ message: "삭제할 항목을 지정해 주세요." }, { status: 400 });
  }

  await prisma.liveAttendance.delete({ where: { id: Number(idParam) } });
  return NextResponse.json({ message: "삭제되었습니다." });
}
