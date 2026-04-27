import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { createWriteStream } from "fs";
import busboy from "busboy";
import { getSession } from "@/lib/uploadSession";

// POST /api/board/media-upload/chunk
// FormData: { uploadId, chunkIndex, file }
// 응답: { received, expected }
//
// 청크 단위 업로드. file part 는 그대로 디스크 임시 파일에 append.
// 클라이언트가 chunk 별로 retry 가능 — 같은 chunkIndex 재전송 시 append 되니
// 클라이언트가 받은 received 와 자기가 보낸 byte 비교해 일치 확인 권장.
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data")) {
    return NextResponse.json(
      { message: "multipart/form-data 만 허용됩니다." },
      { status: 400 }
    );
  }
  if (!request.body) {
    return NextResponse.json({ message: "본문이 없습니다." }, { status: 400 });
  }

  return new Promise<NextResponse>((resolve) => {
    let resolved = false;
    const respond = (r: NextResponse) => {
      if (!resolved) {
        resolved = true;
        resolve(r);
      }
    };

    const fields: Record<string, string> = {};
    let fileFound = false;

    const bb = busboy({ headers: { "content-type": contentType } });

    bb.on("field", (name, val) => {
      fields[name] = val;
    });

    bb.on("file", (_name, fileStream) => {
      fileFound = true;

      const uploadId = fields.uploadId || "";
      if (!uploadId) {
        fileStream.resume();
        return respond(
          NextResponse.json({ message: "uploadId 가 필요합니다." }, { status: 400 })
        );
      }
      const sess = getSession(uploadId);
      if (!sess) {
        fileStream.resume();
        return respond(
          NextResponse.json({ message: "세션을 찾을 수 없습니다 (만료됐을 수 있음)." }, { status: 404 })
        );
      }

      const writeStream = createWriteStream(sess.tmpPath, { flags: "a" });
      let chunkBytes = 0;
      fileStream.on("data", (c: Buffer) => {
        chunkBytes += c.length;
      });
      writeStream.on("error", (err) => {
        respond(
          NextResponse.json({ message: `디스크 쓰기 실패: ${err.message}` }, { status: 500 })
        );
      });
      writeStream.on("finish", () => {
        sess.receivedBytes += chunkBytes;
        respond(
          NextResponse.json({
            received: sess.receivedBytes,
            expected: sess.expectedSize,
            chunkBytes,
          })
        );
      });
      fileStream.on("error", (err) => {
        writeStream.destroy();
        respond(
          NextResponse.json({ message: `청크 전송 오류: ${err.message}` }, { status: 500 })
        );
      });
      fileStream.pipe(writeStream);
    });

    bb.on("error", (err) => {
      respond(
        NextResponse.json(
          { message: `multipart 파싱 오류: ${err instanceof Error ? err.message : String(err)}` },
          { status: 500 }
        )
      );
    });

    bb.on("close", () => {
      if (!fileFound && !resolved) {
        respond(NextResponse.json({ message: "file 필드가 없습니다." }, { status: 400 }));
      }
    });

    Readable.fromWeb(request.body as unknown as Parameters<typeof Readable.fromWeb>[0])
      .on("error", (err) =>
        respond(
          NextResponse.json(
            { message: `요청 본문 오류: ${err instanceof Error ? err.message : String(err)}` },
            { status: 500 }
          )
        )
      )
      .pipe(bb);
  });
}
