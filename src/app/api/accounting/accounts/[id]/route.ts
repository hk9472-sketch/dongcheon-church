import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

/**
 * PUT /api/accounting/accounts/[id]
 * 계정과목 수정 (관리자 전용)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }

  const { id } = await params;
  const accountId = parseInt(id, 10);
  if (isNaN(accountId)) {
    return NextResponse.json({ error: "잘못된 ID입니다." }, { status: 400 });
  }

  const existing = await prisma.accAccount.findUnique({ where: { id: accountId } });
  if (!existing) {
    return NextResponse.json({ error: "계정과목을 찾을 수 없습니다." }, { status: 404 });
  }

  const body = await request.json();
  const { code, name, type, parentId, level, sortOrder, isActive, description } = body;

  // 코드 변경 시 중복 검사
  if (code && code !== existing.code) {
    const dup = await prisma.accAccount.findUnique({
      where: { unitId_code: { unitId: existing.unitId, code } },
    });
    if (dup) {
      return NextResponse.json({ error: "이미 존재하는 코드입니다." }, { status: 409 });
    }
  }

  // type 유효성
  if (type && type !== "D" && type !== "C") {
    return NextResponse.json(
      { error: "type은 D(수입) 또는 C(지출)이어야 합니다." },
      { status: 400 }
    );
  }

  // 부모 계정 확인
  if (parentId !== undefined && parentId !== null) {
    const parent = await prisma.accAccount.findUnique({ where: { id: parentId } });
    if (!parent || parent.unitId !== existing.unitId) {
      return NextResponse.json({ error: "유효하지 않은 상위 계정입니다." }, { status: 400 });
    }
    // 자기 자신을 부모로 설정 방지
    if (parentId === accountId) {
      return NextResponse.json({ error: "자기 자신을 상위로 지정할 수 없습니다." }, { status: 400 });
    }
  }

  const account = await prisma.accAccount.update({
    where: { id: accountId },
    data: {
      ...(code !== undefined && { code }),
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type }),
      ...(parentId !== undefined && { parentId: parentId || null }),
      ...(level !== undefined && { level }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(isActive !== undefined && { isActive }),
      ...(description !== undefined && { description: description || null }),
    },
  });

  return NextResponse.json(account);
}

/**
 * DELETE /api/accounting/accounts/[id]
 * 계정과목 삭제 (관리자 전용, 전표항목 없을 때만)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }

  const { id } = await params;
  const accountId = parseInt(id, 10);
  if (isNaN(accountId)) {
    return NextResponse.json({ error: "잘못된 ID입니다." }, { status: 400 });
  }

  // 전표항목 참조 확인
  const itemCount = await prisma.accVoucherItem.count({
    where: { accountId },
  });
  if (itemCount > 0) {
    return NextResponse.json(
      { error: "해당 계정에 전표항목이 존재하여 삭제할 수 없습니다." },
      { status: 409 }
    );
  }

  // 하위 계정 존재 확인
  const childCount = await prisma.accAccount.count({
    where: { parentId: accountId },
  });
  if (childCount > 0) {
    return NextResponse.json(
      { error: "하위 계정이 존재하여 삭제할 수 없습니다." },
      { status: 409 }
    );
  }

  await prisma.accAccount.delete({ where: { id: accountId } });

  return NextResponse.json({ success: true });
}
