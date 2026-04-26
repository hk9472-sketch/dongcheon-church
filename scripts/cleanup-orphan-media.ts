/**
 * cleanup-orphan-media.ts
 *
 * NAS 의 미디어 파일 중 어떤 게시글에서도 참조하지 않는 orphan 파일 정리.
 * 업로드 중 끊겨서 NAS 에 남은 부분 파일이 누적될 때 회수.
 *
 * 사용:
 *   cd ~/pkistdc
 *   npx tsx scripts/cleanup-orphan-media.ts              # dry-run (목록만)
 *   npx tsx scripts/cleanup-orphan-media.ts --apply      # 실제 삭제
 *
 * 안전망:
 *   - 우리 업로드 형식 (`<timestamp>_<rand>.ext`) 만 대상.
 *     ZB 이관 등 다른 형식 파일은 절대 건드리지 않음.
 *   - 24시간 안에 생긴 파일은 skip (업로드 중일 수 있음).
 *   - 게시글(post.content) 안에서 미디어 URL 참조되면 보존.
 */

import { PrismaClient } from "@prisma/client";
import { execFileSync } from "child_process";

const prisma = new PrismaClient();

const SAFE_NAME_RE = /^(\d{13})_[a-f0-9]+\.(mp4|webm|ogv|m4v|mov|mp3|wav|ogg|m4a|aac|flac)$/i;
const FRESH_AGE_MS = 24 * 60 * 60 * 1000; // 24시간 — 이내 생성된 파일은 skip

function normalize(p: string): string {
  let s = (p || "").trim().replace(/\/+$/g, "");
  if (!s) return "/";
  if (!s.startsWith("/")) s = "/" + s;
  return s;
}

interface FtpCfg {
  host: string;
  port: string;
  user: string;
  password: string;
  rootGeneral: string;
  rootRealtime: string;
  publicBase: string;
}

async function getFtpSettings(): Promise<FtpCfg | null> {
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
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value || ""]));
  if (map.media_ftp_enabled !== "1") return null;
  if (!map.media_ftp_host || !map.media_ftp_user || !map.media_ftp_password) return null;
  if (!map.media_base_url) return null;
  return {
    host: map.media_ftp_host,
    port: map.media_ftp_port || "21",
    user: map.media_ftp_user,
    password: map.media_ftp_password,
    rootGeneral: normalize(map.media_ftp_remote_root || "/"),
    rootRealtime: normalize(map.media_ftp_remote_root_realtime || map.media_ftp_remote_root || "/"),
    publicBase: map.media_base_url.replace(/\/+$/g, "") + "/",
  };
}

interface NasFile {
  relPath: string; // root 기준 상대 경로 (예: "2026/05/<file>")
  size: number;
  rawLine: string;
}

// FTP 디렉터리 listing — Unix LIST 형식 가정.
async function listDir(cfg: FtpCfg, root: string, sub: string): Promise<NasFile[]> {
  const url = `ftp://${cfg.host}:${cfg.port}${root}/${sub}${sub.endsWith("/") ? "" : "/"}`.replace(/\/+/g, "/").replace(":/", "://");
  let raw = "";
  try {
    raw = execFileSync(
      "curl",
      [
        "-s",
        "--user", `${cfg.user}:${cfg.password}`,
        "--connect-timeout", "10",
        "--max-time", "60",
        url,
      ],
      { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }
    );
  } catch {
    return [];
  }

  const files: NasFile[] = [];
  const subdirs: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    // Unix LIST: drwxrwxrwx 1 owner group size Mon DD HH:MM name
    const m = l.match(/^([d\-l])\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$/);
    if (!m) continue;
    const [, type, sizeStr, name] = m;
    if (name === "." || name === "..") continue;
    const childPath = sub ? `${sub}/${name}` : name;
    if (type === "d") {
      subdirs.push(childPath);
    } else if (type === "-") {
      files.push({ relPath: childPath, size: parseInt(sizeStr, 10), rawLine: l });
    }
  }
  for (const d of subdirs) {
    const sub2 = await listDir(cfg, root, d);
    files.push(...sub2);
  }
  return files;
}

async function getUsedRelPaths(cfg: FtpCfg): Promise<Set<string>> {
  const posts = await prisma.post.findMany({
    where: { content: { contains: cfg.publicBase } },
    select: { content: true },
  });
  // base url 이후의 path 만 추출 (relPath 와 동일 형식이 되도록)
  const escaped = cfg.publicBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}([^\\s"'<>)]+)`, "g");
  const used = new Set<string>();
  for (const p of posts) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(p.content)) !== null) {
      try {
        used.add(decodeURIComponent(m[1]));
      } catch {
        used.add(m[1]);
      }
    }
  }
  return used;
}

