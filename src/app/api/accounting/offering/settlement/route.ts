import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import {
  allocate,
  totalOf,
  type DenomCounts,
  type AllocationResult,
} from "@/lib/offeringAllocation";

// 일자별 카테고리 합계 조회 (DB 의 OfferingEntry 집계).
// OfferingEntry 의 @db.Date 는 UTC 자정 기준으로 저장되므로 같은 기준으로 조회.
async function loadCategoryTotals(date: Date) {
  const dateStr = date.toISOString().slice(0, 10);
  const start = new Date(`${dateStr}T00:00:00Z`);
  const end = new Date(`${dateStr}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);

  const rows = await prisma.offeringEntry.groupBy({
    by: ["offeringType"],
    where: { date: { gte: start, lt: end } },
    _sum: { amount: true },
  });

  const totals = {
    amtTithe: 0,
    amtSunday: 0,
    amtThanks: 0,
    amtSpecial: 0,
    amtOil: 0,
    amtSeason: 0,
  };
  for (const r of rows) {
    const sum = r._sum.amount ?? 0;
    switch (r.offeringType) {
      case "십일조연보":
        totals.amtTithe += sum;
        break;
      case "주일연보":
        totals.amtSunday += sum;
        break;
      case "감사연보":
        totals.amtThanks += sum;
        break;
      case "특별연보":
        totals.amtSpecial += sum;
        break;
      case "오일연보":
        totals.amtOil += sum;
        break;
      case "절기연보":
        totals.amtSeason += sum;
        break;
    }
  }
  return totals;
}

// GET /api/accounting/offering/settlement?date=YYYY-MM-DD
//   기존 결산 있으면 반환, 없으면 카테고리만 자동 집계.
//   query refresh=1 면 매수·결산 무시하고 카테고리만 새로 집계 (새로고침).
export async function GET(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const dateStr = req.nextUrl.searchParams.get("date");
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (!dateStr) return NextResponse.json({ error: "date 파라미터 필요" }, { status: 400 });
  const date = new Date(dateStr + "T00:00:00Z");
  if (isNaN(date.getTime()))
    return NextResponse.json({ error: "잘못된 날짜" }, { status: 400 });

  const cat = await loadCategoryTotals(date);

  if (refresh) {
    return NextResponse.json({ mode: "refresh", categories: cat });
  }

  const existing = await prisma.offeringSettlement.findUnique({ where: { date } });
  if (existing) {
    return NextResponse.json({
      mode: "saved",
      settlement: {
        ...existing,
        allocation: safeJsonParse(existing.allocation),
      },
      // 최신 카테고리 합계도 같이 줘서 변동 있는지 비교 가능
      categories: cat,
    });
  }

  return NextResponse.json({ mode: "new", categories: cat });
}

// POST /api/accounting/offering/settlement
//   body: { date, denominations: DenomCounts, denomAmounts?: Partial<AllocationGroup> }
//   denomAmounts 가 있으면 매수 × 단위 외 별도 금액으로 처리 (수표 외 단위에도
//   금액 직접 입력 허용 — 매수와 정확히 일치 안 해도 사용자 입력 그대로 저장).
//   잠금 없음 — 항상 upsert 가능.
export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  let body: {
    date?: string;
    denominations?: DenomCounts;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }

  const dateStr = body.date;
  if (!dateStr) return NextResponse.json({ error: "date 필수" }, { status: 400 });
  const date = new Date(dateStr + "T00:00:00Z");
  if (isNaN(date.getTime()))
    return NextResponse.json({ error: "잘못된 날짜" }, { status: 400 });

  const d = body.denominations;
  if (!d || typeof d !== "object")
    return NextResponse.json({ error: "denominations 필수" }, { status: 400 });

  const counts: DenomCounts = {
    check: int(d.check),
    w50000: int(d.w50000),
    w10000: int(d.w10000),
    w5000: int(d.w5000),
    w1000: int(d.w1000),
    w500: int(d.w500),
    w100: int(d.w100),
    w50: int(d.w50),
    w10: int(d.w10),
  };

  // 카테고리 합계 (저장 시점 스냅샷)
  const cat = await loadCategoryTotals(date);
  const inputTotal =
    cat.amtTithe + cat.amtSunday + cat.amtThanks + cat.amtSpecial + cat.amtOil + cat.amtSeason;
  const cashTotal = totalOf(counts);

  // 차액 = 매수합 - 입력합 (음수도 허용 — 미확인 분 등). 주일연보에 더해 일반 금액 산정.
  const diff = cashTotal - inputTotal;
  const generalAmount =
    cat.amtSunday + cat.amtThanks + cat.amtSpecial + cat.amtOil + cat.amtSeason + diff;
  const titheAmount = cat.amtTithe;
  const allocation: AllocationResult = allocate(counts, generalAmount, titheAmount);

  const operatorName = acc.user?.name ?? acc.user?.userId ?? "결산";
  const data = {
    date,
    ...cat, // 원본 카테고리 (차액 미반영 — UI 에서 확인용)
    cashCheck: counts.check,
    cnt50000: counts.w50000,
    cnt10000: counts.w10000,
    cnt5000: counts.w5000,
    cnt1000: counts.w1000,
    cnt500: counts.w500,
    cnt100: counts.w100,
    cnt50: counts.w50,
    cnt10: counts.w10,
    diffAmount: diff,
    diffEntryId: null,
    allocation: JSON.stringify(allocation),
    finalizedAt: null,
    finalizedBy: operatorName, // 마지막 저장자
  };

  const saved = await prisma.offeringSettlement.upsert({
    where: { date },
    create: data,
    update: data,
  });

  return NextResponse.json({
    ok: true,
    settlement: { ...saved, allocation },
  });
}

function int(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === "string") {
    const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function safeJsonParse(s: string): AllocationResult | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
