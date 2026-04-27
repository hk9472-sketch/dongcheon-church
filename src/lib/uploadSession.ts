import { randomBytes } from "crypto";
import path from "path";
import os from "os";
import { mkdir, rm } from "fs/promises";
import type { UploadMode } from "./mediaUpload";

// ────────────────────────────────────────────────────────────
// 청크 업로드 세션 매니저 (in-memory).
// PM2 single instance 환경 가정. 다중 인스턴스면 Redis 등으로 교체 필요.
// 30분 TTL — 미완료 세션은 5분마다 정리.
// ────────────────────────────────────────────────────────────

export interface UploadSession {
  uploadId: string;
  fileName: string;
  expectedSize: number;
  boardSlug: string;
  mode: UploadMode;
  dateBase: string;
  ext: string;
  kind: "video" | "audio";
  tmpPath: string;
  receivedBytes: number;
  createdAt: number;
}

const sessions = new Map<string, UploadSession>();
const TTL_MS = 30 * 60 * 1000;

let cleanupStarted = false;
function ensureCleanupTimer() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.createdAt > TTL_MS) {
        sessions.delete(id);
        rm(path.dirname(s.tmpPath), { recursive: true, force: true }).catch(() => {});
      }
    }
  }, 5 * 60 * 1000);
}

export interface CreateArgs {
  fileName: string;
  expectedSize: number;
  boardSlug: string;
  mode: UploadMode;
  dateBase: string;
  ext: string;
  kind: "video" | "audio";
}

export async function createSession(args: CreateArgs): Promise<UploadSession> {
  ensureCleanupTimer();
  const uploadId = randomBytes(16).toString("hex");
  const dir = path.join(os.tmpdir(), "dc-upload", uploadId);
  await mkdir(dir, { recursive: true });
  const tmpPath = path.join(dir, `file${args.ext}`);
  const session: UploadSession = {
    uploadId,
    ...args,
    tmpPath,
    receivedBytes: 0,
    createdAt: Date.now(),
  };
  sessions.set(uploadId, session);
  return session;
}

export function getSession(id: string): UploadSession | null {
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.createdAt > TTL_MS) {
    sessions.delete(id);
    rm(path.dirname(s.tmpPath), { recursive: true, force: true }).catch(() => {});
    return null;
  }
  return s;
}

export async function deleteSession(id: string): Promise<void> {
  const s = sessions.get(id);
  if (s) {
    sessions.delete(id);
    await rm(path.dirname(s.tmpPath), { recursive: true, force: true }).catch(() => {});
  }
}
