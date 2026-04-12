import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/bible/search?q=검색어
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], total: 0 });
  }

  const results = await prisma.bibleVerse.findMany({
    where: {
      content: { contains: q },
    },
    include: {
      book: { select: { name: true, shortName: true } },
    },
    orderBy: [{ bookId: "asc" }, { chapter: "asc" }, { verse: "asc" }],
    take: 100,
  });

  const total = await prisma.bibleVerse.count({
    where: { content: { contains: q } },
  });

  return NextResponse.json({
    results: results.map((r) => ({
      bookId: r.bookId,
      bookName: r.book.name,
      shortName: r.book.shortName,
      chapter: r.chapter,
      verse: r.verse,
      content: r.content,
    })),
    total,
  });
}
