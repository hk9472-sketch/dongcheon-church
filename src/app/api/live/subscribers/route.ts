import { NextResponse } from "next/server";
import { getChannelSubscribers } from "@/lib/youtubeViewers";

// GET /api/live/subscribers — 유튜브 채널 구독자 수 (실시간 예배 화면 표시용, 1시간 서버 캐시)
//   비공개(숨김)로 설정된 채널이거나 API 키가 없으면 count=null
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await getChannelSubscribers();
  return NextResponse.json(r, { headers: { "Cache-Control": "public, max-age=600" } });
}
