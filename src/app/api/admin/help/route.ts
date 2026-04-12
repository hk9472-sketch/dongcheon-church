import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/admin/help — 도움말 목록 (관리자)
// GET /api/admin/help?slug=xxx — 특정 도움말 (공개)
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");

  if (slug) {
    // 공개 조회 (도움말 버튼에서 호출)
    const page = await prisma.helpPage.findUnique({ where: { slug } });
    if (!page) {
      return NextResponse.json({ message: "등록된 도움말이 없습니다." }, { status: 404 });
    }
    return NextResponse.json(page);
  }

  // 관리자: 전체 목록
  const user = await getCurrentUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ message: "권한 없음" }, { status: 403 });
  }

  const pages = await prisma.helpPage.findMany({
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: { id: true, slug: true, title: true, sortOrder: true, updatedAt: true },
  });
  return NextResponse.json(pages);
}

// POST /api/admin/help — 도움말 생성/수정
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ message: "권한 없음" }, { status: 403 });
  }

  const body = await request.json();
  const { id, slug, title, content, sortOrder } = body as {
    id?: number;
    slug: string;
    title: string;
    content: string;
    sortOrder?: number;
  };

  if (!slug?.trim() || !title?.trim()) {
    return NextResponse.json({ message: "슬러그와 제목은 필수입니다." }, { status: 400 });
  }

  if (id) {
    const result = await prisma.helpPage.update({
      where: { id },
      data: { slug: slug.trim(), title: title.trim(), content, sortOrder: sortOrder ?? 0 },
    });
    return NextResponse.json(result);
  }

  // 중복 슬러그 체크
  const existing = await prisma.helpPage.findUnique({ where: { slug: slug.trim() } });
  if (existing) {
    return NextResponse.json({ message: "이미 동일한 슬러그의 도움말이 존재합니다." }, { status: 400 });
  }

  const result = await prisma.helpPage.create({
    data: { slug: slug.trim(), title: title.trim(), content, sortOrder: sortOrder ?? 0 },
  });
  return NextResponse.json(result);
}

// DELETE /api/admin/help — 도움말 삭제
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ message: "권한 없음" }, { status: 403 });
  }

  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ message: "id 필수" }, { status: 400 });
  }

  await prisma.helpPage.delete({ where: { id: body.id } });
  return NextResponse.json({ success: true });
}
