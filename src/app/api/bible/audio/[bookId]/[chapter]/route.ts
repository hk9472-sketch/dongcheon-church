import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import * as fs from "fs";
import * as path from "path";

// GET /api/bible/audio/[bookId]/[chapter] - MP3 음원 서빙 (회원 전용)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookId: string; chapter: string }> }
) {
  // 로그인 체크
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다" },
      { status: 401 }
    );
  }

  const { bookId, chapter } = await params;
  const bookIdNum = parseInt(bookId, 10);
  const chapterNum = parseInt(chapter, 10);

  if (isNaN(bookIdNum) || isNaN(chapterNum)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  // data/bibles/{bookId}_{chapter}.mp3
  const fileName = `${bookIdNum}_${chapterNum}.mp3`;
  const filePath = path.join(process.cwd(), "data", "bibles", fileName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: "음성 파일을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  const stat = fs.statSync(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  const isDownload = _req.nextUrl.searchParams.get("dl") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Content-Length": stat.size.toString(),
    "Cache-Control": "private, max-age=86400",
  };
  if (isDownload) {
    headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(fileName)}"`;
  }

  return new NextResponse(fileBuffer, { status: 200, headers });
}
