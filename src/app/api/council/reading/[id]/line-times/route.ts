import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// 재독듣기 줄-시간 매핑 API.
// GET: 누구나 (해당 reading 의 모든 줄 시작 시간)
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

function parseId(p: { id: string }): number | null {
  const id = Number(p.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const p = await params;
  const id = parseId(p);
  if (id === null) return NextResponse.json({ message: "잘못된 id" }, { status: 400 });

  const times = await prisma.readingLineTime.findMany({
    where: { readingId: id },
    select: { lineIndex: true, startSec: true, manuallyAdjusted: true },
    orderBy: { lineIndex: "asc" },
  });
  return NextResponse.json({ times });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  const p = await params;
  const id = parseId(p);
  if (id === null) return NextResponse.json({ message: "잘못된 id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const lineIndex = Number(body?.lineIndex);
  const startSec = Number(body?.startSec);
  const manual = body?.manual === false ? false : true;
  if (
    !Number.isFinite(lineIndex) ||
    lineIndex < 0 ||
    !Number.isFinite(startSec) ||
    startSec < 0
  ) {
    return NextResponse.json(
      { message: "lineIndex, startSec 가 필요합니다." },
      { status: 400 }
    );
  }

  const saved = await prisma.readingLineTime.upsert({
    where: { readingId_lineIndex: { readingId: id, lineIndex } },
    update: { startSec, manuallyAdjusted: manual },
    create: { readingId: id, lineIndex, startSec, manuallyAdjusted: manual },
    select: { lineIndex: true, startSec: true, manuallyAdjusted: true },
  });
  return NextResponse.json({ saved });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  const p = await params;
  const id = parseId(p);
  if (id === null) return NextResponse.json({ message: "잘못된 id" }, { status: 400 });

  const lineRaw = request.nextUrl.searchParams.get("lineIndex");

  if (lineRaw === null || lineRaw === "all") {
    const result = await prisma.readingLineTime.deleteMany({
      where: { readingId: id },
    });
    return NextResponse.json({ deleted: result.count });
  }

  const lineIndex = Number(lineRaw);
  if (!Number.isFinite(lineIndex) || lineIndex < 0) {
    return NextResponse.json({ message: "lineIndex 값이 필요합니다." }, { status: 400 });
  }
  await prisma.readingLineTime
    .delete({ where: { readingId_lineIndex: { readingId: id, lineIndex } } })
    .catch(() => null);
  return NextResponse.json({ deleted: 1 });
}
