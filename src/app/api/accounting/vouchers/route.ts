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

/** dateTo 조회용: 해당 날짜 다음날 00:00:00Z (lt 비교용) */
function toNextDay(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * 다음 전표번호 생성
 */
async function generateVoucherNo(unitId: number, date: Date): Promise<string> {
  // UTC 자정 기준이므로 toISOString 날짜부분이 곧 입력 날짜
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");

  const existing = await prisma.accVoucher.findMany({
    where: {
      unitId,
      voucherNo: { startsWith: dateStr },
    },
    orderBy: { voucherNo: "desc" },
    take: 1,
  });

  const nextSeq =
    existing.length > 0
      ? parseInt(existing[0].voucherNo.split("-")[1]) + 1
      : 1;

  return `${dateStr}-${String(nextSeq).padStart(3, "0")}`;
}

/**
 * GET /api/accounting/vouchers
 * 전표 목록 조회 (필터 + 합계)
 */
export async function GET(request: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!(await checkAccess(sessionUser.id))) {
    return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const unitId = searchParams.get("unitId");
  const type = searchParams.get("type");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const accountId = searchParams.get("accountId");
  const keyword = searchParams.get("keyword");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (unitId) {
    where.unitId = parseInt(unitId, 10);
  }

  if (type && type !== "all") {
    where.type = type;
  }

  if (dateFrom) {
    where.date = { ...where.date, gte: toDateOnly(dateFrom) };
  }
  if (dateTo) {
    where.date = { ...where.date, lt: toNextDay(dateTo) };
  }

  // accountId 필터: items에 해당 계정이 있는 전표만
  if (accountId) {
    where.items = {
      some: { accountId: parseInt(accountId, 10) },
    };
  }

  // keyword 검색: description 또는 items의 description/counterpart
  if (keyword) {
    where.OR = [
      { description: { contains: keyword } },
      {
        items: {
          some: {
            OR: [
              { description: { contains: keyword } },
              { counterpart: { contains: keyword } },
            ],
          },
        },
      },
    ];
  }

  const vouchers = await prisma.accVoucher.findMany({
    where,
    include: {
      unit: { select: { id: true, code: true, name: true } },
      items: {
        include: {
          account: {
            select: { id: true, code: true, name: true, type: true },
          },
        },
        orderBy: { seq: "asc" },
      },
    },
    orderBy: [{ date: "asc" }, { voucherNo: "asc" }],
  });

  // 합계 계산
  let totalIncome = 0;
  let totalExpense = 0;
  for (const v of vouchers) {
    if (v.type === "D") {
      totalIncome += v.totalAmount;
    } else {
      totalExpense += v.totalAmount;
    }
  }

  return NextResponse.json({
    vouchers,
    summary: {
      totalIncome,
      totalExpense,
      count: vouchers.length,
    },
  });
}

/**
 * POST /api/accounting/vouchers
 * 전표 생성 (항목 포함)
 */
export async function POST(request: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!(await checkAccess(sessionUser.id))) {
    return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
  }

  const body = await request.json();
  const { unitId, type, date, description, items } = body;

  if (!unitId || !type || !date || !items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "unitId, type, date, items는 필수입니다." },
      { status: 400 }
    );
  }

  if (type !== "D" && type !== "C") {
    return NextResponse.json(
      { error: "type은 D(수입) 또는 C(지출)이어야 합니다." },
      { status: 400 }
    );
  }

  const voucherDate = toDateOnly(date);

  // 마감 여부 확인 (UTC 자정 기준이므로 바로 추출)
  const year = voucherDate.getUTCFullYear();
  const month = voucherDate.getUTCMonth() + 1;

  const closing = await prisma.accClosing.findUnique({
    where: { unitId_year_month: { unitId, year, month } },
  });
  if (closing && closing.closedAt) {
    return NextResponse.json(
      { error: `${year}년 ${month}월은 마감되어 전표를 추가할 수 없습니다.` },
      { status: 409 }
    );
  }

  // 전표번호 생성
  const voucherNo = await generateVoucherNo(unitId, voucherDate);

  // 총액 계산
  const totalAmount = items.reduce(
    (sum: number, item: { amount: number }) => sum + (item.amount || 0),
    0
  );

  // 트랜잭션으로 전표 + 항목 생성
  const voucher = await prisma.$transaction(async (tx) => {
    const created = await tx.accVoucher.create({
      data: {
        unitId,
        voucherNo,
        type,
        date: voucherDate,
        description: description || null,
        totalAmount,
        createdBy: sessionUser.name,
        items: {
          create: items.map(
            (
              item: {
                accountId: number;
                amount: number;
                description?: string;
                counterpart?: string;
              },
              index: number
            ) => ({
              seq: index + 1,
              accountId: item.accountId,
              amount: item.amount,
              description: item.description || null,
              counterpart: item.counterpart || null,
            })
          ),
        },
      },
      include: {
        items: {
          include: {
            account: {
              select: { id: true, code: true, name: true, type: true },
            },
          },
          orderBy: { seq: "asc" },
        },
      },
    });
    return created;
  });

  return NextResponse.json(voucher, { status: 201 });
}
