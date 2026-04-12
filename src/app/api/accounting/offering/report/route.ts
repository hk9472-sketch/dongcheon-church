import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * 회계 접근 권한 확인
 */
async function checkAccess(userId: number): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, accountAccess: true },
  });
  if (!user) return false;
  return user.isAdmin <= 2 || user.accountAccess;
}

/**
 * 날짜 문자열(YYYY-MM-DD)을 UTC 자정 Date로 변환
 * @db.Date 컬럼은 날짜만 저장하므로 UTC 자정 기준으로 맞춘다
 */
function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function toNextDay(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * UTC Date를 KST 날짜 문자열(YYYY-MM-DD)로 변환
 */
function toKSTDateStr(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * GET /api/accounting/offering/report
 * 연보 리포트 조회
 * Query: reportType (individual|daily|monthly|period|receipt),
 *        memberId, dateFrom, dateTo, offeringType, year
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!(await checkAccess(user.id)))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const reportType = searchParams.get("reportType");
  const memberId = searchParams.get("memberId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const offeringType = searchParams.get("offeringType");
  const year = searchParams.get("year");

  if (!reportType) {
    return NextResponse.json(
      { error: "reportType은 필수입니다 (individual, daily, monthly, period, receipt)" },
      { status: 400 }
    );
  }

  switch (reportType) {
    case "individual":
      return handleIndividual({ memberId, dateFrom, dateTo, offeringType });
    case "daily":
      return handleDaily({ dateFrom, dateTo, offeringType });
    case "monthly":
      return handleMonthly({ year, offeringType });
    case "period":
      return handlePeriod({ dateFrom, dateTo, offeringType });
    case "receipt":
      return handleReceipt({ memberId, year });
    default:
      return NextResponse.json(
        { error: "유효하지 않은 reportType입니다" },
        { status: 400 }
      );
  }
}

/**
 * 개인별 리포트: 교인별로 연보 유형별 합계
 */
async function handleIndividual(params: {
  memberId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  offeringType: string | null;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (params.memberId) where.memberId = parseInt(params.memberId, 10);
  if (params.offeringType) where.offeringType = params.offeringType;
  if (params.dateFrom || params.dateTo) {
    where.date = {};
    if (params.dateFrom) where.date.gte = toDateOnly(params.dateFrom);
    if (params.dateTo) where.date.lte = toDateOnly(params.dateTo);
  }

  const entries = await prisma.offeringEntry.findMany({
    where,
    include: {
      member: { select: { id: true, name: true, groupName: true } },
    },
    orderBy: [{ memberId: "asc" }, { date: "asc" }],
  });

  // 교인별 → 유형별 합계
  const grouped: Record<
    number,
    {
      member: { id: number; name: string; groupName: string | null };
      byType: Record<string, number>;
      total: number;
    }
  > = {};

  for (const e of entries) {
    if (!grouped[e.memberId]) {
      grouped[e.memberId] = {
        member: e.member,
        byType: {},
        total: 0,
      };
    }
    const g = grouped[e.memberId];
    g.byType[e.offeringType] = (g.byType[e.offeringType] || 0) + e.amount;
    g.total += e.amount;
  }

  return NextResponse.json({
    reportType: "individual",
    data: Object.values(grouped),
  });
}

/**
 * 일별 리포트: 날짜별 합계
 */
async function handleDaily(params: {
  dateFrom: string | null;
  dateTo: string | null;
  offeringType: string | null;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (params.offeringType) where.offeringType = params.offeringType;
  if (params.dateFrom || params.dateTo) {
    where.date = {};
    if (params.dateFrom) where.date.gte = toDateOnly(params.dateFrom);
    if (params.dateTo) where.date.lte = toDateOnly(params.dateTo);
  }

  const entries = await prisma.offeringEntry.findMany({
    where,
    orderBy: { date: "asc" },
  });

  // 날짜별 합계
  const grouped: Record<string, { date: string; amount: number; count: number }> = {};

  for (const e of entries) {
    const dateStr = toKSTDateStr(e.date);
    if (!grouped[dateStr]) {
      grouped[dateStr] = { date: dateStr, amount: 0, count: 0 };
    }
    grouped[dateStr].amount += e.amount;
    grouped[dateStr].count += 1;
  }

  return NextResponse.json({
    reportType: "daily",
    data: Object.values(grouped),
  });
}

/**
 * 월별 리포트: 월별 유형별 합계
 */
async function handleMonthly(params: {
  year: string | null;
  offeringType: string | null;
}) {
  const targetYear = params.year
    ? parseInt(params.year, 10)
    : new Date().getFullYear();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    date: {
      gte: toDateOnly(`${targetYear}-01-01`),
      lt: toNextDay(`${targetYear}-12-31`),
    },
  };
  if (params.offeringType) where.offeringType = params.offeringType;

  const entries = await prisma.offeringEntry.findMany({
    where,
    orderBy: { date: "asc" },
  });

  // 월별 → 유형별 합계
  const grouped: Record<
    string,
    { month: string; byType: Record<string, number>; total: number }
  > = {};

  for (const e of entries) {
    const month = toKSTDateStr(e.date).slice(0, 7); // YYYY-MM
    if (!grouped[month]) {
      grouped[month] = { month, byType: {}, total: 0 };
    }
    const g = grouped[month];
    g.byType[e.offeringType] = (g.byType[e.offeringType] || 0) + e.amount;
    g.total += e.amount;
  }

  return NextResponse.json({
    reportType: "monthly",
    year: targetYear,
    data: Object.values(grouped),
  });
}

/**
 * 기간별 리포트: 교인 + 유형별 기간 합계
 */
async function handlePeriod(params: {
  dateFrom: string | null;
  dateTo: string | null;
  offeringType: string | null;
}) {
  if (!params.dateFrom || !params.dateTo) {
    return NextResponse.json(
      { error: "기간 리포트는 dateFrom, dateTo가 필수입니다" },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    date: {
      gte: toDateOnly(params.dateFrom),
      lt: toNextDay(params.dateTo),
    },
  };
  if (params.offeringType) where.offeringType = params.offeringType;

  const entries = await prisma.offeringEntry.findMany({
    where,
    include: {
      member: { select: { id: true, name: true, groupName: true } },
    },
    orderBy: [{ memberId: "asc" }, { offeringType: "asc" }],
  });

  // 교인 + 유형별 합계
  const grouped: Record<
    string,
    {
      member: { id: number; name: string; groupName: string | null };
      offeringType: string;
      amount: number;
      count: number;
    }
  > = {};

  for (const e of entries) {
    const key = `${e.memberId}_${e.offeringType}`;
    if (!grouped[key]) {
      grouped[key] = {
        member: e.member,
        offeringType: e.offeringType,
        amount: 0,
        count: 0,
      };
    }
    grouped[key].amount += e.amount;
    grouped[key].count += 1;
  }

  return NextResponse.json({
    reportType: "period",
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    data: Object.values(grouped),
  });
}

/**
 * 기부금영수증 리포트: 특정 교인의 연간 유형별 합계 + 교인 정보
 */
async function handleReceipt(params: {
  memberId: string | null;
  year: string | null;
}) {
  if (!params.memberId) {
    return NextResponse.json(
      { error: "기부금영수증은 memberId가 필수입니다" },
      { status: 400 }
    );
  }

  const mid = parseInt(params.memberId, 10);
  const targetYear = params.year
    ? parseInt(params.year, 10)
    : new Date().getFullYear();

  const member = await prisma.offeringMember.findUnique({
    where: { id: mid },
    include: {
      family: { select: { id: true, name: true } },
      members: { select: { id: true, name: true } },
    },
  });
  if (!member) {
    return NextResponse.json({ error: "교인을 찾을 수 없습니다" }, { status: 404 });
  }

  // 해당 교인 + 가족 구성원의 연보도 포함 (가족 합산 영수증)
  const familyMemberIds = [mid];
  // 이 교인이 가족 대표인 경우 → 가족 구성원 포함
  if (member.members && member.members.length > 0) {
    familyMemberIds.push(...member.members.map((m) => m.id));
  }

  const entries = await prisma.offeringEntry.findMany({
    where: {
      memberId: { in: familyMemberIds },
      date: {
        gte: toDateOnly(`${targetYear}-01-01`),
        lt: toNextDay(`${targetYear}-12-31`),
      },
    },
    include: {
      member: { select: { id: true, name: true } },
    },
    orderBy: { date: "asc" },
  });

  // 유형별 합계
  const byType: Record<string, number> = {};
  let grandTotal = 0;
  for (const e of entries) {
    byType[e.offeringType] = (byType[e.offeringType] || 0) + e.amount;
    grandTotal += e.amount;
  }

  return NextResponse.json({
    reportType: "receipt",
    year: targetYear,
    member: {
      id: member.id,
      name: member.name,
      groupName: member.groupName,
    },
    familyMembers: member.members,
    byType,
    grandTotal,
    entries: entries.map((e) => ({
      date: toKSTDateStr(e.date),
      memberName: e.member.name,
      offeringType: e.offeringType,
      amount: e.amount,
      description: e.description,
    })),
  });
}
