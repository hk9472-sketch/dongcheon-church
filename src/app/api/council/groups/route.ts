import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCouncilUser } from "@/lib/council";

// GET /api/council/groups?deptId=1 — 구역 목록 (멤버 포함)
export async function GET(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const deptId = Number(request.nextUrl.searchParams.get("deptId"));
  if (!deptId) {
    return NextResponse.json({ error: "deptId 필요" }, { status: 400 });
  }

  const groups = await prisma.councilGroup.findMany({
    where: { deptId },
    orderBy: { sortOrder: "asc" },
    include: {
      members: { orderBy: { sortOrder: "asc" } },
    },
  });

  return NextResponse.json(groups);
}

// POST /api/council/groups — 구역 생성
export async function POST(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const body = await request.json();
  const { deptId, name, teacher, sortOrder } = body;

  if (!deptId || !name) {
    return NextResponse.json({ error: "deptId, name 필요" }, { status: 400 });
  }

  const group = await prisma.councilGroup.create({
    data: { deptId, name, teacher: teacher || null, sortOrder: sortOrder ?? 0 },
  });

  return NextResponse.json(group);
}

// PUT /api/council/groups — 구역 수정
export async function PUT(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const body = await request.json();
  const { id, name, teacher, sortOrder } = body;

  if (!id) {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }

  const group = await prisma.councilGroup.update({
    where: { id },
    data: { name, teacher: teacher || null, sortOrder: sortOrder ?? 0 },
  });

  return NextResponse.json(group);
}

// DELETE /api/council/groups — 구역 삭제
export async function DELETE(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }

  await prisma.councilGroup.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
