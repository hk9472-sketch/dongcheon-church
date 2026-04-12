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
 * GET /api/accounting/balance?unitId=1&year=2026
 * 이월잔액 조회
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
  const unitIdStr = searchParams.get("unitId");
  const yearStr = searchParams.get("year");

  if (!unitIdStr || !yearStr) {
    return NextResponse.json(
      { error: "unitId와 year는 필수입니다." },
      { status: 400 }
    );
  }

  const unitId = parseInt(unitIdStr, 10);
  const year = parseInt(yearStr, 10);

  const balance = await prisma.accBalance.findUnique({
    where: { unitId_year: { unitId, year } },
  });

  return NextResponse.json(balance || { unitId, year, amount: 0 });
}

/**
 * POST /api/accounting/balance
 * 이월잔액 설정/수정
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
  const { unitId, year, amount } = body;

  if (!unitId || !year || amount === undefined) {
    return NextResponse.json(
      { error: "unitId, year, amount는 필수입니다." },
      { status: 400 }
    );
  }

  if (typeof amount !== "number") {
    return NextResponse.json(
      { error: "amount는 숫자여야 합니다." },
      { status: 400 }
    );
  }

  // 회계단위 존재 확인
  const unit = await prisma.accUnit.findUnique({ where: { id: unitId } });
  if (!unit) {
    return NextResponse.json(
      { error: "회계단위를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  const balance = await prisma.accBalance.upsert({
    where: { unitId_year: { unitId, year } },
    create: { unitId, year, amount },
    update: { amount },
  });

  return NextResponse.json(balance);
}
