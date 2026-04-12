import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * PUT /api/accounting/units/[id]
 * 회계단위 수정 (관리자 전용)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (sessionUser.isAdmin > 2) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }

  const { id } = await params;
  const unitId = parseInt(id, 10);
  if (isNaN(unitId)) {
    return NextResponse.json({ error: "잘못된 ID입니다." }, { status: 400 });
  }

  const body = await request.json();
  const { code, name, sortOrder, isActive } = body;

  const existing = await prisma.accUnit.findUnique({ where: { id: unitId } });
  if (!existing) {
    return NextResponse.json({ error: "회계단위를 찾을 수 없습니다." }, { status: 404 });
  }

  // 코드 변경 시 중복 검사
  if (code && code !== existing.code) {
    const dup = await prisma.accUnit.findUnique({ where: { code } });
    if (dup) {
      return NextResponse.json({ error: "이미 존재하는 코드입니다." }, { status: 409 });
    }
  }

  const unit = await prisma.accUnit.update({
    where: { id: unitId },
    data: {
      ...(code !== undefined && { code }),
      ...(name !== undefined && { name }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json(unit);
}

/**
 * DELETE /api/accounting/units/[id]
 * 회계단위 삭제 (관리자 전용, 전표 없을 때만)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (sessionUser.isAdmin > 2) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }

  const { id } = await params;
  const unitId = parseInt(id, 10);
  if (isNaN(unitId)) {
    return NextResponse.json({ error: "잘못된 ID입니다." }, { status: 400 });
  }

  // 전표 존재 여부 확인
  const voucherCount = await prisma.accVoucher.count({ where: { unitId } });
  if (voucherCount > 0) {
    return NextResponse.json(
      { error: "해당 단위에 전표가 존재하여 삭제할 수 없습니다." },
      { status: 409 }
    );
  }

  await prisma.accUnit.delete({ where: { id: unitId } });

  return NextResponse.json({ success: true });
}
