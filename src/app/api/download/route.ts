import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";

// GET /api/download?boardId=DcPds&postId=123&fileNo=1
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

    // 경로 순회(path traversal) 방지 — 파일명에 .. 또는 절대경로 마커 차단
    if (
      fileName.includes("..") ||
      path.isAbsolute(fileName) ||
      /^[a-zA-Z]:[\\/]/.test(fileName) || // Windows 드라이브 지정자
      fileName.startsWith("\\\\") // UNC 경로
    ) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    // fileName은 DB에 "data/{boardId}/{...}/filename" 형식으로 저장된 프로젝트 루트 기준 상대 경로
    const filePath = path.join(process.cwd(), fileName);
    const resolved = path.resolve(filePath);
    const allowedRoot = path.resolve(process.cwd(), "data");
    if (!resolved.startsWith(allowedRoot + path.sep) && resolved !== allowedRoot) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    try {
      const fileBuffer = await readFile(resolved);

      // 다운로드 카운트 증가 — 원시 SQL 로 updatedAt 보존.
      if (fileNo === 2) {
        await prisma.$executeRaw`UPDATE posts SET download2 = download2 + 1 WHERE id = ${postId}`;
      } else {
        await prisma.$executeRaw`UPDATE posts SET download1 = download1 + 1 WHERE id = ${postId}`;
      }

      // 파일 응답 (origName 없으면 경로에서 파일명만 추출)
      const displayName = origName || path.basename(fileName);
      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(displayName)}`,
          "Content-Length": String(fileBuffer.length),
        },
      });
    } catch {
      return NextResponse.json({ message: "파일을 찾을 수 없습니다." }, { status: 404 });
    }
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
