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

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/accounting/offering/members/[id]
 * 연보 교인 상세 조회 (가족 그룹 + 최근 연보 내역)
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!(await checkAccess(user.id)))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { id } = await params;
  const memberId = parseInt(id, 10);
  if (isNaN(memberId))
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const member = await prisma.offeringMember.findUnique({
    where: { id: memberId },
    include: {
      // 가족 대표
      family: {
        select: { id: true, name: true, groupName: true },
      },
      // 이 교인에 속한 가족 구성원
      members: {
        select: { id: true, name: true, groupName: true, isActive: true },
      },
      // 최근 연보 내역 (최근 50건)
      entries: {
        orderBy: { date: "desc" },
        take: 50,
      },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "교인을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json(member);
}

/**
 * PUT /api/accounting/offering/members/[id]
 * 연보 교인 수정
 * Body: { name?, groupName?, familyId?, isActive? }
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!(await checkAccess(user.id)))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { id } = await params;
  const memberId = parseInt(id, 10);
  if (isNaN(memberId))
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const existing = await prisma.offeringMember.findUnique({
    where: { id: memberId },
  });
  if (!existing) {
    return NextResponse.json({ error: "교인을 찾을 수 없습니다" }, { status: 404 });
  }

  const body = await req.json();
  const { name, groupName, familyId, isActive } = body;

  // familyId 변경 시 유효성 확인
  if (familyId !== undefined && familyId !== null) {
    if (familyId === memberId) {
      return NextResponse.json(
        { error: "자기 자신을 가족 대표로 지정할 수 없습니다" },
        { status: 400 }
      );
    }
    const family = await prisma.offeringMember.findUnique({
      where: { id: familyId },
    });
    if (!family) {
      return NextResponse.json(
        { error: "가족 대표 교인을 찾을 수 없습니다" },
        { status: 400 }
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (name !== undefined) data.name = name.trim();
  if (groupName !== undefined) data.groupName = groupName?.trim() || null;
  if (familyId !== undefined) data.familyId = familyId;
  if (isActive !== undefined) data.isActive = isActive;

  const updated = await prisma.offeringMember.update({
    where: { id: memberId },
    data,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/accounting/offering/members/[id]
 * 연보 교인 삭제 (연보 내역이 없는 경우만)
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  if (!(await checkAccess(user.id)))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { id } = await params;
  const memberId = parseInt(id, 10);
  if (isNaN(memberId))
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const existing = await prisma.offeringMember.findUnique({
    where: { id: memberId },
  });
  if (!existing) {
    return NextResponse.json({ error: "교인을 찾을 수 없습니다" }, { status: 404 });
  }

  // 연보 내역이 있으면 삭제 불가
  const entryCount = await prisma.offeringEntry.count({
    where: { memberId },
  });
  if (entryCount > 0) {
    return NextResponse.json(
      { error: `연보 내역이 ${entryCount}건 있어 삭제할 수 없습니다. 비활성 처리를 이용하세요.` },
      { status: 400 }
    );
  }

  await prisma.offeringMember.delete({ where: { id: memberId } });

  return NextResponse.json({ success: true });
}
