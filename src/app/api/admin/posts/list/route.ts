import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";

// GET /api/admin/posts/list?boardId=&categoryId=&keyword=&dateFrom=&dateTo=&limit=
// 관리자용 게시글 검색 (일괄 이동 화면 등에서 사용).
// categoryId 가 "null" 이면 카테고리 미지정 글만, 빈 값이면 전체.

async function requireAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const boardId = Number(sp.get("boardId"));
  if (!Number.isFinite(boardId) || boardId <= 0) {
    return NextResponse.json({ message: "boardId 가 필요합니다." }, { status: 400 });
  }
  const categoryRaw = sp.get("categoryId");
  const keyword = (sp.get("keyword") || "").trim();
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 200, 1), 500);

  const where: Prisma.PostWhereInput = { boardId };
  if (categoryRaw === "null") {
    where.categoryId = null;
  } else if (categoryRaw && categoryRaw !== "") {
    const cid = Number(categoryRaw);
    if (Number.isFinite(cid)) where.categoryId = cid;
  }

  if (keyword) {
    where.OR = [
      { subject: { contains: keyword } },
      { content: { contains: keyword } },
      { authorName: { contains: keyword } },
    ];
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(`${dateFrom}T00:00:00`);
    if (dateTo) {
      const d = new Date(`${dateTo}T00:00:00`);
      d.setDate(d.getDate() + 1);
      where.createdAt.lt = d;
    }
  }

  const posts = await prisma.post.findMany({
    where,
    select: {
      id: true,
      subject: true,
      authorName: true,
      createdAt: true,
      isNotice: true,
      depth: true,
      headnum: true,
      arrangenum: true,
      categoryId: true,
      category: { select: { name: true } },
    },
    orderBy: [{ headnum: "asc" }, { arrangenum: "asc" }],
    take: limit,
  });

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      subject: p.subject,
      authorName: p.authorName,
      createdAt: p.createdAt.toISOString(),
      isNotice: p.isNotice,
      depth: p.depth,
      headnum: p.headnum,
      arrangenum: p.arrangenum,
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? null,
    })),
    count: posts.length,
    limit,
  });
}
