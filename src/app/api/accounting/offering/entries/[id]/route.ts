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
 * 날짜 문자열(YYYY-MM-DD)을 UTC 자정 Date로 변환
 * @db.Date 컬럼은 날짜만 저장하므로 UTC 자정 기준으로 맞춘다
 */
function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PUT /api/accounting/offering/entries/[id]
 * 연보 내역 수정
 * Body: { date?, memberId?, offeringType?, amount?, description? }
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!(await checkAccess(user.id)))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { id } = await params;
  const entryId = parseInt(id, 10);
  if (isNaN(entryId))
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const existing = await prisma.offeringEntry.findUnique({
    where: { id: entryId },
  });
  if (!existing) {
    return NextResponse.json({ error: "연보 내역을 찾을 수 없습니다" }, { status: 404 });
  }

  const body = await req.json();
  const { date, memberId, offeringType, amount, description } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};

  if (date !== undefined) {
    data.date = toDateOnly(date);
  }
  if (memberId !== undefined) {
    const member = await prisma.offeringMember.findUnique({
      where: { id: memberId },
    });
    if (!member) {
      return NextResponse.json(
        { error: "교인을 찾을 수 없습니다" },
        { status: 400 }
      );
    }
    data.memberId = memberId;
  }
  if (offeringType !== undefined) {
    const validTypes = ["주일연보", "감사", "특별", "절기", "오일"];
    if (!validTypes.includes(offeringType)) {
      return NextResponse.json(
        { error: `유효하지 않은 연보 유형입니다 (${validTypes.join(", ")})` },
        { status: 400 }
      );
    }
    data.offeringType = offeringType;
  }
  if (amount !== undefined) {
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "금액은 0보다 커야 합니다" },
        { status: 400 }
      );
    }
    data.amount = amount;
  }
  if (description !== undefined) {
    data.description = description?.trim() || null;
  }

  const updated = await prisma.offeringEntry.update({
    where: { id: entryId },
    data,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/accounting/offering/entries/[id]
 * 연보 내역 삭제
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!(await checkAccess(user.id)))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { id } = await params;
  const entryId = parseInt(id, 10);
  if (isNaN(entryId))
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const existing = await prisma.offeringEntry.findUnique({
    where: { id: entryId },
  });
  if (!existing) {
    return NextResponse.json({ error: "연보 내역을 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.offeringEntry.delete({ where: { id: entryId } });

  return NextResponse.json({ success: true });
}
