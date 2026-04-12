import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/bible/[bookId]/[chapter] - 특정 장의 절 목록
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookId: string; chapter: string }> }
) {
  const { bookId, chapter } = await params;
  const bookIdNum = parseInt(bookId, 10);
  const chapterNum = parseInt(chapter, 10);

  if (isNaN(bookIdNum) || isNaN(chapterNum)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const book = await prisma.bibleBook.findUnique({
    where: { id: bookIdNum },
    select: { id: true, name: true, shortName: true, totalChapters: true },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const verses = await prisma.bibleVerse.findMany({
    where: { bookId: bookIdNum, chapter: chapterNum },
    orderBy: { verse: "asc" },
    select: { verse: true, content: true },
  });

  return NextResponse.json({
    book,
    chapter: chapterNum,
    verses,
  });
}
