import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

async function verifyAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires < new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function kstISOString() {
  const d = kstNow();
  return d.toISOString().replace("Z", "+09:00");
}

function kstDateStr() {
  const d = kstNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function kstDateTimeStr() {
  const d = kstNow();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
  return `${date}_${time}`;
}

function parseDatabaseUrl(url: string) {
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!m) return null;
  return { user: m[1], password: m[2], host: m[3], port: m[4], database: m[5] };
}

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await prisma.siteSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

async function getFtpSettings() {
  const keys = [
    "ftp_host", "ftp_port", "ftp_user", "ftp_password", "ftp_remote_path",
    "ftp_enabled", "ftp_schedule_hour", "ftp_schedule_minute", "ftp_backup_type",
    "ftp_keep_days",
  ];
  const settings: Record<string, string> = {};
  for (const key of keys) {
    settings[key] = (await getSetting(key)) ?? "";
  }
  return {
    host: settings.ftp_host,
    port: settings.ftp_port || "21",
    user: settings.ftp_user,
    password: settings.ftp_password,
    remotePath: settings.ftp_remote_path || "/backup/dongcheon",
    enabled: settings.ftp_enabled === "true",
    scheduleHour: settings.ftp_schedule_hour || "2",
    scheduleMinute: settings.ftp_schedule_minute || "0",
    backupType: settings.ftp_backup_type || "full",
    keepDays: settings.ftp_keep_days || "30",
  };
}

function uploadFileViaCurl(
  localPath: string,
  remoteFileName: string,
  ftp: { host: string; port: string; user: string; password: string; remotePath: string }
) {
  const remoteUrl = `ftp://${ftp.host}:${ftp.port}${ftp.remotePath}/${remoteFileName}`;
  const cmd = `curl -T "${localPath}" "${remoteUrl}" --user "${ftp.user}:${ftp.password}" --ftp-create-dirs --connect-timeout 30 --max-time 600 -s -S`;
  execSync(cmd, { maxBuffer: 10 * 1024 * 1024 });
}

function ensureTmpDir(): string {
  const tmpDir = path.join(process.cwd(), "data", "backup-tmp");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  return tmpDir;
}

function cleanupFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup errors
  }
}

// GET: return FTP settings + last backup info
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const ftp = await getFtpSettings();
  const lastBackup = await getSetting("ftp_last_backup");
  const lastResult = await getSetting("ftp_last_result");

  return NextResponse.json({
    host: ftp.host,
    port: ftp.port,
    user: ftp.user,
    password: ftp.password ? "********" : "",
    remotePath: ftp.remotePath,
    enabled: ftp.enabled,
    scheduleHour: ftp.scheduleHour,
    scheduleMinute: ftp.scheduleMinute,
    backupType: ftp.backupType,
    keepDays: ftp.keepDays,
    lastBackup,
    lastResult,
  });
}

// PUT: save FTP settings
export async function PUT(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = await request.json();
  const { host, port, user, password, remotePath, enabled, scheduleHour, scheduleMinute, backupType, keepDays } = body;

  await setSetting("ftp_host", host || "");
  await setSetting("ftp_port", String(port || "21"));
  await setSetting("ftp_user", user || "");
  if (password && password !== "********") {
    await setSetting("ftp_password", password);
  }
  await setSetting("ftp_remote_path", remotePath || "/backup/dongcheon");
  await setSetting("ftp_enabled", enabled ? "true" : "false");
  await setSetting("ftp_schedule_hour", String(scheduleHour ?? "2"));
  await setSetting("ftp_schedule_minute", String(scheduleMinute ?? "0"));
  await setSetting("ftp_backup_type", backupType || "full");
  await setSetting("ftp_keep_days", String(keepDays ?? "30"));

  return NextResponse.json({ message: "FTP 설정이 저장되었습니다." });
}

