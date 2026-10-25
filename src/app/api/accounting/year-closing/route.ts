import { NextRequest, NextResponse } from "next/server";
import { checkAccAccess } from "@/lib/accountAuth";
import { cancelYear, closeYear, yearStatus } from "@/lib/accYear";

/**
 * GET /api/accounting/year-closing?year=2026
 * 회계단위별 연간 현황 — 이월금, 수입/지출, 통장별 기말잔액, 마감 여부, 다음 연도 이월금
 */
export async function GET(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const year = parseInt(new URL(request.url).searchParams.get("year") || "", 10);
  if (!year) return NextResponse.json({ error: "year는 필수입니다." }, { status: 400 });
  return NextResponse.json({ year, units: await yearStatus(year) });
}

/**
 * POST /api/accounting/year-closing
 * body: { year, unitIds: number[] } — 선택 단위 연마감 (각각 독립 처리, 결과 개별 보고)
 */
export async function POST(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const body = await request.json().catch(() => ({}));
  const year = Number(body.year);
  const unitIds: number[] = Array.isArray(body.unitIds) ? body.unitIds.map(Number).filter(Boolean) : [];
  if (!year || unitIds.length === 0) {
    return NextResponse.json({ error: "연도와 회계단위를 선택하세요." }, { status: 400 });
  }
  const closedBy = access.user?.name ?? String(access.userId ?? "");
  const results: { unitId: number; ok: boolean; error?: string }[] = [];
  for (const unitId of unitIds) {
    const err = await closeYear(unitId, year, closedBy);
    results.push(err ? { unitId, ok: false, error: err } : { unitId, ok: true });
  }
  return NextResponse.json({ results });
}

/**
 * DELETE /api/accounting/year-closing?year=2026&unitId=1  (관리자 전용)
 */
export async function DELETE(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }
  const sp = new URL(request.url).searchParams;
  const year = parseInt(sp.get("year") || "", 10);
  const unitId = parseInt(sp.get("unitId") || "", 10);
  if (!year || !unitId) return NextResponse.json({ error: "year, unitId는 필수입니다." }, { status: 400 });
  const err = await cancelYear(unitId, year);
  if (err) return NextResponse.json({ error: err }, { status: 409 });
  return NextResponse.json({ success: true });
}
