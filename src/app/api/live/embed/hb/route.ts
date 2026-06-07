import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { classifyService, loadWindows } from "@/lib/liveService";

/**
 * POST /api/live/embed/hb
 *   Body: { sessionId: string, playing: boolean }
 *
 * /live 페이지의 YouTube 임베드 플레이어 상태를 분 단위로 표본화.
 * playing=true 일 때만 sample upsert. paused/ended/buffering 은 무시.
 *
 * 같은 (sessionId, serviceDate, minuteKst) 키라 dedup 자동.
 * 분 단위 distinct sessionId 가 곧 그 분의 동시 시청자.
 */
export async function POST(req: NextRequest) {
  let body: { sessionId?: string; playing?: boolean } = {};
  try {
    const t = await req.text();
    if (t) body = JSON.parse(t);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const sessionId = (body.sessionId || "").trim().slice(0, 64);
  if (!sessionId) return NextResponse.json({ ok: false }, { status: 400 });
  if (!body.playing) return NextResponse.json({ ok: true, skipped: true });

  const now = new Date();
  const windows = await loadWindows().catch(() => null);
  const svc = windows ? classifyService(now, windows) : null;

  // KST 기준 분
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const ymd = kst.toISOString().slice(0, 10);
  const minuteKst = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  await prisma.liveYoutubeEmbedSample.upsert({
    where: {
      sessionId_serviceDate_minuteKst: {
        sessionId,
        serviceDate: new Date(`${ymd}T00:00:00Z`),
        minuteKst,
      },
    },
    create: {
      sessionId,
      serviceDate: new Date(`${ymd}T00:00:00Z`),
      minuteKst,
      serviceCode: svc?.code ?? null,
    },
    update: { serviceCode: svc?.code ?? null },
  });

  return NextResponse.json({ ok: true });
}
