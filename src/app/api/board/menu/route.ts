import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/board/menu - 메뉴에 표시할 게시판 목록
export async function GET() {
  try {
    const boards = await prisma.board.findMany({
      where: { showInMenu: true },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, title: true, requireLogin: true },
    });

    return NextResponse.json(boards);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