// POST: execute FTP backup
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = await request.json();
  const type: string = body.type || "full";
  const scheduled: boolean = body.scheduled === true; // cron 호출 여부

  const ftp = await getFtpSettings();

  // 정기 백업 호출인데 기능이 꺼져있으면 건너뜀
  if (scheduled && !ftp.enabled) {
    return NextResponse.json({ message: "FTP 백업이 비활성 상태입니다.", skipped: true });
  }

  if (!ftp.host || !ftp.user || !ftp.password) {
    return NextResponse.json(
      { message: "FTP 설정이 완료되지 않았습니다. 호스트, 사용자, 비밀번호를 확인해주세요." },
      { status: 400 }
    );
  }

  // Retrieve actual password (not masked)
  const actualPassword = await getSetting("ftp_password");
  if (!actualPassword) {
    return NextResponse.json({ message: "FTP 비밀번호가 설정되지 않았습니다." }, { status: 400 });
  }
  const ftpWithPassword = { ...ftp, password: actualPassword };

  const tmpDir = ensureTmpDir();
  const timestamp = kstDateTimeStr();
  const results: string[] = [];
  const filesToCleanup: string[] = [];

  try {
    // ─── DB backup ───
    if (type === "db" || type === "full") {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        return NextResponse.json({ message: "DATABASE_URL이 설정되지 않았습니다." }, { status: 500 });
      }
      const db = parseDatabaseUrl(dbUrl);
      if (!db) {
        return NextResponse.json({ message: "DATABASE_URL 형식을 파싱할 수 없습니다." }, { status: 500 });
      }

      const dumpFileName = `dongcheon-db-${timestamp}.sql`;
      const dumpFilePath = path.join(tmpDir, dumpFileName);

      try {
        const cmd = `mysqldump -h ${db.host} -P ${db.port} -u ${db.user} -p${db.password} ${db.database} --single-transaction --routines --triggers`;
        const dump = execSync(cmd, { maxBuffer: 100 * 1024 * 1024 });
        fs.writeFileSync(dumpFilePath, dump);
        filesToCleanup.push(dumpFilePath);

        uploadFileViaCurl(dumpFilePath, dumpFileName, ftpWithPassword);
        results.push(`DB 덤프 업로드 완료: ${dumpFileName}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`DB 백업 실패: ${msg}`);
      }
    }

    // ─── File backup ───
    if (type === "files" || type === "full") {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        results.push("첨부파일 백업 건너뜀: data 디렉토리 없음");
      } else {
        const lastBackupDate = await getSetting("ftp_last_backup");
        const sinceDate = lastBackupDate ? new Date(lastBackupDate) : new Date(0);

        let uploadedCount = 0;
        let errorCount = 0;

        // Scan data/ for modified files (excluding backup-tmp)
        const scanDir = (dir: string, relativeBase: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.posix.join(relativeBase, entry.name);

            if (entry.isDirectory()) {
              if (entry.name === "backup-tmp") continue;
              scanDir(fullPath, relativePath);
            } else if (entry.isFile()) {
              try {
                const stat = fs.statSync(fullPath);
                if (stat.mtime > sinceDate) {
                  const remoteFileName = `files/${kstDateStr()}/${relativePath}`;
                  uploadFileViaCurl(fullPath, remoteFileName, ftpWithPassword);
                  uploadedCount++;
                }
              } catch {
                errorCount++;
              }
            }
          }
        };

        scanDir(dataDir, "");

        if (errorCount > 0) {
          results.push(`첨부파일 업로드: ${uploadedCount}개 성공, ${errorCount}개 실패`);
        } else {
          results.push(`첨부파일 업로드 완료: ${uploadedCount}개 파일`);
        }
      }
    }

    // Save backup result
    const allSuccess = !results.some((r) => r.includes("실패"));
    const resultSummary = allSuccess
      ? `성공 - ${results.join("; ")}`
      : `일부 실패 - ${results.join("; ")}`;

    await setSetting("ftp_last_backup", kstISOString());
    await setSetting("ftp_last_result", resultSummary);

    return NextResponse.json({
      success: allSuccess,
      message: resultSummary,
      details: results,
      lastBackup: kstISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "FTP 백업 중 오류가 발생했습니다.";
    await setSetting("ftp_last_result", `실패 - ${msg}`);
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  } finally {
    // Cleanup temp files
    for (const f of filesToCleanup) {
      cleanupFile(f);
    }
  }
}
