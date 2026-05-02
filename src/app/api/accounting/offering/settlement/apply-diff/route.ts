import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

// POST /api/accounting/offering/settlement/apply-diff
// body: { date: string, amount: number }
//   차액만큼 주일연보 OfferingEntry 1건 INSERT (memberId=null, description="결산차액").
//   양수만 허용 — 음수는 별도 검토 필요.
export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  let body: { date?: string; amount?: number };
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

  const amount = typeof body.amount === "number" ? Math.floor(body.amount) : 0;
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "차액이 0 이하입니다 — 반영할 게 없거나 음수는 수동 검토 필요." },
      { status: 400 },
    );
  }

  const operatorName = acc.user?.name ?? acc.user?.userId ?? "결산";
  const entry = await prisma.offeringEntry.create({
    data: {
      date,
      memberId: null,
      offeringType: "주일연보",
      amount,
      description: "결산차액",
      createdBy: operatorName,
    },
  });

  return NextResponse.json({ ok: true, entryId: entry.id });
}
