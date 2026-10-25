import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

const KINDS = ["보통", "정기", "현금", "기타"];

/**
 * GET /api/accounting/funds?unitId=1
 * 통장 목록 (unitId 생략 시 전체). 회계단위 이름 포함.
 */
export async function GET(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const unitIdStr = new URL(request.url).searchParams.get("unitId");
  const unitId = unitIdStr && unitIdStr !== "all" ? parseInt(unitIdStr, 10) : null;

  const funds = await prisma.accFund.findMany({
    where: unitId ? { unitId } : {},
    include: { unit: { select: { id: true, name: true, sortOrder: true } } },
    orderBy: [{ unitId: "asc" }, { isDefault: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
  });

  return NextResponse.json(funds);
}

/**
 * POST /api/accounting/funds
 * 통장 생성 (관리자 전용). isDefault=true 면 같은 단위의 다른 기본 통장 해제.
 */
export async function POST(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const unitId = Number(body.unitId);
  const name = String(body.name ?? "").trim();
  if (!unitId || !name) {
    return NextResponse.json({ error: "회계단위와 통장 이름은 필수입니다." }, { status: 400 });
  }
  const kind = KINDS.includes(body.kind) ? body.kind : "보통";

  const unit = await prisma.accUnit.findUnique({ where: { id: unitId } });
  if (!unit) {
    return NextResponse.json({ error: "회계단위를 찾을 수 없습니다." }, { status: 404 });
  }

  const hasAny = await prisma.accFund.count({ where: { unitId } });
  const isDefault = !!body.isDefault || hasAny === 0; // 첫 통장은 자동 기본

  const fund = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.accFund.updateMany({ where: { unitId }, data: { isDefault: false } });
    }
    return tx.accFund.create({
      data: {
        unitId,
        name,
        kind,
        bankName: String(body.bankName ?? "").trim() || null,
        accountNo: String(body.accountNo ?? "").trim() || null,
        isDefault,
        sortOrder: Number(body.sortOrder) || 0,
        description: String(body.description ?? "").trim() || null,
      },
    });
  });

  return NextResponse.json(fund, { status: 201 });
}
