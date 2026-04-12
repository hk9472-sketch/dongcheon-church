import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/db";
import * as fs from "fs";
import * as path from "path";

// GET /api/council/reading/audio/[id] - 음성 스트리밍
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
    select: { audioPath: true, title: true },
  });

  if (!reading?.audioPath) {
    return NextResponse.json({ error: "음성 파일 없음" }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), reading.audioPath);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === ".mp3" ? "audio/mpeg" : ext === ".wav" ? "audio/wav" : "audio/mpeg";

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": stat.size.toString(),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
