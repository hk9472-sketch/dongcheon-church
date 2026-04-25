import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { execFileSync } from "child_process";

// GET /api/admin/backup/browse?path=
// FTP 백업 보관 NAS 의 디렉터리 리스팅. 관리자 전용.
// curl -l (LIST) 로 파일·디렉터리 메타 정보 받아서 파싱.

async function requireAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

async function getFtpSettings() {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: ["ftp_host", "ftp_port", "ftp_user", "ftp_password", "ftp_remote_path"] } },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    host: map.ftp_host || "",
    port: map.ftp_port || "21",
    user: map.ftp_user || "",
    password: map.ftp_password || "",
    remotePath: map.ftp_remote_path || "/",
  };
}

interface FtpEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string | null;
  raw: string;
}

// LIST 출력의 한 줄 파싱. 흔한 두 형식 지원:
// 1) Unix:    drwxr-xr-x 1 user group   1234 Apr 25 16:09 filename
// 2) Windows: 04-25-2026  04:09PM       <DIR>          filename
function parseListLine(line: string): FtpEntry | null {
  const l = line.trim();
  if (!l) return null;

  // Unix
  const unix = l.match(/^([d\-l])(?:[rwxst\-]{9}\.?)\s+\S+\s+\S+\s+\S+\s+(\d+)\s+(\S+\s+\S+\s+\S+)\s+(.+)$/);
  if (unix) {
    const [, type, sizeStr, modified, name] = unix;
    if (name === "." || name === "..") return null;
    return {
      name,
      isDir: type === "d",
      size: parseInt(sizeStr, 10),
      modified,
      raw: l,
    };
  }

  // Windows-like
  const win = l.match(/^(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2}(?:AM|PM)?)\s+(<DIR>|\d+)\s+(.+)$/i);
  if (win) {
    const [, date, time, sizeOrDir, name] = win;
    if (name === "." || name === "..") return null;
    const isDir = /<DIR>/i.test(sizeOrDir);
    return {
      name,
      isDir,
      size: isDir ? 0 : parseInt(sizeOrDir, 10),
      modified: `${date} ${time}`,
      raw: l,
    };
  }

  return null;
}

function normalizePath(p: string): string {
  let out = (p || "").trim();
  if (!out.startsWith("/")) out = "/" + out;
  // .. 차단 (path traversal)
  if (out.includes("..")) return "/";
  // 끝 슬래시 제거 (root 제외)
  if (out.length > 1 && out.endsWith("/")) out = out.replace(/\/+$/, "");
  return out;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const ftp = await getFtpSettings();
  if (!ftp.host || !ftp.user || !ftp.password) {
    return NextResponse.json({ error: "FTP 설정이 완료되지 않았습니다." }, { status: 400 });
  }

  const reqPath = normalizePath(request.nextUrl.searchParams.get("path") || ftp.remotePath);
  // remotePath 의 자식 경로만 허용 (보관함 외부 탐색 차단)
  const root = normalizePath(ftp.remotePath || "/");
  if (!reqPath.startsWith(root)) {
    return NextResponse.json({ error: "접근 가능한 경로가 아닙니다.", root }, { status: 403 });
  }

  // curl 로 FTP LIST. 디렉터리는 끝에 / 필수
  const url = `ftp://${ftp.host}:${ftp.port}${reqPath}/`;

  let raw = "";
  try {
    raw = execFileSync(
      "curl",
      ["-s", "-l", "--list-only", "--user", `${ftp.user}:${ftp.password}`, "--connect-timeout", "10", "--max-time", "30", url],
      { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `FTP 연결 실패: ${msg}` }, { status: 502 });
  }

  // --list-only 는 이름만 줘서 size/mtime 못 얻음. 메타 필요 시 -l 한 번 더.
  let detailedRaw = "";
  try {
    detailedRaw = execFileSync(
      "curl",
      ["-s", "--user", `${ftp.user}:${ftp.password}`, "--connect-timeout", "10", "--max-time", "30", url],
      { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 }
    );
  } catch {
    // 상세 실패해도 이름 목록은 반환
  }

  // 파싱: 상세 줄에서 entry 추출, 없으면 이름만
  const entries: FtpEntry[] = [];
  for (const line of detailedRaw.split(/\r?\n/)) {
    const parsed = parseListLine(line);
    if (parsed) entries.push(parsed);
  }
  if (entries.length === 0 && raw.trim()) {
    // 상세 파싱 실패 → 이름만
    for (const name of raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
      entries.push({ name, isDir: false, size: 0, modified: null, raw: name });
    }
  }

  // 폴더가 위로 가도록 정렬
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, "ko");
  });

  // 부모 경로
  const parent = reqPath === root || reqPath === "/" ? null : reqPath.split("/").slice(0, -1).join("/") || root;

  return NextResponse.json({
    path: reqPath,
    root,
    parent,
    entries,
  });
}
