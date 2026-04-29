import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// 성경 절-시간 매핑 API.
// GET: 누구나 (장 내 모든 절 시작 시간)
// POST/DELETE: 관리자만

async function requireAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

function parseParams(p: { bookId: string; chapter: string }) {
  const bookId = Number(p.bookId);
  const chapter = Number(p.chapter);
  if (!Number.isFinite(bookId) || !Number.isFinite(chapter)) return null;
  return { bookId, chapter };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string; chapter: string }> }
) {
  const p = await params;
  const parsed = parseParams(p);
  if (!parsed) return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
  const times = await prisma.bibleVerseTime.findMany({
    where: { bookId: parsed.bookId, chapter: parsed.chapter },
    select: { verse: true, startSec: true, manuallyAdjusted: true },
    orderBy: { verse: "asc" },
  });
  return NextResponse.json({ times });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string; chapter: string }> }
) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });

  const p = await params;
  const parsed = parseParams(p);
  if (!parsed) return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const verse = Number(body?.verse);
  const startSec = Number(body?.startSec);
  // manual: 진행바로 미세 조정한 경우 true, 자동 분할 일괄 저장은 false. 기본 true.
  const manual = body?.manual === false ? false : true;
  if (!Number.isFinite(verse) || verse < 1 || !Number.isFinite(startSec) || startSec < 0) {
    return NextResponse.json({ message: "verse, startSec 가 필요합니다." }, { status: 400 });
  }

  const saved = await prisma.bibleVerseTime.upsert({
    where: {
      bookId_chapter_verse: {
        bookId: parsed.bookId,
        chapter: parsed.chapter,
        verse,
      },
    },
    update: { startSec, manuallyAdjusted: manual },
    create: {
      bookId: parsed.bookId,
      chapter: parsed.chapter,
      verse,
      startSec,
      manuallyAdjusted: manual,
    },
    select: { verse: true, startSec: true, manuallyAdjusted: true },
  });
  return NextResponse.json({ saved });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string; chapter: string }> }
) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });

  const p = await params;
  const parsed = parseParams(p);
  if (!parsed) return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });

  const verseRaw = request.nextUrl.searchParams.get("verse");

  if (verseRaw === null || verseRaw === "all") {
    // 장 전체 삭제
    const result = await prisma.bibleVerseTime.deleteMany({
      where: { bookId: parsed.bookId, chapter: parsed.chapter },
    });
    return NextResponse.json({ deleted: result.count });
  }

  const verse = Number(verseRaw);
  if (!Number.isFinite(verse) || verse < 1) {
    return NextResponse.json({ message: "verse 값이 필요합니다." }, { status: 400 });
  }
  await prisma.bibleVerseTime
    .delete({
      where: { bookId_chapter_verse: { bookId: parsed.bookId, chapter: parsed.chapter, verse } },
    })
    .catch(() => null);
  return NextResponse.json({ deleted: 1 });
}
