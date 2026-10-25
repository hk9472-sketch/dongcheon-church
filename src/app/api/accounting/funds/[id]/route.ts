import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

const KINDS = ["보통", "정기", "현금", "기타"];

async function adminGuard() {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }
  return null;
}

/**
 * PUT /api/accounting/funds/[id]
 * 통장 정보 수정 (이름/종류/은행/계좌번호/기본/정렬/사용여부/설명). 회계단위는 변경 불가.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await adminGuard();
  if (denied) return denied;

  const id = parseInt((await params).id, 10);
  const fund = await prisma.accFund.findUnique({ where: { id } });
  if (!fund) return NextResponse.json({ error: "통장을 찾을 수 없습니다." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "통장 이름은 필수입니다." }, { status: 400 });
    data.name = name;
  }
  if (body.kind !== undefined && KINDS.includes(body.kind)) data.kind = body.kind;
  if (body.bankName !== undefined) data.bankName = String(body.bankName).trim() || null;
  if (body.accountNo !== undefined) data.accountNo = String(body.accountNo).trim() || null;
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;
  if (body.description !== undefined) data.description = String(body.description).trim() || null;
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  if (body.isDefault !== undefined) data.isDefault = !!body.isDefault;

  if (data.isActive === false && (data.isDefault === true || (fund.isDefault && data.isDefault !== false))) {
    return NextResponse.json(
      { error: "기본 통장은 사용 중지할 수 없습니다. 다른 통장을 기본으로 지정한 뒤 중지하세요." },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (data.isDefault === true) {
      await tx.accFund.updateMany({
        where: { unitId: fund.unitId, id: { not: id } },
        data: { isDefault: false },
      });
    }
    return tx.accFund.update({ where: { id }, data });
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/accounting/funds/[id]
 * 사용 내역(전표/이체/대사)이 없을 때만 삭제. 있으면 사용 중지로 안내.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await adminGuard();
  if (denied) return denied;

  const id = parseInt((await params).id, 10);
  const fund = await prisma.accFund.findUnique({ where: { id } });
  if (!fund) return NextResponse.json({ error: "통장을 찾을 수 없습니다." }, { status: 404 });
  if (fund.isDefault) {
    return NextResponse.json({ error: "기본 통장은 삭제할 수 없습니다." }, { status: 400 });
  }

  const [v, tOut, tIn, c] = await Promise.all([
    prisma.accVoucher.count({ where: { fundId: id } }),
    prisma.accTransfer.count({ where: { fromFundId: id } }),
    prisma.accTransfer.count({ where: { toFundId: id } }),
    prisma.accFundCheck.count({ where: { fundId: id } }),
  ]);
  if (v + tOut + tIn + c > 0) {
    return NextResponse.json(
      { error: `사용 내역(전표 ${v}건, 이체 ${tOut + tIn}건, 대사 ${c}건)이 있어 삭제할 수 없습니다. 사용 중지를 이용하세요.` },
      { status: 409 },
    );
  }

  await prisma.accFund.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
