import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import { isMonthClosed } from "@/lib/accFund";

/**
 * DELETE /api/accounting/transfers/[id]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const id = parseInt((await params).id, 10);
  const t = await prisma.accTransfer.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: "이체 내역을 찾을 수 없습니다." }, { status: 404 });
  if (await isMonthClosed(t.unitId, t.date)) {
    return NextResponse.json({ error: "마감된 월의 이체는 삭제할 수 없습니다." }, { status: 409 });
  }

  await prisma.accTransfer.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
