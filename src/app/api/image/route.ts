import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

// GET /api/image?boardId=PkGallery&postId=123&fileNo=1
// 첨부 이미지를 인라인으로 반환 (다운로드 카운트 증가 없음)
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
    if (!fileName) {
      return NextResponse.json({ message: "첨부파일 없음" }, { status: 404 });
    }

    // 보안: path traversal 방지
    if (fileName.includes("..")) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), fileName);
    const ext = path.extname(fileName).toLowerCase();
    const contentType = MIME[ext];

    if (!contentType) {
      return NextResponse.json({ message: "이미지 파일이 아닙니다" }, { status: 400 });
    }

    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ message: "이미지를 찾을 수 없습니다" }, { status: 404 });
  }
}
