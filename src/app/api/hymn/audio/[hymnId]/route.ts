import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import * as fs from "fs";
import * as path from "path";

// GET /api/hymn/audio/[hymnId] - MP3 음원 서빙 (로그인 불필요)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hymnId: string }> }
) {
  const { hymnId } = await params;
  const hymnIdNum = parseInt(hymnId, 10);
  if (isNaN(hymnIdNum)) {
    return NextResponse.json({ error: "Invalid parameter" }, { status: 400 });
  }

  const hymn = await prisma.hymn.findUnique({ where: { id: hymnIdNum } });
  if (!hymn) {
    return NextResponse.json({ error: "찬송가를 찾을 수 없습니다" }, { status: 404 });
  }

  // data/hymns/{number}.mp3
  const fileName = hymn.audioFile || `${hymn.number}.mp3`;
  const filePath = path.join(process.cwd(), "data", "hymns", fileName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "음성 파일을 찾을 수 없습니다" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  const isDownload = _req.nextUrl.searchParams.get("dl") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Content-Length": stat.size.toString(),
    "Cache-Control": "public, max-age=86400",
  };
  if (isDownload) {
    headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(fileName)}"`;
  }

  return new NextResponse(fileBuffer, { status: 200, headers });
}
