import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import { toDateOnly } from "@/lib/accFund";

/**
 * POST /api/accounting/funds/checks
 * body: { fundId, date, actualAmount, memo }
 * 통장 대사 — 해당 일자의 실제 통장 잔액 기록 (같은 통장·일자면 덮어씀)
 */
export async function POST(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => ({}));
  const fundId = Number(body.fundId);
  const dateStr = String(body.date || "");
  const actualAmount = Number(body.actualAmount);
  if (!fundId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isInteger(actualAmount)) {
    return NextResponse.json({ error: "통장, 일자, 실제 잔액은 필수입니다." }, { status: 400 });
  }
  const fund = await prisma.accFund.findUnique({ where: { id: fundId } });
  if (!fund) return NextResponse.json({ error: "통장을 찾을 수 없습니다." }, { status: 404 });

  const date = toDateOnly(dateStr);
  const memo = String(body.memo ?? "").trim().slice(0, 200) || null;
  const createdBy = access.user?.name ?? String(access.userId ?? "");

  const saved = await prisma.accFundCheck.upsert({
    where: { fundId_date: { fundId, date } },
    create: { fundId, date, actualAmount, memo, createdBy },
    update: { actualAmount, memo, createdBy },
  });
  return NextResponse.json(saved, { status: 201 });
}

/**
 * DELETE /api/accounting/funds/checks?id=1
 */
export async function DELETE(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const id = parseInt(new URL(request.url).searchParams.get("id") || "", 10);
  if (!id) return NextResponse.json({ error: "id는 필수입니다." }, { status: 400 });
  await prisma.accFundCheck.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ success: true });
}
