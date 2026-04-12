import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/board/info?slug=DcNotice
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ message: "slug 필요" }, { status: 400 });
  }

  const board = await prisma.board.findUnique({
    where: { slug },
    include: {
      categories: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!board) {
    return NextResponse.json({ message: "게시판 없음" }, { status: 404 });
  }

  return NextResponse.json({
    id: board.id,
    slug: board.slug,
    title: board.title,
    boardType: board.boardType,
    useCategory: board.useCategory,
    useComment: board.useComment,
    defaultCommentPolicy: board.defaultCommentPolicy,
    useSecret: board.useSecret,
    useReply: board.useReply,
    useHtml: board.useHtml,
    useFileUpload: board.useFileUpload,
    maxUploadSize: board.maxUploadSize,
    guideText: board.guideText,
    categories: board.categories.map((c) => ({ id: c.id, name: c.name })),
  });
}
