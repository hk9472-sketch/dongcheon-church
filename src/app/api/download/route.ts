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

    // fileName은 DB에 "data/{boardId}/{...}/filename" 형식으로 저장된 프로젝트 루트 기준 상대 경로
    const filePath = path.join(process.cwd(), fileName);

    try {
      const fileBuffer = await readFile(filePath);

      // 다운로드 카운트 증가 (updateMany로 @updatedAt 자동 갱신 회피)
      await prisma.post.updateMany({
        where: { id: postId },
        data: fileNo === 2 ? { download2: { increment: 1 } } : { download1: { increment: 1 } },
      });

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
