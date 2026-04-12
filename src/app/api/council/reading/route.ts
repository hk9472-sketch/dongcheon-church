import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/db";

// GET /api/council/reading - 목록
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  const readings = await prisma.reading.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true, audioPath: true, sortOrder: true, createdAt: true, createdBy: true },
  });

  return NextResponse.json({ readings });
}

// POST /api/council/reading - 새 글 등록 (관리자)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const body = await req.json();
  const { title, content, audioPath, sortOrder } = body;

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력하세요" }, { status: 400 });
  }

  const reading = await prisma.reading.create({
    data: {
      title: title.trim(),
      content: content.trim(),
      audioPath: audioPath || null,
      sortOrder: sortOrder ?? 0,
      createdBy: user.name,
    },
  });

  return NextResponse.json({ reading });
}
