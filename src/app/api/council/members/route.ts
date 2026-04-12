import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCouncilUser } from "@/lib/council";

// GET /api/council/members?groupId=1 — 교인 목록
export async function GET(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const groupId = Number(request.nextUrl.searchParams.get("groupId"));
  if (!groupId) {
    return NextResponse.json({ error: "groupId 필요" }, { status: 400 });
  }

  const members = await prisma.councilMember.findMany({
    where: { groupId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(members);
}

// POST /api/council/members — 교인 추가
export async function POST(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const body = await request.json();
  const { groupId, name, phone, note, sortOrder } = body;

  if (!groupId || !name) {
    return NextResponse.json({ error: "groupId, name 필요" }, { status: 400 });
  }

  const member = await prisma.councilMember.create({
    data: {
      groupId,
      name,
      phone: phone || null,
      note: note || null,
      sortOrder: sortOrder ?? 0,
    },
  });

  return NextResponse.json(member);
}

// PUT /api/council/members — 교인 수정
export async function PUT(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const body = await request.json();
  const { id, name, phone, note, sortOrder } = body;

  if (!id) {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }

  const member = await prisma.councilMember.update({
    where: { id },
    data: {
      name,
      phone: phone || null,
      note: note || null,
      sortOrder: sortOrder ?? 0,
    },
  });

  return NextResponse.json(member);
}

// DELETE /api/council/members — 교인 삭제
export async function DELETE(request: NextRequest) {
  const user = await getCouncilUser();
  if (!user) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }

  await prisma.councilMember.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
