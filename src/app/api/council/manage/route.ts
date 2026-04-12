import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCouncilUser } from "@/lib/council";

// POST /api/council/manage — 부서 생성
export async function POST(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { name, sortOrder } = await request.json();
  if (!name) {
    return NextResponse.json({ error: "name 필요" }, { status: 400 });
  }

  const dept = await prisma.councilDept.create({
    data: { name, sortOrder: sortOrder ?? 0 },
  });

  return NextResponse.json(dept);
}

// PUT /api/council/manage — 부서 수정
export async function PUT(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { id, name, sortOrder } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }

  const dept = await prisma.councilDept.update({
    where: { id },
    data: { name, sortOrder: sortOrder ?? 0 },
  });

  return NextResponse.json(dept);
}

// DELETE /api/council/manage — 부서 삭제
export async function DELETE(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }

  await prisma.councilDept.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
