import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import {
  allocate,
  totalOf,
  type DenomCounts,
  type AllocationResult,
} from "@/lib/offeringAllocation";

// 일자별 카테고리 합계 조회 (DB 의 OfferingEntry 집계)
async function loadCategoryTotals(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const rows = await prisma.offeringEntry.groupBy({
    by: ["offeringType"],
    where: { date: { gte: start, lte: end } },
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
//   기존 결산 있으면 그대로, 없으면 카테고리 합계만 (매수는 0)
export async function GET(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const dateStr = req.nextUrl.searchParams.get("date");
  if (!dateStr) return NextResponse.json({ error: "date 파라미터 필요" }, { status: 400 });
  const date = new Date(dateStr + "T00:00:00");
  if (isNaN(date.getTime()))
    return NextResponse.json({ error: "잘못된 날짜" }, { status: 400 });

  const existing = await prisma.offeringSettlement.findUnique({ where: { date } });
  if (existing) {
    return NextResponse.json({
      mode: "saved",
      settlement: {
        ...existing,
        allocation: safeJsonParse(existing.allocation),
      },
    });
  }

  // 신규 — 카테고리 합계만 계산해서 반환
  const cat = await loadCategoryTotals(date);
  return NextResponse.json({
    mode: "new",
    categories: cat,
  });
}

// POST /api/accounting/offering/settlement
// body: { date, denominations: DenomCounts }
//   확정 — 차액 entry 추가 + 분배 계산 + settlement 저장. 잠금.
export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  let body: { date?: string; denominations?: DenomCounts };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }

  const dateStr = body.date;
  if (!dateStr) return NextResponse.json({ error: "date 필수" }, { status: 400 });
  const date = new Date(dateStr + "T00:00:00");
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
  for (const v of Object.values(counts)) {
    if (v < 0) return NextResponse.json({ error: "음수 매수 불가" }, { status: 400 });
  }

  // 이미 확정됐으면 거부
  const existing = await prisma.offeringSettlement.findUnique({ where: { date } });
  if (existing && existing.finalizedAt) {
    return NextResponse.json(
      { error: "이미 확정된 결산입니다. 관리자에게 잠금 해제 요청 필요." },
      { status: 409 },
    );
  }

  // 서버측 카테고리 합계 재계산
  const cat = await loadCategoryTotals(date);
  const inputTotal =
    cat.amtTithe + cat.amtSunday + cat.amtThanks + cat.amtSpecial + cat.amtOil + cat.amtSeason;
  const cashTotal = totalOf(counts);

  if (cashTotal < inputTotal) {
    return NextResponse.json(
      {
        error: `매수합계(${cashTotal.toLocaleString()})가 입력합계(${inputTotal.toLocaleString()})보다 적습니다. 매수를 다시 확인해주세요.`,
      },
      { status: 400 },
    );
  }

  const diff = cashTotal - inputTotal;

  // 트랜잭션: 차액 OfferingEntry 추가 → settlement upsert
  const operatorName = acc.user?.name ?? acc.user?.userId ?? "결산";

  const result = await prisma.$transaction(async (tx) => {
    let diffEntryId: number | null = null;
    if (diff > 0) {
      const entry = await tx.offeringEntry.create({
        data: {
          date,
          memberId: null,
          offeringType: "주일연보",
          amount: diff,
          description: "결산차액",
          createdBy: operatorName,
        },
      });
      diffEntryId = entry.id;
    }

    // 차액 반영된 카테고리 (주일연보에 더해짐)
    const finalCat = {
      ...cat,
      amtSunday: cat.amtSunday + diff,
    };
    const generalAmount =
      finalCat.amtSunday +
      finalCat.amtThanks +
      finalCat.amtSpecial +
      finalCat.amtOil +
      finalCat.amtSeason;
    const titheAmount = finalCat.amtTithe;

    const allocation: AllocationResult = allocate(counts, generalAmount, titheAmount);

    const data = {
      date,
      ...finalCat,
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
      diffEntryId,
      allocation: JSON.stringify(allocation),
      finalizedAt: new Date(),
      finalizedBy: operatorName,
    };

    const saved = await tx.offeringSettlement.upsert({
      where: { date },
      create: data,
      update: data,
    });
    return { saved, allocation, finalCat };
  });

  return NextResponse.json({
    ok: true,
    settlement: { ...result.saved, allocation: result.allocation },
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
