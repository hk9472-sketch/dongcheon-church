import { NextRequest, NextResponse } from "next/server";
import { stat, open } from "fs/promises";
import path from "path";
import { getUploadRoot } from "@/lib/uploadPath";

// GET /api/board/media?path=data/<board>/inline/.../xxx.mp4
// 본문 에디터 인라인 동영상/음성 serve.
// HTTP Range 요청을 지원해 동영상 시킹/탐색 가능.

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
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
      return NextResponse.json({ message: "지원하지 않는 미디어 형식" }, { status: 400 });
    }

    const st = await stat(abs);
    const total = st.size;
    const range = request.headers.get("range");

    // Range 요청 처리
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
        if (start <= end && start < total) {
          const fh = await open(abs, "r");
          const len = end - start + 1;
          const buf = Buffer.alloc(len);
          await fh.read(buf, 0, len, start);
          await fh.close();
          return new NextResponse(buf, {
            status: 206,
            headers: {
              "Content-Type": contentType,
              "Content-Length": String(len),
              "Content-Range": `bytes ${start}-${end}/${total}`,
              "Accept-Ranges": "bytes",
              "Cache-Control": "public, max-age=604800",
            },
          });
        }
      }
    }

    // 전체 파일
    const fh = await open(abs, "r");
    const buf = Buffer.alloc(total);
    await fh.read(buf, 0, total, 0);
    await fh.close();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=604800",
      },
    });
  } catch {
    return NextResponse.json({ message: "미디어를 찾을 수 없습니다." }, { status: 404 });
  }
}
