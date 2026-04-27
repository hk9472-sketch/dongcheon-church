import path from "path";
import { execFile } from "child_process";
import prisma from "@/lib/db";

// ────────────────────────────────────────────────────────────
// 미디어 업로드 공통 helper — chunked endpoint (init/chunk/finalize) 가 공유.
// ────────────────────────────────────────────────────────────

export type UploadMode = "general" | "realtime";

export const VIDEO_EXT = new Set([".mp4", ".webm", ".ogv", ".m4v", ".mov"]);
export const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"]);
export const MAX_SIZE = 1000 * 1024 * 1024; // 1000MB
export const CHUNK_SIZE = 5 * 1024 * 1024;  // 5MB

export interface FtpCfg {
  host: string;
  port: string;
  user: string;
  password: string;
  remoteRoot: string;
  publicBase: string;
}

function normalizeFtpRoot(p: string): string {
  let s = (p || "").trim().replace(/\/+$/g, "");
  if (!s) return "/";
  if (!s.startsWith("/")) s = "/" + s;
  return s;
}

export async function getFtpConfig(mode: UploadMode): Promise<FtpCfg | null> {
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

// 파일명 안전화 — 한국어 등 비-ASCII 허용. path traversal/제어문자/hidden 만 차단.
export function sanitizeStoredName(name: string): string {
  const cleaned = name
    .replace(/[\\/]+/g, "_")
    .replace(/\.\.+/g, ".")
    .replace(/[\x00-\x1f]/g, "")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || `media_${Date.now()}`;
}

export function parseDateBase(s: string): { yyyy: string; mm: string } | null {
  const m = (s || "").match(/^(\d{4})-(\d{1,2})-\d{1,2}$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12) return null;
  return { yyyy: String(y), mm: String(mo).padStart(2, "0") };
}

export function extractYearMonthFromName(filename: string): { yyyy: string; mm: string } | null {
  const base = filename.replace(/\.[^.]+$/, "");
  const isValid = (y: number, m: number) => y >= 1990 && y <= 2100 && m >= 1 && m <= 12;
  let m = base.match(/(\d{4})[-_.\/](\d{1,2})[-_.\/](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    if (isValid(y, mo)) return { yyyy: String(y), mm: String(mo).padStart(2, "0") };
  }
  m = base.match(/(\d{4})(\d{2})(\d{2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    if (isValid(y, mo)) return { yyyy: String(y), mm: m[2] };
  }
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

export function getExtKind(filename: string): { ext: string; kind: "video" | "audio" | null } {
  const ext = path.extname(filename).toLowerCase();
  if (VIDEO_EXT.has(ext)) return { ext, kind: "video" };
  if (AUDIO_EXT.has(ext)) return { ext, kind: "audio" };
  return { ext, kind: null };
}

// 끊긴 업로드의 NAS 부분 파일 best-effort 삭제.
export function cleanupRemoteBestEffort(remoteRel: string, cfg: FtpCfg): void {
  const remoteUrl = `ftp://${cfg.host}:${cfg.port}${cfg.remoteRoot}/${remoteRel}`;
  const dirUrl = remoteUrl.substring(0, remoteUrl.lastIndexOf("/") + 1);
  const fileName = remoteUrl.substring(remoteUrl.lastIndexOf("/") + 1);
  execFile(
    "curl",
    [
      "-s",
      "--user", `${cfg.user}:${cfg.password}`,
      "--connect-timeout", "10",
      "--max-time", "30",
      "-Q", `DELE ${fileName}`,
      dirUrl,
    ],
    () => {}
  );
}

// FTP SIZE 명령으로 NAS 의 파일 크기 조회. 실패 시 -1.
export function getRemoteFileSize(remoteRel: string, cfg: FtpCfg): Promise<number> {
  const remoteUrl = `ftp://${cfg.host}:${cfg.port}${cfg.remoteRoot}/${remoteRel}`;
  return new Promise((resolve) => {
    execFile(
      "curl",
      [
        "-sI",
        "--user", `${cfg.user}:${cfg.password}`,
        "--connect-timeout", "10",
        "--max-time", "30",
        remoteUrl,
      ],
      { encoding: "utf8" },
      (_err, stdout) => {
        const m = (stdout || "").match(/Content-Length:\s*(\d+)/i);
        if (m) resolve(parseInt(m[1], 10));
        else resolve(-1);
      }
    );
  });
}
