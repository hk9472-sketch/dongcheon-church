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
 * GET /api/accounting/vouchers/next-no?unitId=1&date=2026-04-05
 * 다음 전표번호 조회
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
  const dateStr = searchParams.get("date");

  if (!unitIdStr || !dateStr) {
    return NextResponse.json(
      { error: "unitId와 date는 필수입니다." },
      { status: 400 }
    );
  }

  const unitId = parseInt(unitIdStr, 10);
  if (isNaN(unitId)) {
    return NextResponse.json({ error: "잘못된 unitId입니다." }, { status: 400 });
  }

  // date를 YYYYMMDD 형식으로 변환
  const datePrefix = dateStr.replace(/-/g, "");

  const existing = await prisma.accVoucher.findMany({
    where: {
      unitId,
      voucherNo: { startsWith: datePrefix },
    },
    orderBy: { voucherNo: "desc" },
    take: 1,
  });

  const nextSeq =
    existing.length > 0
      ? parseInt(existing[0].voucherNo.split("-")[1]) + 1
      : 1;

  const voucherNo = `${datePrefix}-${String(nextSeq).padStart(3, "0")}`;

  return NextResponse.json({ voucherNo });
}
