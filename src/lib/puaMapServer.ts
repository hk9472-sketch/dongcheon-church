import prisma from "./db";
import { setRuntimePuaMap } from "./hwpPuaMap";

// 서버측 PUA 매핑 캐시 — 60초 TTL.
// API 라우트·서버컴포넌트가 sanitize 전에 ensurePuaMapHydrated() 를 await.
// 첫 호출에서 prisma 조회 + setRuntimePuaMap, 이후 60초간 stale 허용.

const TTL_MS = 60_000;
let lastFetchedAt = 0;
let inflight: Promise<void> | null = null;

export async function ensurePuaMapHydrated(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastFetchedAt < TTL_MS) return;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const rows = await prisma.puaMapping.findMany({
        select: { code: true, char: true },
      });
      const map: Record<number, string> = {};
      for (const r of rows) map[r.code] = r.char;
      setRuntimePuaMap(map);
      lastFetchedAt = Date.now();
    } catch {
      // DB 미가용 시 정적 매핑만으로 동작 — 에러 무시
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
