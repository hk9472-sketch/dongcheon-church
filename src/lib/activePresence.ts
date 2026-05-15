/**
 * 활성 방문자 추적 — in-memory.
 * 모든 클라이언트가 30s 간격 heartbeat 보냄. 60초 안에 ping 이 없으면 비활성으로 자동 prune.
 *
 * PM2 단일 프로세스 운영이라 in-memory 로 충분. 프로세스 재시작 시 비워지지만
 * 30초 안에 ping 으로 다시 채워짐. DB 부담 없음.
 */

export interface ActiveSessionRow {
  sessionId: string;
  userId: number | null;
  userName: string | null;
  ip: string | null;
  path: string | null;
  lastPingAt: number; // epoch ms
}

const sessions = new Map<string, ActiveSessionRow>();
const STALE_MS = 60_000;

function prune(): void {
  const cutoff = Date.now() - STALE_MS;
  for (const [k, v] of sessions) {
    if (v.lastPingAt < cutoff) sessions.delete(k);
  }
}

export function recordPing(input: Omit<ActiveSessionRow, "lastPingAt">): void {
  sessions.set(input.sessionId, { ...input, lastPingAt: Date.now() });
  prune();
}

export function listActive(): ActiveSessionRow[] {
  prune();
  return Array.from(sessions.values()).sort((a, b) => b.lastPingAt - a.lastPingAt);
}

export function countActive(): { total: number; member: number; guest: number } {
  prune();
  let member = 0;
  let guest = 0;
  for (const v of sessions.values()) {
    if (v.userId) member++;
    else guest++;
  }
  return { total: member + guest, member, guest };
}
