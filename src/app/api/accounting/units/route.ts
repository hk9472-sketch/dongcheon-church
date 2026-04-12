import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * 회계 접근 권한 확인 (isAdmin <= 2 또는 accountAccess)
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
 * GET /api/accounting/units
 * 회계단위 목록 조회
 */
export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!(await checkAccess(sessionUser.id))) {
    return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
  }

  const units = await prisma.accUnit.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(units);
}

/**
 * POST /api/accounting/units
 * 회계단위 생성 (관리자 전용)
 */
export async function POST(request: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (sessionUser.isAdmin > 2) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }

  const body = await request.json();
  const { code, name, sortOrder, isActive } = body;

  if (!code || !name) {
    return NextResponse.json({ error: "코드와 이름은 필수입니다." }, { status: 400 });
  }

  // 중복 코드 검사
  const existing = await prisma.accUnit.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json({ error: "이미 존재하는 코드입니다." }, { status: 409 });
  }

  const unit = await prisma.accUnit.create({
    data: {
      code,
      name,
      sortOrder: sortOrder ?? 0,
      isActive: isActive ?? true,
    },
  });

  return NextResponse.json(unit, { status: 201 });
}
