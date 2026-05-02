import { NextRequest, NextResponse } from "next/server";
import { checkAccAccess } from "@/lib/accountAuth";
import {
  allocate,
  totalOf,
  type DenomCounts,
} from "@/lib/offeringAllocation";

// POST /api/accounting/offering/settlement/preview
// body: { categories: {amtTithe, amtSunday, ...}, denominations: DenomCounts }
//   분배 알고리즘만 실행 — 저장 없음. 차액은 호출자가 미리 amtSunday 에 더해 보내거나
//   안 더해 보내고 응답에서 diff 받아 반영 가능.
export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  type Body = {
    categories?: {
      amtTithe?: number;
      amtSunday?: number;
      amtThanks?: number;
      amtSpecial?: number;
      amtOil?: number;
      amtSeason?: number;
    };
    denominations?: DenomCounts;
  };
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }
  const cat = body.categories || {};
  const d = body.denominations;
  if (!d) return NextResponse.json({ error: "denominations 필수" }, { status: 400 });

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

  const inputTotal =
    int(cat.amtTithe) +
    int(cat.amtSunday) +
    int(cat.amtThanks) +
    int(cat.amtSpecial) +
    int(cat.amtOil) +
    int(cat.amtSeason);
  const cashTotal = totalOf(counts);
  const diff = Math.max(0, cashTotal - inputTotal);

  const finalSunday = int(cat.amtSunday) + diff;
  const generalAmount =
    finalSunday +
    int(cat.amtThanks) +
    int(cat.amtSpecial) +
    int(cat.amtOil) +
    int(cat.amtSeason);
  const titheAmount = int(cat.amtTithe);
  const allocation = allocate(counts, generalAmount, titheAmount);

  return NextResponse.json({
    inputTotal,
    cashTotal,
    diff,
    finalCategories: {
      amtTithe: int(cat.amtTithe),
      amtSunday: finalSunday,
      amtThanks: int(cat.amtThanks),
      amtSpecial: int(cat.amtSpecial),
      amtOil: int(cat.amtOil),
      amtSeason: int(cat.amtSeason),
    },
    generalAmount,
    titheAmount,
    allocation,
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
