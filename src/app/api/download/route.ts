import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";

// GET /api/download?boardId=DcPds&postId=123&fileNo=1
//
// posts.fileName1/fileName2 는 "data/<slug>/<파일>" 형식의 프로젝트 루트 기준 상대경로.
// 레거시 이관 중 끼어있던 '타임스탬프 서브폴더' 는 별도 SQL 일괄 정리로 제거돼 있다고 전제.
export async function GET(request: NextRequest) {
  try {
    const boardId = request.nextUrl.searchParams.get("boardId");
    const postId = parseInt(request.nextUrl.searchParams.get("postId") || "", 10);
    const fileNo = parseInt(request.nextUrl.searchParams.get("fileNo") || "1", 10);

    if (!boardId || isNaN(postId)) {
      return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      return NextResponse.json({ message: "게시글 없음" }, { status: 404 });
    }

    const fileName = fileNo === 2 ? post.fileName2 : post.fileName1;
    const origName = fileNo === 2 ? post.origName2 : post.origName1;

    if (!fileName) {
      return NextResponse.json({ message: "첨부파일 없음" }, { status: 404 });
    }

    // 경로 순회(path traversal) 방지
    if (
      fileName.includes("..") ||
      path.isAbsolute(fileName) ||
      /^[a-zA-Z]:[\\/]/.test(fileName) ||
      fileName.startsWith("\\\\")
    ) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), fileName);
    const resolved = path.resolve(filePath);
    const allowedRoot = path.resolve(process.cwd(), "data");
    if (!resolved.startsWith(allowedRoot + path.sep) && resolved !== allowedRoot) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    try {
      const fileBuffer = await readFile(resolved);

      if (fileNo === 2) {
        await prisma.$executeRaw`UPDATE posts SET download2 = download2 + 1 WHERE id = ${postId}`;
      } else {
        await prisma.$executeRaw`UPDATE posts SET download1 = download1 + 1 WHERE id = ${postId}`;
      }

      const displayName = origName || path.basename(fileName);
      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(displayName)}`,
          "Content-Length": String(fileBuffer.length),
        },
      });
    } catch {
      console.warn(`[download 404] postId=${postId} fileNo=${fileNo} fileName=${fileName}`);
      return NextResponse.json({ message: "파일을 찾을 수 없습니다." }, { status: 404 });
    }
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
