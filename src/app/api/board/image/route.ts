import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getUploadRoot } from "@/lib/uploadPath";

// GET /api/board/image?path=data/DcNotice/inline/20260418/xxx.png
// 본문 에디터 인라인 이미지 serve.
// path 는 UPLOAD_DIR(기본 "data") prefix 포함 상대경로. 업로드 루트 밖으로는
// 절대 나갈 수 없도록 path.resolve 로 정규화 후 prefix 검사.

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(request: NextRequest) {
  try {
    const rel = request.nextUrl.searchParams.get("path") || "";
    if (!rel || rel.includes("..") || path.isAbsolute(rel)) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    const abs = path.resolve(path.join(process.cwd(), rel));
    const root = getUploadRoot();
    if (!abs.startsWith(root + path.sep) && abs !== root) {
      return NextResponse.json({ message: "잘못된 경로" }, { status: 400 });
    }

    const ext = path.extname(abs).toLowerCase();
    const contentType = MIME[ext];
    if (!contentType) {
      return NextResponse.json({ message: "이미지 파일이 아닙니다." }, { status: 400 });
    }

    const buf = await readFile(abs);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800", // 7일 캐시
      },
    });
  } catch {
    return NextResponse.json({ message: "이미지를 찾을 수 없습니다." }, { status: 404 });
  }
}
