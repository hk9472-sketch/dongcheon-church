import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/db";
import * as fs from "fs";
import * as path from "path";

// GET /api/council/reading/[id] - 상세 조회
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  const { id } = await params;
  const reading = await prisma.reading.findUnique({
    where: { id: parseInt(id, 10) },
  });

  if (!reading) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({ reading });
}

// PUT /api/council/reading/[id] - 수정 (관리자)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { title, content, audioPath, sortOrder, timestamps } = body;

  const reading = await prisma.reading.update({
    where: { id: parseInt(id, 10) },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(content !== undefined && { content: content.trim() }),
      ...(audioPath !== undefined && { audioPath: audioPath || null }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(timestamps !== undefined && { timestamps: timestamps || null }),
    },
  });

  return NextResponse.json({ reading });
}

// DELETE /api/council/reading/[id] - 삭제 (관리자)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { id } = await params;
  const reading = await prisma.reading.findUnique({
    where: { id: parseInt(id, 10) },
  });

  if (!reading) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }

  // 오디오 파일 삭제
  if (reading.audioPath) {
    const filePath = path.join(process.cwd(), reading.audioPath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  await prisma.reading.delete({ where: { id: parseInt(id, 10) } });

  return NextResponse.json({ ok: true });
}
