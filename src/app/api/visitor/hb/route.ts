import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getClientIp } from "@/lib/rateLimit";

/**
 * POST /api/visitor/hb — 체류 시간(heartbeat) 누적.
 *
 * Body: { sessionId: string, path: string, final?: boolean }
 *   - 클라이언트는 mount 시 sessionId 1회 발급 (localStorage)
 *   - 20초마다 호출. 마지막 hb 와의 간격이 30초 이내일 때만 dwellSec += 20.
 *     (탭 백그라운드 → throttling 으로 간격이 커지면 그 사이클은 increment 0.
 *      좀비 세션 차단)
 *   - unload 시 sendBeacon(final=true) — 마지막 보정 (추가 +5s).
 *
 * 같은 (sessionId, path) 의 가장 최근 1시간 내 row 1개만 갱신.
 * 없으면 무시 (visitor 가 새 row 만들지 않은 경우 — POST /api/visitor 가 봇 차단).
 */
export async function POST(req: NextRequest) {
  // sendBeacon 호환 — Content-Type 무관하게 body 파싱
  let body: { sessionId?: string; path?: string; final?: boolean } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sessionId = (body.sessionId || "").trim().slice(0, 64);
  const path = (body.path || "").trim().slice(0, 500);
  if (!sessionId || !path) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // 1시간 이상 오래된 row 는 갱신 대상 아님 (탭 켜둔 채로 자고 일어난 케이스 등)
  const since = new Date(Date.now() - 60 * 60 * 1000);

  const row = await prisma.visitLog.findFirst({
    where: { sessionId, path, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { id: true, lastHbAt: true, dwellSec: true },
  });
  if (!row) {
    // visit row 없음 — 봇/공격 path 라 차단됐거나 lifecycle 어긋남.
    return NextResponse.json({ ok: false, reason: "no_visit_row" });
  }

  const now = new Date();
  const inc = body.final ? 5 : computeIncrement(row.lastHbAt, now);
  await prisma.visitLog.update({
    where: { id: row.id },
    data: {
      dwellSec: { increment: inc },
      lastHbAt: now,
    },
  });

  // getClientIp 호출은 abuse 방지용 의도 — 결과는 안 씀
  void getClientIp(req);

  return NextResponse.json({ ok: true, dwellSec: row.dwellSec + inc });
}

/**
 * lastHbAt 과 now 의 간격으로 증가량 결정.
 * - null (첫 hb) → 20 (방문 시작 후 20초)
 * - 30초 이내 → 20 (정상 사이클)
 * - 30초 초과 → 0 (좀비/백그라운드 throttling — 이 사이클은 무효)
 */
function computeIncrement(lastHbAt: Date | null, now: Date): number {
  if (!lastHbAt) return 20;
  const diffSec = (now.getTime() - lastHbAt.getTime()) / 1000;
  return diffSec <= 30 ? 20 : 0;
}
