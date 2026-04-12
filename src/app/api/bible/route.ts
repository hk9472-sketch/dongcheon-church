import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/bible - 성경 책 목록
export async function GET() {
  const books = await prisma.bibleBook.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      shortName: true,
      testament: true,
      totalChapters: true,
    },
  });

  return NextResponse.json(books);
}
