import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import type { Prisma } from "@prisma/client";

// GET /api/bible/search
//   q          검색어(2글자 이상)
//   testament  all | OT | NT   (성경 범위를 지정하지 않았을 때만 적용)
//   bookFrom   시작 책 id(1~66, 0=전체)
//   bookTo     끝 책 id(1~66, 0=전체)
//   chapterFrom / chapterTo   단일 책(bookFrom==bookTo)일 때 장 범위
//   page       1부터
//   pageSize   기본 50, 최대 200
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], total: 0, page: 1, pageSize: 50, totalPages: 0 });
  }

  const num = (v: string | null): number => {
    const n = parseInt(v ?? "", 10);
    return Number.isFinite(n) ? n : 0;
  };
  const testament = sp.get("testament") || "all";
  const bookFrom = num(sp.get("bookFrom"));
  const bookTo = num(sp.get("bookTo"));
  const chapterFrom = num(sp.get("chapterFrom"));
  const chapterTo = num(sp.get("chapterTo"));

  const pageSize = Math.min(200, Math.max(1, num(sp.get("pageSize")) || 50));
  const page = Math.max(1, num(sp.get("page")) || 1);

  const where: Prisma.BibleVerseWhereInput = { content: { contains: q } };

  if (bookFrom > 0 && bookTo > 0) {
    // 성경 범위 지정 — 책 범위(+단일 책이면 장 범위)가 검색범위(구약/신약)보다 우선
    const lo = Math.min(bookFrom, bookTo);
    const hi = Math.max(bookFrom, bookTo);
    where.bookId = { gte: lo, lte: hi };
    if (lo === hi && (chapterFrom > 0 || chapterTo > 0)) {
      const cLo = chapterFrom > 0 ? chapterFrom : 1;
      const cHi = chapterTo > 0 ? chapterTo : undefined;
      where.chapter = { gte: Math.min(cLo, cHi ?? cLo), ...(cHi ? { lte: Math.max(cLo, cHi) } : {}) };
    }
  } else if (testament === "OT" || testament === "NT") {
    where.book = { testament };
  }

  const total = await prisma.bibleVerse.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const results = await prisma.bibleVerse.findMany({
    where,
    include: { book: { select: { name: true, shortName: true } } },
    orderBy: [{ bookId: "asc" }, { chapter: "asc" }, { verse: "asc" }],
    skip: (safePage - 1) * pageSize,
    take: pageSize,
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
    page: safePage,
    pageSize,
    totalPages: total === 0 ? 0 : totalPages,
  });
}
