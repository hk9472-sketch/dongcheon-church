import { NextRequest, NextResponse } from "next/server";
import { mkdir, unlink } from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { spawn, execFile, type ChildProcess } from "child_process";
import { Readable } from "stream";
import busboy from "busboy";
import prisma from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getUploadDir, getRelUploadPath } from "@/lib/uploadPath";

// 끊긴 업로드의 NAS 부분 파일 best-effort 삭제. 실패해도 무시 (이미 없을 수도).
function cleanupRemoteBestEffort(
  remoteRel: string,
  cfg: { host: string; port: string; user: string; password: string; remoteRoot: string }
): void {
  const remoteUrl = `ftp://${cfg.host}:${cfg.port}${cfg.remoteRoot}/${remoteRel}`;
  // FTP DELE 는 curl 에서 -Q "DELE filename" + 디렉터리 URL 형태가 표준.
  // 단순화 위해 curl --request "DELE filename" url 로 처리.
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
    () => { /* 결과 무시 */ }
  );
}

// ────────────────────────────────────────────────────────────
// POST /api/board/media-upload  (busboy 기반 streaming)
// 사용자 → 서버에서 byte 가 들어오는 즉시 NAS(또는 로컬) 로 pipe.
// 결과: 사용자→서버 단계와 서버→NAS 단계가 동시 진행 → 시간 max(N, M).
//
// nginx 측 사전 설정 필수:
//   proxy_request_buffering off;
//   proxy_http_version 1.1;
// 없으면 nginx 가 request body 를 fully buffer 후 보내 streaming 효과 사라짐.
// ────────────────────────────────────────────────────────────
type UploadMode = "general" | "realtime";

