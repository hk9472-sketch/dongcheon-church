import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";
import { getUploadDir, getUploadRoot } from "@/lib/uploadPath";

// GET /api/download?attachmentId=123
//
// 파일 실물은 항상 UPLOAD_DIR/<slug>/<basename> 에 존재한다고 전제 (규약).
// PostAttachment.fileName 에 저장된 경로 접두사는 무시하고 basename 만 사용.
//
// 레거시 호환: ?boardId=X&postId=Y&fileNo=1|2 형태도 받는다.
// 이 경우 해당 post 의 attachments 에서 sortOrder === (fileNo-1) 인 것을 찾아 내려준다.
// (이관 SQL 이 file1 → sortOrder=0, file2 → sortOrder=1 로 저장하므로 일치)
export async function GET(request: NextRequest) {
  try {
    const attachmentIdStr = request.nextUrl.searchParams.get("attachmentId");
    const legacyBoardId = request.nextUrl.searchParams.get("boardId");
    const legacyPostIdStr = request.nextUrl.searchParams.get("postId");
    const legacyFileNoStr = request.nextUrl.searchParams.get("fileNo");

    let attachment: {
      id: number;
      fileName: string;
      origName: string;
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
          id: true, fileName: true, origName: true,
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
          id: true, fileName: true, origName: true,
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

    // basename 추출 (접두사 무시, Windows 슬래시도 대비)
    const baseName = attachment.fileName.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
    if (!baseName || baseName.includes("..")) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    // 실제 경로: UPLOAD_DIR/<slug>/<basename>
    const allowedRoot = getUploadRoot();
    const resolved = path.normalize(
      [getUploadDir(boardSlug), baseName].join(path.sep)
    );
    if (!resolved.startsWith(allowedRoot + path.sep)) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    try {
      const fileBuffer = await readFile(resolved);
      await prisma.postAttachment.update({
        where: { id: attachment.id },
        data: { downloadCount: { increment: 1 } },
      });

      const displayName = attachment.origName || baseName;
      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(displayName)}`,
          "Content-Length": String(fileBuffer.length),
        },
      });
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      console.warn(
        `[download 404] attachmentId=${attachment.id} boardSlug=${boardSlug} basename=${baseName} code=${err?.code}`
      );
      return NextResponse.json({ message: "파일을 찾을 수 없습니다." }, { status: 404 });
    }
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
