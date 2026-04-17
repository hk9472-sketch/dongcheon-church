import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

/**
 * GET /api/accounting/accounts?unitId=1
 * 계정과목 목록 조회 (flat list with parentId for client-side tree building)
 */
export async function GET(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const unitIdStr = searchParams.get("unitId");

  if (!unitIdStr) {
    return NextResponse.json({ error: "unitId는 필수입니다." }, { status: 400 });
  }

  const unitId = parseInt(unitIdStr, 10);
  if (isNaN(unitId)) {
    return NextResponse.json({ error: "잘못된 unitId입니다." }, { status: 400 });
  }

  const accounts = await prisma.accAccount.findMany({
    where: { unitId },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    select: {
      id: true,
      unitId: true,
      code: true,
      name: true,
      type: true,
      parentId: true,
      level: true,
      sortOrder: true,
      isActive: true,
      description: true,
    },
  });

  return NextResponse.json(accounts);
}

/**
 * POST /api/accounting/accounts
 * 계정과목 생성 (관리자 전용)
 */
export async function POST(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }

  const body = await request.json();
  const { unitId, code, name, type, parentId, level, sortOrder, description } = body;

  if (!unitId || !code || !name || !type) {
    return NextResponse.json(
      { error: "unitId, code, name, type은 필수입니다." },
      { status: 400 }
    );
  }

  if (type !== "D" && type !== "C") {
    return NextResponse.json(
      { error: "type은 D(수입) 또는 C(지출)이어야 합니다." },
      { status: 400 }
    );
  }

  // 회계단위 존재 확인
  const unit = await prisma.accUnit.findUnique({ where: { id: unitId } });
  if (!unit) {
    return NextResponse.json({ error: "회계단위를 찾을 수 없습니다." }, { status: 404 });
  }

  // 코드 중복 확인 (같은 단위 내)
  const existing = await prisma.accAccount.findUnique({
    where: { unitId_code: { unitId, code } },
  });
  if (existing) {
    return NextResponse.json({ error: "이미 존재하는 코드입니다." }, { status: 409 });
  }

  // 부모 계정 확인
  if (parentId) {
    const parent = await prisma.accAccount.findUnique({ where: { id: parentId } });
    if (!parent || parent.unitId !== unitId) {
      return NextResponse.json({ error: "유효하지 않은 상위 계정입니다." }, { status: 400 });
    }
  }

  const account = await prisma.accAccount.create({
    data: {
      unitId,
      code,
      name,
      type,
      parentId: parentId || null,
      level: level ?? 0,
      sortOrder: sortOrder ?? 0,
      description: description || null,
    },
  });

  return NextResponse.json(account, { status: 201 });
}