const VIDEO_EXT = new Set([".mp4", ".webm", ".ogv", ".m4v", ".mov"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"]);
const MAX_SIZE = 1000 * 1024 * 1024; // 1000MB

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

function sanitizeStoredName(name: string): string {
  const cleaned = name
    .replace(/[\\/]+/g, "_")
    .replace(/\.\.+/g, ".")
    .replace(/[\x00-\x1f]/g, "")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || `media_${Date.now()}`;
}

function parseDateBase(s: string): { yyyy: string; mm: string } | null {
  const m = s.match(/^(\d{4})-(\d{1,2})-\d{1,2}$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12) return null;
  return { yyyy: String(y), mm: String(mo).padStart(2, "0") };
}

function extractYearMonthFromName(filename: string): { yyyy: string; mm: string } | null {
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

export async function POST(request: NextRequest) {
  // Rate limit
  const ip = getClientIp(request);
  const rl = checkRateLimit(`media-upload:${ip}`, 30, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { message: "미디어 업로드 요청이 너무 많습니다." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } }
    );
  }

  if (!request.body) {
    return NextResponse.json({ message: "요청 본문이 없습니다." }, { status: 400 });
  }
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data")) {
    return NextResponse.json({ message: "multipart/form-data 만 허용됩니다." }, { status: 400 });
  }

  return new Promise<NextResponse>((resolve) => {
    let resolved = false;
    const respond = (resp: NextResponse) => {
      if (!resolved) {
        resolved = true;
        resolve(resp);
      }
    };

    const fields: Record<string, string> = {};
    let totalReceived = 0;
    let fileFound = false; // file 이벤트가 발생했는지 추적 (close 보다 먼저 file 이 fire 보장 X)

    const bb = busboy({
      headers: { "content-type": contentType },
      limits: { fileSize: MAX_SIZE },
    });

    bb.on("field", (name, val) => {
      fields[name] = val;
    });

    bb.on("file", async (fieldname, fileStream, info) => {
      fileFound = true;
      if (resolved) {
        fileStream.resume();
        return;
      }
      if (fieldname !== "file") {
        fileStream.resume();
        return respond(NextResponse.json({ message: "잘못된 필드명" }, { status: 400 }));
      }

      // ─── 메타 검증 ───
      const filename = (info.filename || "").trim();
      const ext = path.extname(filename).toLowerCase();
      const isVideo = VIDEO_EXT.has(ext);
      const isAudio = AUDIO_EXT.has(ext);
      if (!isVideo && !isAudio) {
        fileStream.resume();
        return respond(
          NextResponse.json({ message: `허용되지 않는 미디어 형식: ${ext}` }, { status: 400 })
        );
      }

      const boardSlug = (fields.boardSlug || "").trim();
      const modeRaw = (fields.mode || "general").trim();
      const mode: UploadMode = modeRaw === "realtime" ? "realtime" : "general";
      if (!boardSlug) {
        fileStream.resume();
        return respond(NextResponse.json({ message: "boardSlug 는 필수입니다." }, { status: 400 }));
      }
      if (!/^[A-Za-z0-9_-]+$/.test(boardSlug)) {
        fileStream.resume();
        return respond(NextResponse.json({ message: "잘못된 boardSlug" }, { status: 400 }));
      }

      // ─── 게시판 + 사용자 권한 ───
      const board = await prisma.board.findUnique({ where: { slug: boardSlug } });
      if (!board) {
        fileStream.resume();
        return respond(NextResponse.json({ message: "게시판이 존재하지 않습니다." }, { status: 404 }));
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
        fileStream.resume();
        return respond(
          NextResponse.json({ message: "미디어 업로드 권한이 없습니다." }, { status: 403 })
        );
      }

      // ─── 폴더 결정 ───
      const dateBaseRaw = (fields.dateBase || "").trim();
      const fromDateBase = parseDateBase(dateBaseRaw);
      const fromName = extractYearMonthFromName(filename);
      const now = new Date();
      const yyyy = fromDateBase?.yyyy ?? fromName?.yyyy ?? String(now.getFullYear());
      const mm = fromDateBase?.mm ?? fromName?.mm ?? String(now.getMonth() + 1).padStart(2, "0");

      const rand = randomBytes(4).toString("hex");
      const storedName = sanitizeStoredName(`${Date.now()}_${rand}${ext}`);

      // ─── 파일 크기 초과 감지 ───
      fileStream.on("data", (chunk: Buffer) => {
        totalReceived += chunk.length;
      });
      fileStream.on("limit", () => {
        respond(
          NextResponse.json(
            { message: `파일 크기가 ${Math.floor(MAX_SIZE / 1024 / 1024)}MB 를 초과합니다.` },
            { status: 400 }
          )
        );
      });

      const ftp = await getFtpConfig(mode);
      if (ftp) {
        // ─── FTP streaming pass-through ───
        // 폴더 패턴:
        //   realtime (다시보기, 예배자료) → {root}/{YYYY}/{MM}/<파일>
        //   general  (일반 참고자료)      → {root}/files/{boardSlug}/{YYYY}/{MM}/<파일>
        const remoteRel =
          mode === "realtime"
            ? `${yyyy}/${mm}/${storedName}`
            : `files/${boardSlug}/${yyyy}/${mm}/${storedName}`;
        const remoteUrl = `ftp://${ftp.host}:${ftp.port}${ftp.remoteRoot}/${remoteRel}`;
        const child: ChildProcess = spawn("curl", [
          "-T", "-",
          remoteUrl,
          "--user", `${ftp.user}:${ftp.password}`,
          "--ftp-create-dirs",
          "--connect-timeout", "30",
          "--max-time", "1800",
          "-s", "-S",
        ]);
        let stderr = "";
        let succeeded = false;
        child.stderr?.on("data", (c) => { stderr += c.toString(); });
        child.on("error", (err) => {
          // spawn 자체 실패 — NAS 에 아무것도 못 갔을 가능성. 정리 시도.
          cleanupRemoteBestEffort(remoteRel, ftp);
          respond(NextResponse.json({ message: `FTP 업로드 오류: ${err.message}` }, { status: 500 }));
        });
        child.on("close", (code) => {
          if (code === 0) {
            succeeded = true;
            const publicUrl = `${ftp.publicBase}${remoteRel}`;
            respond(
              NextResponse.json({
                url: publicUrl,
                kind: isVideo ? "video" : "audio",
                size: totalReceived,
                name: storedName,
                remote: true,
              })
            );
          } else {
            // 부분 파일 NAS 에 남았을 수 있음 — 삭제 시도.
            cleanupRemoteBestEffort(remoteRel, ftp);
            respond(
              NextResponse.json(
                { message: `FTP 업로드 실패: ${stderr || `curl exit ${code}`}` },
                { status: 500 }
              )
            );
          }
        });
        fileStream.on("error", (err) => {
          child.kill("SIGTERM");
          if (!succeeded) cleanupRemoteBestEffort(remoteRel, ftp);
          respond(NextResponse.json({ message: err.message }, { status: 500 }));
        });
        // 클라이언트 끊김 → request body close → busboy 가 file stream 종료를
        // 정상 'end' 처럼 emit. 이 경우 byte 가 모자라면 서버는 부분 파일 알 수 없음.
        // 보호: file stream 종료 시점에 totalReceived 가 Content-Length 와 다른지 추후
        // 검증 가능. 지금은 정상 'close' 후 totalReceived 검증 생략 (curl exit 0 이면
        // NAS 에 partial 이라도 그대로 정상 응답으로 마무리됨).
        if (child.stdin) {
          fileStream.pipe(child.stdin);
        } else {
          respond(NextResponse.json({ message: "curl stdin 사용 불가" }, { status: 500 }));
        }
      } else {
        // ─── 로컬 저장 streaming ───
        const subPath =
          mode === "realtime"
            ? `realtime/${yyyy}/${mm}`
            : `files/${boardSlug}/${yyyy}/${mm}`;
        const dir = getUploadDir(subPath);
        await mkdir(dir, { recursive: true });
        const fullPath = path.join(dir, storedName);
        const writeStream = createWriteStream(fullPath);
        let succeeded = false;
        writeStream.on("error", (err) => {
          unlink(fullPath).catch(() => {}); // 부분 파일 정리
          respond(NextResponse.json({ message: err.message }, { status: 500 }));
        });
        writeStream.on("finish", () => {
          succeeded = true;
          const rel = getRelUploadPath(subPath, storedName);
          const url = `/api/board/media?path=${encodeURIComponent(rel)}`;
          respond(
            NextResponse.json({
              url,
              kind: isVideo ? "video" : "audio",
              size: totalReceived,
              name: storedName,
            })
          );
        });
        fileStream.on("error", (err) => {
          writeStream.destroy();
          if (!succeeded) unlink(fullPath).catch(() => {});
          respond(NextResponse.json({ message: err.message }, { status: 500 }));
        });
        fileStream.pipe(writeStream);
      }
    });

    bb.on("error", (err) => {
      respond(
        NextResponse.json(
          { message: `업로드 처리 오류: ${err instanceof Error ? err.message : String(err)}` },
          { status: 500 }
        )
      );
    });

    bb.on("close", () => {
      // file 이벤트가 한 번도 안 일어났으면 진짜 file 필드 없음.
      // file 이벤트가 발생했으면 그 핸들러의 비동기 처리가 끝나면서 응답하므로
      // close 시점엔 응답 강제하지 않음 (false-positive 방지).
      if (!fileFound && !resolved) {
        respond(NextResponse.json({ message: "file 필드가 없습니다." }, { status: 400 }));
      }
    });

    // request body (Web ReadableStream) → Node Readable → busboy
    Readable.fromWeb(request.body as unknown as Parameters<typeof Readable.fromWeb>[0])
      .on("error", (err) => {
        respond(
          NextResponse.json(
            { message: `요청 본문 오류: ${err instanceof Error ? err.message : String(err)}` },
            { status: 500 }
          )
        );
      })
      .pipe(bb);
  });
}
