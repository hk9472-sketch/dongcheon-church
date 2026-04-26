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
type UploadMode = "general" | "realtime";

// FTP 원격 경로 정규화 — 사용자가 "publist/HDD1" 처럼 leading "/" 없이
// 입력해도 정상 URL 이 되도록. trailing "/" 는 제거 (조립 시 또 붙음).
function normalizeFtpRoot(p: string): string {
  let s = (p || "").trim();
  s = s.replace(/\/+$/g, "");
  if (!s) return "/";
  if (!s.startsWith("/")) s = "/" + s;
  return s;
}

async function getFtpConfig(mode: UploadMode): Promise<{
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
    "media_ftp_remote_root_realtime",
    "media_base_url",
  ];
  const rows = await prisma.siteSetting.findMany({ where: { key: { in: keys } } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value || "";
  if (map.media_ftp_enabled !== "1") return null;
  if (!map.media_ftp_host || !map.media_ftp_user || !map.media_ftp_password) return null;
  if (!map.media_base_url) return null;

  const rootGeneral = normalizeFtpRoot(map.media_ftp_remote_root || "/");
  const rootRealtime = normalizeFtpRoot(map.media_ftp_remote_root_realtime || rootGeneral);
  const picked = mode === "realtime" ? rootRealtime : rootGeneral;
  return {
    host: map.media_ftp_host,
    port: map.media_ftp_port || "21",
    user: map.media_ftp_user,
    password: map.media_ftp_password,
    remoteRoot: picked,
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
// - 최대 1000MB
// ────────────────────────────────────────────────────────────
const VIDEO_EXT = new Set([".mp4", ".webm", ".ogv", ".m4v", ".mov"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"]);
const MAX_SIZE = 1000 * 1024 * 1024; // 1000MB

// 파일명 안전화 — 원본 이름 보존 (한국어 등 비-ASCII 허용).
// path traversal/제어문자/hidden 파일만 차단.
function sanitizeStoredName(name: string): string {
  const cleaned = name
    .replace(/[\\/]+/g, "_")        // path separator 차단
    .replace(/\.\.+/g, ".")          // 연속 점 (.. path traversal)
    .replace(/[\x00-\x1f]/g, "")     // 제어문자
    .replace(/^\.+/, "")             // 앞 점 (hidden 파일 방지)
    .trim();
  return cleaned || `media_${Date.now()}`;
}

// dateBase (사용자가 직접 입력한 기준일자 "YYYY-MM-DD") → 연/월.
// 형식 안 맞거나 유효하지 않으면 null.
function parseDateBase(s: string): { yyyy: string; mm: string } | null {
  const m = s.match(/^(\d{4})-(\d{1,2})-\d{1,2}$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12) return null;
  return { yyyy: String(y), mm: String(mo).padStart(2, "0") };
}

// 파일 이름에서 연/월 추출.
// 지원 패턴 (파일명 어디든 매칭, 처음 발견된 것 사용):
//   YYYYMMDD       (예: 20260425_video.mp4 → 2026/04)
//   YYYY[-_./]MM[-_./]DD (예: 2026-04-25.mp4 → 2026/04)
//   YYMMDD         (예: 260425-토새.mp3 → 2026/04, 991231-old.mp3 → 1999/12)
// 추출 실패 시 null 반환 (호출자가 현재 시간 fallback 사용).
function extractYearMonthFromName(filename: string): { yyyy: string; mm: string } | null {
  const base = filename.replace(/\.[^.]+$/, ""); // 확장자 제거

  const isValid = (y: number, m: number) =>
    y >= 1990 && y <= 2100 && m >= 1 && m <= 12;

  // 1) YYYY[구분자]MM[구분자]DD
  let m = base.match(/(\d{4})[-_.\/](\d{1,2})[-_.\/](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    if (isValid(y, mo)) return { yyyy: String(y), mm: String(mo).padStart(2, "0") };
  }

  // 2) YYYYMMDD (8자리 숫자)
  m = base.match(/(\d{4})(\d{2})(\d{2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    if (isValid(y, mo)) return { yyyy: String(y), mm: m[2] };
  }

  // 3) YYMMDD (6자리 숫자) — 50 이상이면 19xx, 미만이면 20xx
  m = base.match(/(?:^|[^\d])(\d{2})(\d{2})(\d{2})(?!\d)/);
  if (m) {
    const yy = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    if (mo >= 1 && mo <= 12) {
      const yyyy = yy >= 50 ? `19${m[1]}` : `20${m[1]}`;
      return { yyyy, mm: m[2] };
    }
  }

  return null;
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
    const modeRaw = ((formData.get("mode") as string) || "general").trim();
    const mode: UploadMode = modeRaw === "realtime" ? "realtime" : "general";

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

    // 폴더 결정 우선순위:
    //   1. dateBase formData (사용자가 통합 모달에서 직접 선택한 기준일자)
    //   2. 파일명에서 날짜 추출 (예: "260425-토새.mp3" → 2026/04)
    //   3. 오늘 날짜
    // 폴더가 없으면 mkdir -p / --ftp-create-dirs 가 자동 생성.
    const dateBaseRaw = ((formData.get("dateBase") as string) || "").trim();
    const fromDateBase = parseDateBase(dateBaseRaw);
    const fromName = extractYearMonthFromName(file.name);
    const now = new Date();
    const yyyy = fromDateBase?.yyyy ?? fromName?.yyyy ?? String(now.getFullYear());
    const mm = fromDateBase?.mm ?? fromName?.mm ?? String(now.getMonth() + 1).padStart(2, "0");
    const rand = randomBytes(4).toString("hex");
    // 원본 파일명 그대로 사용 (한글 포함). 동일 이름 충돌 시 덮어씀.
    const storedName = sanitizeStoredName(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());

    // 원격 FTP 설정이 있으면 FTP 업로드 → 공개 URL 반환.
    // 모드별 경로 패턴 (월별 폴더):
    //   general  → {remoteRoot}/{boardSlug}/{YYYY}/{MM}/{파일명}
    //   realtime → {remoteRoot}/{YYYY}/{MM}/{파일명}
    const ftp = await getFtpConfig(mode);
    if (ftp) {
      const remoteRel =
        mode === "realtime"
          ? `${yyyy}/${mm}/${storedName}`
          : `${boardSlug}/${yyyy}/${mm}/${storedName}`;
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

    // 로컬 저장 (기존 동작) — 월별 폴더
    const subPath = `${boardSlug}/inline/${yyyy}/${mm}`;
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
