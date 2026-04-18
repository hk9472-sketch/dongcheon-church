import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getUploadDir, getRelUploadPath } from "@/lib/uploadPath";

// ────────────────────────────────────────────────────────────
// POST /api/board/image-upload
// FormData: file (이미지), boardSlug
//
// 본문 에디터(TipTap) 의 붙여넣기/드래그드롭/파일선택 로부터 호출.
// 저장 위치: {UPLOAD_DIR}/{boardSlug}/inline/{YYYYMMDD}/{timestamp}_{rand}.ext
// 반환:      { url: "/api/board/image?path=<relative>" }
//
// 보안
// - 해당 게시판의 grantWrite 기준으로 접근 제어 (비회원 허용 게시판은 비로그인 OK)
// - Rate limit: IP 당 60개/10분 (연속 붙여넣기 과다 업로드 차단)
// - 허용 확장자: jpg/jpeg/png/gif/webp, 최대 100MB
// ────────────────────────────────────────────────────────────
const ALLOWED = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const MAX_SIZE = 100 * 1024 * 1024;

function sanitizeStoredName(name: string): string {
  return name.replace(/[\\/]+/g, "_").replace(/\.\.+/g, ".").replace(/[^A-Za-z0-9_.]/g, "_");
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit
    const ip = getClientIp(request);
    const rl = checkRateLimit(`img-upload:${ip}`, 60, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { message: "이미지 업로드 요청이 너무 많습니다." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const boardSlug = ((formData.get("boardSlug") as string) || "").trim();

    if (!file || !boardSlug) {
      return NextResponse.json({ message: "file, boardSlug 는 필수입니다." }, { status: 400 });
    }
    if (!/^[A-Za-z0-9_-]+$/.test(boardSlug)) {
      return NextResponse.json({ message: "잘못된 boardSlug" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { message: `이미지 크기가 ${Math.floor(MAX_SIZE / 1024 / 1024)}MB 를 초과합니다.` },
        { status: 400 }
      );
    }
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED.has(ext)) {
      return NextResponse.json({ message: `허용되지 않는 이미지 형식: ${ext}` }, { status: 400 });
    }

    // 게시판 조회 + 쓰기 권한 체크 (write route 와 동일 규칙)
    const board = await prisma.board.findUnique({ where: { slug: boardSlug } });
    if (!board) {
      return NextResponse.json({ message: "게시판이 존재하지 않습니다." }, { status: 404 });
    }

    // 세션 확인 (비로그인도 grantWrite=99 게시판이면 허용)
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
      return NextResponse.json({ message: "이미지 업로드 권한이 없습니다." }, { status: 403 });
    }

    // 저장
    const now = new Date();
    const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const subPath = `${boardSlug}/inline/${yyyymmdd}`;
    const dir = getUploadDir(subPath);
    await mkdir(dir, { recursive: true });

    const rand = randomBytes(4).toString("hex");
    const storedName = sanitizeStoredName(`${Date.now()}_${rand}${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, storedName), buffer);

    // 상대 경로 (download 처럼 UPLOAD_DIR prefix 가 포함된 형태)
    const rel = getRelUploadPath(subPath, storedName);
    const url = `/api/board/image?path=${encodeURIComponent(rel)}`;
    return NextResponse.json({ url, size: file.size, name: storedName });
  } catch (e) {
    console.error("image-upload error:", e);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
