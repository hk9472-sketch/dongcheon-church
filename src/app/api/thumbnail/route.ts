import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import sharp from "sharp";

// GET /api/thumbnail?boardId=DcPds&file=image.jpg&w=200&h=200
export async function GET(request: NextRequest) {
  try {
    const boardId = request.nextUrl.searchParams.get("boardId");
    const file = request.nextUrl.searchParams.get("file");
    const w = parseInt(request.nextUrl.searchParams.get("w") || "200", 10);
    const h = parseInt(request.nextUrl.searchParams.get("h") || "200", 10);

    if (!boardId || !file) {
      return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
    }

    // 보안: path traversal 방지
    const safeFile = path.basename(file);
    const thumbDir = path.join(process.cwd(), "public", "uploads", boardId, "thumbs");
    const thumbPath = path.join(thumbDir, `${w}x${h}_${safeFile}`);

    // 캐시된 썸네일 확인
    try {
      const cached = await readFile(thumbPath);
      return new NextResponse(cached, {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" },
      });
    } catch {
      // 캐시 없음 → 생성
    }

    const srcPath = path.join(process.cwd(), "public", "uploads", boardId, safeFile);
    const srcBuffer = await readFile(srcPath);

    const thumbBuffer = await sharp(srcBuffer)
      .resize(w, h, { fit: "cover", position: "center" })
      .jpeg({ quality: 80 })
      .toBuffer();

    await mkdir(thumbDir, { recursive: true });
    await writeFile(thumbPath, thumbBuffer);

    return new NextResponse(new Uint8Array(thumbBuffer), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return NextResponse.json({ message: "썸네일 생성 실패" }, { status: 500 });
  }
}
