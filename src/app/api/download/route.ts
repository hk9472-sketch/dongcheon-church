import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";
import { getUploadDir, getUploadRoot } from "@/lib/uploadPath";

// GET /api/download?boardId=DcPds&postId=123&fileNo=1
//
// 기준 규약: 실제 파일은 항상 `data/<slug>/<파일명>` 에 존재한다.
// DB 의 posts.fileName1/fileName2 는 레거시 이관으로 접두사가 제각각이라
// (`1/foo.hwp`, `data/<다른slug>/foo.hwp`, `data/<slug>/<숫자>/foo.hwp` 등) 신뢰하지 않는다.
// 저장된 값에서 basename 만 뽑고, boardId(slug) 를 조합해 물리 경로를 재구성한다.
export async function GET(request: NextRequest) {
  try {
    const boardId = request.nextUrl.searchParams.get("boardId");
    const postId = parseInt(request.nextUrl.searchParams.get("postId") || "", 10);
    const fileNo = parseInt(request.nextUrl.searchParams.get("fileNo") || "1", 10);

    if (!boardId || isNaN(postId)) {
      return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
    }

    // slug 도 path traversal 방지 — 영문/숫자/언더스코어/하이픈만 허용
    if (!/^[A-Za-z0-9_-]+$/.test(boardId)) {
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

    // 저장값의 접두사(`1/`, `data/<slug>/`, 타임스탬프 서브폴더 등) 는 모두 무시하고 basename 만 사용.
    // Windows 경로(`\`) 도 대비해 슬래시로 통일 후 마지막 세그먼트 추출.
    const baseName = fileName.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
    if (!baseName || baseName.includes("..")) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    // Turbopack 이 path.resolve/join(multi-arg) 을 정적 추적해 "data/ 아래 16,000+ 파일"
    // 경고를 내지 않도록 uploadPath 헬퍼 (단일 인수 path.normalize 기반) 만 사용.
    const allowedRoot = getUploadRoot();
    const resolved = getUploadDir(`${boardId}${path.sep}${baseName}`);
    if (!resolved.startsWith(allowedRoot + path.sep)) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    try {
      const fileBuffer = await readFile(resolved);

      if (fileNo === 2) {
        await prisma.$executeRaw`UPDATE posts SET download2 = download2 + 1 WHERE id = ${postId}`;
      } else {
        await prisma.$executeRaw`UPDATE posts SET download1 = download1 + 1 WHERE id = ${postId}`;
      }

      const displayName = origName || baseName;
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
        `[download 404] postId=${postId} fileNo=${fileNo} boardId=${boardId} ` +
          `dbFileName=${JSON.stringify(fileName)} basename=${JSON.stringify(baseName)} ` +
          `resolved=${JSON.stringify(resolved)} code=${err?.code} message=${err?.message}`
      );
      return NextResponse.json(
        {
          message: "파일을 찾을 수 없습니다.",
          debug: {
            boardId,
            basename: baseName,
            resolved,
            code: err?.code,
          },
        },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
