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

    // 경로 분석 기반 후보 생성:
    // DB 값 예: "data/DcElement/1775430398/제15공과_부활의_권능_제안.hwp"
    // 이관 시 중간에 타임스탬프/ID 성격의 '숫자' 세그먼트가 끼어있는데
    // 실제 디스크는 flat 인 케이스가 많음. 숫자 세그먼트를 선별적으로 빼보며 시도.
    //
    // 규칙:
    //  1) 경로 분해 → data / <slug> / <중간...> / <basename>
    //  2) 원본 그대로 시도
    //  3) 중간 세그먼트 중 '숫자만' 으로 된 것들을 하나 이상 제거한 버전 시도
    //  4) 슬러그가 URL 의 boardId 와 다르면 boardId 로 치환한 버전도 시도
    //  5) 절대 상위(data/) 이탈 불가 — 최종 resolved 가 dataRoot 내부인지 검증
    const segments = fileName.split("/").filter(Boolean);
    const basename = segments[segments.length - 1] || fileName;
    // "data" 가 첫 세그먼트가 아니면 앞에 붙여서 상대경로로 정상화
    const normSegments = segments[0] === "data" ? segments : ["data", ...segments];
    const slug = normSegments[1] || boardId;
    const middle = normSegments.slice(2, -1); // data · slug 와 basename 사이
    // 중간 세그먼트 각각이 '숫자만' 인지 표시
    const middleIsNumeric = middle.map((s) => /^\d+$/.test(s));

    // 숫자 세그먼트들의 포함/제외 조합 (2^N 가지, 보통 1~2개라 비용 무시)
    const numericIndexes = middleIsNumeric
      .map((isNum, i) => (isNum ? i : -1))
      .filter((i) => i >= 0);
    const subsets: number[][] = [[]];
    for (const idx of numericIndexes) {
      const prev = subsets.map((s) => s.slice());
      subsets.push(...prev.map((s) => [...s, idx]));
    }

    const candidates: string[] = [];
    const tryPush = (segs: string[]) => {
      const rel = segs.join("/");
      const abs = path.resolve(cwd, rel);
      if (!abs.startsWith(dataRoot + path.sep) && abs !== dataRoot) return;
      if (!candidates.includes(abs)) candidates.push(abs);
    };

    // 각 부분집합: 해당 인덱스의 숫자 세그먼트를 '제외' 하고 경로 구성
    for (const skipIdxs of subsets) {
      const kept = middle.filter((_, i) => !skipIdxs.includes(i));
      // 원본 슬러그
      tryPush(["data", slug, ...kept, basename]);
      // URL boardId 로 치환한 버전 (DB slug 가 다를 때)
      if (slug !== boardId) tryPush(["data", boardId, ...kept, basename]);
    }

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