function deleteRemote(cfg: FtpCfg, root: string, relPath: string): boolean {
  const segs = relPath.split("/");
  const fileName = segs.pop()!;
  const dirPart = segs.join("/");
  const dirUrl = `ftp://${cfg.host}:${cfg.port}${root}/${dirPart ? dirPart + "/" : ""}`.replace(/\/+/g, "/").replace(":/", "://");
  try {
    execFileSync(
      "curl",
      [
        "-s",
        "--user", `${cfg.user}:${cfg.password}`,
        "--connect-timeout", "10",
        "--max-time", "30",
        "-Q", `DELE ${fileName}`,
        dirUrl,
      ],
      { encoding: "utf8" }
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");

  const cfg = await getFtpSettings();
  if (!cfg) {
    console.error("FTP 설정이 없습니다 (media_ftp_enabled != 1 또는 필수값 누락).");
    process.exit(1);
  }

  console.log(`Mode      : ${apply ? "APPLY (실제 삭제)" : "DRY-RUN (목록만)"}`);
  console.log(`Public URL: ${cfg.publicBase}`);
  console.log(`Roots     : general=${cfg.rootGeneral}, realtime=${cfg.rootRealtime}`);

  const used = await getUsedRelPaths(cfg);
  console.log(`\n게시글에서 참조 중: ${used.size}개`);

  const now = Date.now();
  const cutoff = now - FRESH_AGE_MS;

  const targets = [
    { label: "general", root: cfg.rootGeneral },
    ...(cfg.rootRealtime !== cfg.rootGeneral ? [{ label: "realtime", root: cfg.rootRealtime }] : []),
  ];

  let totalOrphan = 0;
  let totalSize = 0;
  let totalDeleted = 0;
  let totalSkippedFresh = 0;
  let totalSkippedUnknown = 0;

  for (const { label, root } of targets) {
    console.log(`\n========= [${label}] ${root} =========`);
    const files = await listDir(cfg, root, "");
    console.log(`총 파일: ${files.length}개`);

    const orphans: NasFile[] = [];
    let usedCount = 0;

    for (const f of files) {
      const fileName = f.relPath.split("/").pop() || "";
      const m = fileName.match(SAFE_NAME_RE);
      if (!m) {
        // 우리 업로드 형식 아님 — 안전 위해 skip
        totalSkippedUnknown++;
        continue;
      }
      const ts = parseInt(m[1], 10);
      if (ts > cutoff) {
        // 24시간 안 — 업로드 중일 수도, skip
        totalSkippedFresh++;
        continue;
      }
      // relPath 는 root 안 상대 경로. publicBase + relPath 가 원래 URL.
      // used 에 들어있는 형식과 동일해야 매칭됨. publicBase + relPath 형태로 저장돼 있을 것.
      if (used.has(f.relPath)) {
        usedCount++;
      } else {
        orphans.push(f);
      }
    }

    console.log(`사용 중: ${usedCount}개 / orphan: ${orphans.length}개`);

    for (const o of orphans) {
      const sizeMB = (o.size / 1024 / 1024).toFixed(1);
      const tag = apply ? "[DELETE]" : "[would delete]";
      console.log(`  ${tag} ${o.relPath}  ${sizeMB}MB`);
      totalOrphan++;
      totalSize += o.size;
      if (apply) {
        if (deleteRemote(cfg, root, o.relPath)) {
          totalDeleted++;
        } else {
          console.log(`    └─ 삭제 실패`);
        }
      }
    }
  }

  console.log(`\n========= 요약 =========`);
  console.log(`Orphan 파일      : ${totalOrphan}개`);
  console.log(`회수 가능 용량    : ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`최근 24h skip    : ${totalSkippedFresh}개 (보호)`);
  console.log(`알 수 없는 형식 skip: ${totalSkippedUnknown}개 (보호 — ZB 이관 등)`);
  if (apply) {
    console.log(`실제 삭제 성공    : ${totalDeleted}개`);
  } else if (totalOrphan > 0) {
    console.log(`\n실제 삭제하려면 --apply 옵션:`);
    console.log(`  npx tsx scripts/cleanup-orphan-media.ts --apply`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
