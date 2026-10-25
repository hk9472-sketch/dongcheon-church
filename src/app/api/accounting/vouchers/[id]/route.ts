import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import { resolveVoucherFund } from "@/lib/accFund";

/**
 * 날짜 문자열(YYYY-MM-DD)을 UTC 자정 Date로 변환
 * @db.Date 컬럼은 날짜만 저장하므로 UTC 자정 기준으로 맞춘다
 */
function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

/**
 * GET /api/accounting/vouchers/[id]
 * 전표 단건 조회 (항목 포함)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const voucherId = parseInt(id, 10);
  if (isNaN(voucherId)) {
    return NextResponse.json({ error: "잘못된 ID입니다." }, { status: 400 });
  }

  const voucher = await prisma.accVoucher.findUnique({
    where: { id: voucherId },
    include: {
      items: {
        include: {
          account: {
            select: { id: true, code: true, name: true, type: true },
          },
        },
        orderBy: { seq: "asc" },
      },
      unit: { select: { id: true, code: true, name: true } },
      fund: { select: { id: true, name: true } },
    },
  });

  if (!voucher) {
    return NextResponse.json({ error: "전표를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(voucher);
}

/**
 * PUT /api/accounting/vouchers/[id]
 * 전표 수정 (항목 전체 교체)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const voucherId = parseInt(id, 10);
  if (isNaN(voucherId)) {
    return NextResponse.json({ error: "잘못된 ID입니다." }, { status: 400 });
  }

  const existing = await prisma.accVoucher.findUnique({
    where: { id: voucherId },
  });
  if (!existing) {
    return NextResponse.json({ error: "전표를 찾을 수 없습니다." }, { status: 404 });
  }

  // 회계 간 대체로 생성된 전표는 대체 화면에서만 삭제
  const linked = await prisma.accUnitTransfer.findFirst({
    where: { OR: [{ fromVoucherId: voucherId }, { toVoucherId: voucherId }] },
  });
  if (linked) {
    return NextResponse.json(
      { error: "회계 간 대체로 생성된 전표입니다. [회계 간 대체] 화면에서 삭제 후 다시 등록하세요." },
      { status: 409 }
    );
  }

  // 마감 확인
  if (existing.isClosed) {
    return NextResponse.json(
      { error: "마감된 전표는 수정할 수 없습니다." },
      { status: 409 }
    );
  }

  const body = await request.json();
  const { type, date, description, items, fundId } = body;

  // 통장 변경 (미지정이면 유지, null/"" 이면 기본 통장)
  let fundData: { fundId: number | null } | Record<string, never> = {};
  if (fundId !== undefined) {
    const f = await resolveVoucherFund(existing.unitId, fundId);
    if (!f.ok) return NextResponse.json({ error: f.error }, { status: 400 });
    fundData = { fundId: f.fundId };
  }

  // 항목 배열이 주어졌으면 비어있으면 안 됨 (데이터 손상 방지)
  if (items !== undefined) {
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "항목 배열은 비어있을 수 없습니다." },
        { status: 400 }
      );
    }
    // amount ≠ 0 검증 (음수 = 환급·차감)
    const invalid = items.find(
      (item: { amount?: number; accountId?: number }) =>
        typeof item.amount !== "number" ||
        !Number.isInteger(item.amount) ||
        item.amount === 0 ||
        typeof item.accountId !== "number"
    );
    if (invalid) {
      return NextResponse.json(
        { error: "모든 항목은 유효한 계정과 0이 아닌 금액을 가져야 합니다." },
        { status: 400 }
      );
    }
  }

  // 날짜 변경 시 해당 월 마감 확인 (UTC 자정 기준이므로 UTC 접근자 사용)
  const targetDate = date ? toDateOnly(date) : existing.date;
  const year = targetDate.getUTCFullYear();
  const month = targetDate.getUTCMonth() + 1;

  const closing = await prisma.accClosing.findUnique({
    where: {
      unitId_year_month: { unitId: existing.unitId, year, month },
    },
  });
  if (closing && closing.closedAt) {
    return NextResponse.json(
      { error: `${year}년 ${month}월은 마감되어 수정할 수 없습니다.` },
      { status: 409 }
    );
  }

  // 총액 계산
  const totalAmount =
    items && Array.isArray(items)
      ? items.reduce(
          (sum: number, item: { amount: number }) => sum + (item.amount || 0),
          0
        )
      : existing.totalAmount;

  const voucher = await prisma.$transaction(async (tx) => {
    // 항목이 있으면 기존 항목 삭제 후 재생성
    if (items && Array.isArray(items)) {
      await tx.accVoucherItem.deleteMany({ where: { voucherId } });
    }

    const updated = await tx.accVoucher.update({
      where: { id: voucherId },
      data: {
        ...(type !== undefined && { type }),
        ...(date !== undefined && { date: toDateOnly(date) }),
        ...(description !== undefined && { description: description || null }),
        ...fundData,
        totalAmount,
        ...(items &&
          Array.isArray(items) && {
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
          }),
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
        fund: { select: { id: true, name: true } },
      },
    });

    return updated;
  });

  return NextResponse.json(voucher);
}

/**
 * DELETE /api/accounting/vouchers/[id]
 * 전표 삭제
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const voucherId = parseInt(id, 10);
  if (isNaN(voucherId)) {
    return NextResponse.json({ error: "잘못된 ID입니다." }, { status: 400 });
  }

  const existing = await prisma.accVoucher.findUnique({
    where: { id: voucherId },
  });
  if (!existing) {
    return NextResponse.json({ error: "전표를 찾을 수 없습니다." }, { status: 404 });
  }

  // 회계 간 대체로 생성된 전표는 대체 화면에서만 삭제
  const linked = await prisma.accUnitTransfer.findFirst({
    where: { OR: [{ fromVoucherId: voucherId }, { toVoucherId: voucherId }] },
  });
  if (linked) {
    return NextResponse.json(
      { error: "회계 간 대체로 생성된 전표입니다. [회계 간 대체] 화면에서 삭제 후 다시 등록하세요." },
      { status: 409 }
    );
  }

  if (existing.isClosed) {
    return NextResponse.json(
      { error: "마감된 전표는 삭제할 수 없습니다." },
      { status: 409 }
    );
  }

  // Cascade delete로 items도 함께 삭제됨
  await prisma.accVoucher.delete({ where: { id: voucherId } });

  return NextResponse.json({ success: true });
}
