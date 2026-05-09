import { NextResponse } from "next/server";
import { pollYoutubeViewers } from "@/lib/youtubeViewers";

/**
 * GET /api/live/youtube-viewers
 * 공개 — YouTube 동시 시청자 + 누적. API 키는 서버에서만 사용, 노출 X.
 */
export async function GET() {
  const r = await pollYoutubeViewers();
  return NextResponse.json({
    ok: r.ok,
    hasApiKey: r.hasApiKey,
    videoId: r.videoId,
    concurrent: r.concurrent,
    cumulative: r.cumulative,
    polledAt: r.polledAt,
    cached: r.cached,
  });
}
