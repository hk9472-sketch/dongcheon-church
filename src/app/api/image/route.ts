import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";
import { getUploadDir, getUploadRoot } from "@/lib/uploadPath";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

// GET /api/image?attachmentId=123         — 신규 (권장)
//  or  ?boardId=X&postId=Y&fileNo=1|2     — 레거시 호환 (sortOrder = fileNo-1)
// 첨부 이미지를 인라인으로 반환 (다운로드 카운트 증가 없음)
export async function GET(request: NextRequest) {
  try {
    const attachmentIdStr = request.nextUrl.searchParams.get("attachmentId");
    const legacyBoardId = request.nextUrl.searchParams.get("boardId");
    const legacyPostIdStr = request.nextUrl.searchParams.get("postId");
    const legacyFileNoStr = request.nextUrl.searchParams.get("fileNo");

    let attachment: {
      fileName: string;
      post: { board: { slug: string } };
    } | null = null;

    if (attachmentIdStr) {
      const attachmentId = parseInt(attachmentIdStr, 10);
      if (isNaN(attachmentId)) {
        return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
      }
      attachment = await prisma.postAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          fileName: true,
          post: { select: { board: { select: { slug: true } } } },
        },
      });
    } else if (legacyBoardId && legacyPostIdStr) {
      const postId = parseInt(legacyPostIdStr, 10);
      const fileNo = parseInt(legacyFileNoStr || "1", 10);
      if (!/^[A-Za-z0-9_-]+$/.test(legacyBoardId) || isNaN(postId)) {
        return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
      }
      attachment = await prisma.postAttachment.findFirst({
        where: { postId, sortOrder: fileNo - 1 },
        select: {
          fileName: true,
          post: { select: { board: { select: { slug: true } } } },
        },
      });
    } else {
      return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
    }

    if (!attachment) {
      return NextResponse.json({ message: "첨부파일 없음" }, { status: 404 });
    }

    const boardSlug = attachment.post.board.slug;
    if (!/^[A-Za-z0-9_-]+$/.test(boardSlug)) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    const baseName = attachment.fileName.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
    if (!baseName || baseName.includes("..")) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    const ext = path.extname(baseName).toLowerCase();
    const contentType = MIME[ext];
    if (!contentType) {
      return NextResponse.json({ message: "이미지 파일이 아닙니다" }, { status: 400 });
    }

    const allowedRoot = getUploadRoot();
    const resolved = path.normalize(
      [getUploadDir(boardSlug), baseName].join(path.sep)
    );
    if (!resolved.startsWith(allowedRoot + path.sep)) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    const fileBuffer = await readFile(resolved);
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
