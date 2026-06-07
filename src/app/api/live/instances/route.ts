import { NextRequest, NextResponse } from "next/server";
import { listInstancesByDate } from "@/lib/serviceInstance";

/**
 * GET /api/live/instances?date=YYYY-MM-DD
 * 공개 — 그 날의 ServiceInstance 목록 (id, code, label, startAt, endAt 만).
 * live/stats 페이지 예배 선택 버튼 + 차트 호출에 사용.
 */
export async function GET(req: NextRequest) {
  const dateStr = req.nextUrl.searchParams.get("date");
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: "date=YYYY-MM-DD 필요" }, { status: 400 });
  }
  const list = await listInstancesByDate(dateStr);
  return NextResponse.json({
    date: dateStr,
    services: list.map((s) => ({
      id: s.id,
      code: s.code,
      label: s.label,
      startAt: s.startAt,
      endAt: s.endAt,
    })),
  });
}
