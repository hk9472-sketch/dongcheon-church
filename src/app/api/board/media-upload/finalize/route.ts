import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { stat, mkdir, copyFile } from "fs/promises";
import { randomBytes } from "crypto";
import path from "path";
import { getSession, deleteSession } from "@/lib/uploadSession";
import {
  cleanupRemoteBestEffort,
  getFtpConfig,
  getRemoteFileSize,
  parseDateBase,
  extractYearMonthFromName,
  sanitizeStoredName,
} from "@/lib/mediaUpload";
import { getUploadDir, getRelUploadPath } from "@/lib/uploadPath";

// POST /api/board/media-upload/finalize
// body: { uploadId }
// 동작:
//   1. 디스크 임시 파일 size === expectedSize 검증
//   2. NAS 로 curl -T file 모드 업로드 (FTP 활성 시)
//   3. NAS SIZE 검증
//   4. 응답에 public URL
//   5. 세션·임시 파일 정리
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const uploadId = String(body?.uploadId || "").trim();
  if (!uploadId) {
    return NextResponse.json({ message: "uploadId 가 필요합니다." }, { status: 400 });
  }

  const sess = getSession(uploadId);
  if (!sess) {
    return NextResponse.json(
      { message: "세션을 찾을 수 없습니다 (만료됐을 수 있음)." },
      { status: 404 }
    );
  }

  // 1. 디스크 파일 size 검증
  let tmpSize = 0;
  try {
    tmpSize = (await stat(sess.tmpPath)).size;
  } catch {
    await deleteSession(uploadId);
    return NextResponse.json({ message: "임시 파일 정보 조회 실패" }, { status: 500 });
  }
  if (tmpSize !== sess.expectedSize) {
    await deleteSession(uploadId);
    return NextResponse.json(
      {
        message: `byte 불일치 — 받은 ${tmpSize} / 예상 ${sess.expectedSize}. 다시 시도해 주세요.`,
      },
      { status: 500 }
    );
  }

  // 2. 폴더 + 파일명 결정
  const fromDateBase = parseDateBase(sess.dateBase);
  const fromName = extractYearMonthFromName(sess.fileName);
  const now = new Date();
  const yyyy = fromDateBase?.yyyy ?? fromName?.yyyy ?? String(now.getFullYear());
  const mm = fromDateBase?.mm ?? fromName?.mm ?? String(now.getMonth() + 1).padStart(2, "0");
  const rand = randomBytes(4).toString("hex");
  const storedName = sanitizeStoredName(`${Date.now()}_${rand}${sess.ext}`);

  // 3. NAS 또는 로컬 저장
  const ftp = await getFtpConfig(sess.mode);
  if (ftp) {
    const remoteRel =
      sess.mode === "realtime"
        ? `${yyyy}/${mm}/${storedName}`
        : `files/${sess.boardSlug}/${yyyy}/${mm}/${storedName}`;
    const remoteUrl = `ftp://${ftp.host}:${ftp.port}${ftp.remoteRoot}/${remoteRel}`;

    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const child = spawn("curl", [
        "-T", sess.tmpPath,
        remoteUrl,
        "--user", `${ftp.user}:${ftp.password}`,
        "--ftp-create-dirs",
        "--connect-timeout", "30",
        "--max-time", "1800",
        "-s", "-S",
      ]);
      let stderr = "";
      child.stderr?.on("data", (c) => { stderr += c.toString(); });
      child.on("error", (err) => resolve({ ok: false, error: err.message }));
      child.on("close", (code) => {
        if (code === 0) resolve({ ok: true });
        else resolve({ ok: false, error: stderr || `curl exit ${code}` });
      });
    });

    if (!result.ok) {
      cleanupRemoteBestEffort(remoteRel, ftp);
      await deleteSession(uploadId);
      return NextResponse.json(
        { message: `FTP 업로드 실패: ${result.error}` },
        { status: 500 }
      );
    }

    const remoteSize = await getRemoteFileSize(remoteRel, ftp);
    if (remoteSize > 0 && remoteSize !== tmpSize) {
      cleanupRemoteBestEffort(remoteRel, ftp);
      await deleteSession(uploadId);
      return NextResponse.json(
        {
          message: `NAS byte 불일치 — server ${tmpSize} / NAS ${remoteSize}. 다시 시도해 주세요.`,
        },
        { status: 500 }
      );
    }

    await deleteSession(uploadId);
    const publicUrl = `${ftp.publicBase}${remoteRel}`;
    return NextResponse.json({
      url: publicUrl,
      kind: sess.kind,
      size: tmpSize,
      remoteSize,
      name: storedName,
      remote: true,
    });
  }

  // 로컬 저장 (FTP 비활성 시)
  const subPath =
    sess.mode === "realtime"
      ? `realtime/${yyyy}/${mm}`
      : `files/${sess.boardSlug}/${yyyy}/${mm}`;
  const dir = getUploadDir(subPath);
  await mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, storedName);
  try {
    await copyFile(sess.tmpPath, fullPath);
  } catch (err) {
    await deleteSession(uploadId);
    return NextResponse.json(
      { message: `로컬 저장 실패: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
  await deleteSession(uploadId);

  const rel = getRelUploadPath(subPath, storedName);
  const url = `/api/board/media?path=${encodeURIComponent(rel)}`;
  return NextResponse.json({
    url,
    kind: sess.kind,
    size: tmpSize,
    name: storedName,
  });
}
