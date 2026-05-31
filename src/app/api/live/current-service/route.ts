import { NextResponse } from "next/server";
import { findCurrentInstance } from "@/lib/serviceInstance";

/**
 * GET /api/live/current-service
 *   응답:
 *     { instance: { id, code, label, startAt, endAt }, phase: "in_progress" | "grace" }
 *     또는 { instance: null }
 *
 * LiveAttendanceForm 이 mount 시 호출해 폼 노출 여부 결정.
 * grace = 예배 종료 후 30분 이내 (이 시간에도 등록 허용).
 */
export async function GET() {
  const result = await findCurrentInstance(new Date(), 30);
  return NextResponse.json(result ?? { instance: null });
}
