import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createSession } from "@/lib/uploadSession";
import { CHUNK_SIZE, MAX_SIZE, getExtKind } from "@/lib/mediaUpload";

// POST /api/board/media-upload/init
// body: { fileName, expectedSize, boardSlug, mode, dateBase }
// 응답: { uploadId, chunkSize }
//
// chunked upload 의 시작점. 권한·크기·확장자 모두 여기서 검증 후
// 메모리 세션 생성 + 임시 디렉터리 준비.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`media-upload-init:${ip}`, 30, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { message: "업로드 시작 요청이 너무 많습니다." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const fileName = String(body?.fileName || "").trim();
  const expectedSize = Number(body?.expectedSize) || 0;
  const boardSlug = String(body?.boardSlug || "").trim();
  const modeRaw = String(body?.mode || "general").trim();
  const mode = modeRaw === "realtime" ? "realtime" : "general";
  const dateBase = String(body?.dateBase || "").trim();

  if (!fileName || !boardSlug || expectedSize <= 0) {
    return NextResponse.json(
      { message: "fileName, boardSlug, expectedSize 가 필요합니다." },
      { status: 400 }
    );
  }
  if (!/^[A-Za-z0-9_-]+$/.test(boardSlug)) {
    return NextResponse.json({ message: "잘못된 boardSlug" }, { status: 400 });
  }
  if (expectedSize > MAX_SIZE) {
    return NextResponse.json(
      { message: `파일 크기가 ${Math.floor(MAX_SIZE / 1024 / 1024)}MB 를 초과합니다.` },
      { status: 400 }
    );
  }
  const { ext, kind } = getExtKind(fileName);
  if (!kind) {
    return NextResponse.json(
      { message: `허용되지 않는 미디어 형식: ${ext}` },
      { status: 400 }
    );
  }

  const board = await prisma.board.findUnique({ where: { slug: boardSlug } });
  if (!board) {
    return NextResponse.json({ message: "게시판이 존재하지 않습니다." }, { status: 404 });
  }

  const sessionToken = request.cookies.get("dc_session")?.value;
  let userLevel = 99;
  let isAdminUser = false;
  if (sessionToken) {
    const session = await prisma.session.findUnique({ where: { sessionToken } });
    if (session && session.expires > new Date()) {
      const u = await prisma.user.findUnique({ where: { id: session.userId } });
      if (u) {
        userLevel = u.level;
        isAdminUser = u.isAdmin <= 2;
      }
    }
  }
  if (!isAdminUser && userLevel > board.grantWrite) {
    return NextResponse.json({ message: "미디어 업로드 권한이 없습니다." }, { status: 403 });
  }

  const sess = await createSession({
    fileName,
    expectedSize,
    boardSlug,
    mode,
    dateBase,
    ext,
    kind,
  });

  return NextResponse.json({
    uploadId: sess.uploadId,
    chunkSize: CHUNK_SIZE,
    expectedSize,
  });
}
