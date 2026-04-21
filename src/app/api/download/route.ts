import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";

// GET /api/download?boardId=DcPds&postId=123&fileNo=1
//
// 레거시 이관 글은 fileName 이 여러 형식으로 저장돼 있을 수 있어 후보 경로를 순서대로 시도한다:
//   1) 저장된 그대로: "data/<slug>/<파일>"
//   2) 슬러그·경로 없이 파일명만: "<파일>"       → "data/<slug>/<파일>" 로 조합
//   3) 제로보드 원본 스트럭처:    "file/<slug>/<파일>" → 매핑
// 모든 후보가 실패할 때 비로소 404 + 시도한 경로 목록 디버그 로그.
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

    const rawFileName = fileNo === 2 ? post.fileName2 : post.fileName1;
    const origName = fileNo === 2 ? post.origName2 : post.origName1;

    if (!rawFileName) {
      return NextResponse.json({ message: "첨부파일 없음" }, { status: 404 });
    }

    const fileName = rawFileName.replace(/\\/g, "/"); // 윈도우 경로 정규화
    if (
      fileName.includes("..") ||
      path.isAbsolute(fileName) ||
      /^[a-zA-Z]:[\\/]/.test(fileName) ||
      fileName.startsWith("\\\\")
    ) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    const cwd = process.cwd();
    const dataRoot = path.resolve(cwd, "data");

    // 후보 경로 — boardId 는 URL 기준. DB 의 경로와 다를 수 있으므로 양쪽 모두 시도.
    const dbSlugMatch = fileName.match(/^data\/([^/]+)\//);
    const dbSlug = dbSlugMatch ? dbSlugMatch[1] : null;
    const basename = fileName.split("/").pop() || fileName;

    const candidates: string[] = [];
    const push = (rel: string) => {
      const abs = path.resolve(cwd, rel);
      if (!abs.startsWith(dataRoot + path.sep) && abs !== dataRoot) return;
      if (!candidates.includes(abs)) candidates.push(abs);
    };
    // 1) 저장된 그대로
    if (fileName.startsWith("data/")) push(fileName);
    // 2) boardId 슬러그 기준 data/<boardId>/<basename>
    push(`data/${boardId}/${basename}`);
    // 3) DB 에 박힌 슬러그 기준 (있으면)
    if (dbSlug && dbSlug !== boardId) push(`data/${dbSlug}/${basename}`);
    // 4) data/<basename> (단일 폴더 저장 케이스)
    push(`data/${basename}`);
    // 5) 제로보드 원본 구조 file/<slug>/<basename>
    push(`data/file/${boardId}/${basename}`);

    let found: string | null = null;
    for (const abs of candidates) {
      try {
        const s = await stat(abs);
        if (s.isFile()) {
          found = abs;
          break;
        }
      } catch {
        /* 다음 후보 */
      }
    }

    if (!found) {
      console.warn(
        `[download 404] postId=${postId} fileNo=${fileNo} fileName=${rawFileName} 시도한 경로:`,
        candidates
      );
      return NextResponse.json(
        {
          message: "파일을 찾을 수 없습니다.",
          fileName: rawFileName,
          tried: candidates.map((c) => c.replace(cwd, "")),
        },
        { status: 404 }
      );
    }

    const fileBuffer = await readFile(found);

    // 다운로드 카운트 증가
    if (fileNo === 2) {
      await prisma.$executeRaw`UPDATE posts SET download2 = download2 + 1 WHERE id = ${postId}`;
    } else {
      await prisma.$executeRaw`UPDATE posts SET download1 = download1 + 1 WHERE id = ${postId}`;
    }

    const displayName = origName || path.basename(found);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(displayName)}`,
        "Content-Length": String(fileBuffer.length),
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
