import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

/**
 * GET /api/accounting/balance?unitId=1&year=2026
 * 이월잔액 조회
 */
export async function GET(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
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
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
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
