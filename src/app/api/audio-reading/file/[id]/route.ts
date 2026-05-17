import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "fs";
import path from "path";
import prisma from "@/lib/db";
import { getUploadRoot } from "@/lib/uploadPath";

/**
 * GET /api/audio-reading/file/:id
 * ReadingSession.audioPath 의 mp3 파일을 stream 으로 응답.
 * Range 요청 지원 — audio seek/시킹 정상 동작.
 *
 * 공개 GET (권한 체크 없음) — 청취는 모든 사용자에게 허용 가정.
 * 권한 제한 필요시 getCouncilUser 추가.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sid = parseInt(id, 10);
  if (!Number.isFinite(sid)) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const row = await prisma.readingSession.findUnique({
    where: { id: sid },
    select: { audioPath: true },
  });
  if (!row?.audioPath) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // audioPath = "data/audio-reading/xxxx.mp3" — uploadRoot 안의 상대경로로 변환
  const rel = row.audioPath.replace(/^data[\\/]/, "");
  const root = getUploadRoot();
  const abs = path.normalize([root, rel].join(path.sep));

  // 경로 escape 방지 — uploadRoot 밖이면 거부
  if (!abs.startsWith(root)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let stat;
  try {
    stat = statSync(abs);
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
  const total = stat.size;

  // Range 헤더 — audio seek 시 브라우저가 Range: bytes=N-M 보냄
  const range = req.headers.get("range");
  const baseHeaders: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };

  if (range) {
    const m = range.match(/^bytes=(\d+)-(\d+)?$/);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
      if (start <= end && start < total) {
        const chunkSize = end - start + 1;
        const stream = createReadStream(abs, { start, end });
        return new NextResponse(stream as unknown as ReadableStream, {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": String(chunkSize),
          },
        });
      }
    }
  }

  // 전체 응답
  const stream = createReadStream(abs);
  return new NextResponse(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(total),
    },
  });
}
