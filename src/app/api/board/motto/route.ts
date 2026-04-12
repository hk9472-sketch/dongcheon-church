import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/board/motto — DcNotice 게시판의 "표어" 카테고리 최신글 content 반환
export async function GET() {
  try {
    const board = await prisma.board.findUnique({
      where: { slug: "DcNotice" },
      select: { id: true },
    });
    if (!board) return NextResponse.json({ content: null });

    const category = await prisma.category.findFirst({
      where: { boardId: board.id, name: "표어" },
    });
    if (!category) return NextResponse.json({ content: null });

    const post = await prisma.post.findFirst({
      where: { boardId: board.id, categoryId: category.id },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });

    return NextResponse.json({ content: post?.content || null });
  } catch {
    return NextResponse.json({ content: null });
  }
}
