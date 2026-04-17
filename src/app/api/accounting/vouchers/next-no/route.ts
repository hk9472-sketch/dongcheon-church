import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

/**
 * GET /api/accounting/vouchers/next-no?unitId=1&date=2026-04-05
 * 다음 전표번호 조회
 */
export async function GET(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
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
