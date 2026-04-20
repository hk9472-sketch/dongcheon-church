import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import os from "os";
import { randomBytes } from "crypto";
import { execFileSync } from "child_process";
import prisma from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getUploadDir, getRelUploadPath } from "@/lib/uploadPath";

// ────────────────────────────────────────────────────────────
// FTP 미디어 서버 지원 — 사이트 설정 media_ftp_* 키가 모두 설정돼 있으면
// 로컬 저장 대신 원격 FTP 로 업로드하고 media_base_url 을 결합한 공개 URL 반환.
// 없으면 기존 로컬 저장 동작.
// ────────────────────────────────────────────────────────────
async function getFtpConfig(): Promise<{
  host: string;
  port: string;
  user: string;
  password: string;
  remoteRoot: string;
  publicBase: string;
} | null> {
  const keys = [
    "media_ftp_enabled",
    "media_ftp_host",
    "media_ftp_port",
    "media_ftp_user",
    "media_ftp_password",
    "media_ftp_remote_root",
    "media_base_url",
  ];
  const rows = await prisma.siteSetting.findMany({ where: { key: { in: keys } } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value || "";
  if (map.media_ftp_enabled !== "1") return null; // 사용 안 함 토글
  if (!map.media_ftp_host || !map.media_ftp_user || !map.media_ftp_password) return null;
  if (!map.media_base_url) return null; // 공개 URL prefix 없으면 FTP 전송 의미 없음
  return {
    host: map.media_ftp_host,
    port: map.media_ftp_port || "21",
    user: map.media_ftp_user,
    password: map.media_ftp_password,
    remoteRoot: (map.media_ftp_remote_root || "/").replace(/\/+$/g, "") || "/",
    publicBase: map.media_base_url.replace(/\/+$/g, "") + "/",
  };
}

function uploadViaCurl(
  localPath: string,
  remoteRelPath: string,
  cfg: { host: string; port: string; user: string; password: string; remoteRoot: string }
) {
  const remoteUrl = `ftp://${cfg.host}:${cfg.port}${cfg.remoteRoot}/${remoteRelPath}`;
  const args = [
    "-T", localPath,
    remoteUrl,
    "--user", `${cfg.user}:${cfg.password}`,
    "--ftp-create-dirs",
    "--connect-timeout", "30",
    "--max-time", "600",
    "-s", "-S",
  ];
  execFileSync("curl", args, { maxBuffer: 10 * 1024 * 1024 });
}

// ────────────────────────────────────────────────────────────
// POST /api/board/media-upload
// FormData: file (mp4/mp3 등 동영상·음성), boardSlug
//
// TipTap 에디터의 미디어 업로드(파일선택/드래그앤드롭/붙여넣기)에서 호출.
// 저장 위치: {UPLOAD_DIR}/{boardSlug}/inline/{YYYYMMDD}/{timestamp}_{rand}.ext
// 반환:      { url: "/api/board/media?path=<relative>", kind: "video"|"audio" }
//
// 보안
// - 게시판 grantWrite 기준 권한 (image-upload 와 동일 규칙)
// - Rate limit: IP 당 30개/10분
// - 허용 확장자: mp4/webm/ogv/m4v/mov(video) · mp3/wav/ogg/m4a/aac/flac(audio)
// - 최대 100MB
// ────────────────────────────────────────────────────────────
const VIDEO_EXT = new Set([".mp4", ".webm", ".ogv", ".m4v", ".mov"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"]);
const MAX_SIZE = 100 * 1024 * 1024; // 100MB

function sanitizeStoredName(name: string): string {
  return name.replace(/[\\/]+/g, "_").replace(/\.\.+/g, ".").replace(/[^A-Za-z0-9_.]/g, "_");
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`media-upload:${ip}`, 30, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { message: "미디어 업로드 요청이 너무 많습니다." },
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
        { message: `파일 크기가 ${Math.floor(MAX_SIZE / 1024 / 1024)}MB 를 초과합니다.` },
        { status: 400 }
      );
    }
    const ext = path.extname(file.name).toLowerCase();
    const isVideo = VIDEO_EXT.has(ext);
    const isAudio = AUDIO_EXT.has(ext);
    if (!isVideo && !isAudio) {
      return NextResponse.json({ message: `허용되지 않는 미디어 형식: ${ext}` }, { status: 400 });
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

    const now = new Date();
    const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const rand = randomBytes(4).toString("hex");
    const storedName = sanitizeStoredName(`${Date.now()}_${rand}${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());

    // 원격 FTP 설정이 있으면 FTP 업로드 → 공개 URL 반환.
    const ftp = await getFtpConfig();
    if (ftp) {
      const remoteRel = `${boardSlug}/${yyyymmdd}/${storedName}`;
      const tmpPath = path.join(os.tmpdir(), `mup_${rand}${ext}`);
      try {
        await writeFile(tmpPath, buffer);
        uploadViaCurl(tmpPath, remoteRel, ftp);
      } catch (e) {
        return NextResponse.json(
          { message: `FTP 업로드 실패: ${e instanceof Error ? e.message : String(e)}` },
          { status: 500 }
        );
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
      const publicUrl = `${ftp.publicBase}${remoteRel}`;
      return NextResponse.json({
        url: publicUrl,
        kind: isVideo ? "video" : "audio",
        size: file.size,
        name: storedName,
        remote: true,
      });
    }

    // 로컬 저장 (기존 동작)
    const subPath = `${boardSlug}/inline/${yyyymmdd}`;
    const dir = getUploadDir(subPath);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, storedName), buffer);
    const rel = getRelUploadPath(subPath, storedName);
    const url = `/api/board/media?path=${encodeURIComponent(rel)}`;
    return NextResponse.json({ url, kind: isVideo ? "video" : "audio", size: file.size, name: storedName });
  } catch (e) {
    console.error("media-upload error:", e);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
