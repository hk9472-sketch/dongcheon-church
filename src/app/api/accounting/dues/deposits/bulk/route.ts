import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

const VALID_CATEGORIES = ["전도회", "건축"] as const;

function toDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

// POST /api/accounting/dues/deposits/bulk
//   body: { category, date, items: [{ memberId, installment(1-12), amount, description? }] }
//   매트릭스 입력에서 체크된 셀들을 한 번에 저장.
//   - 이미 같은 (category, memberId, installment) 조합이 존재하는 항목은 건너뜀 (중복 입금 방지).
//   - 각 셀 amount > 0 필수.
export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("dues");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  type Item = {
    memberId?: number;
    installment?: number;
    amount?: number;
    description?: string | null;
  };
  let body: { category?: string; date?: string; items?: Item[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const category = body.category || "";
  if (!VALID_CATEGORIES.includes(category as never)) {
    return NextResponse.json({ error: "잘못된 category" }, { status: 400 });
  }
  if (!body.date) return NextResponse.json({ error: "date 필수" }, { status: 400 });
  const date = toDateOnly(body.date);
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: "잘못된 날짜" }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "items 비어있음" }, { status: 400 });
  }

  // 유효성
  const cleaned: { memberId: number; installment: number; amount: number; description: string | null }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const memberId = typeof it.memberId === "number" ? it.memberId : NaN;
    const installment = typeof it.installment === "number" ? it.installment : NaN;
    const amount = typeof it.amount === "number" ? Math.floor(it.amount) : NaN;
    if (!Number.isFinite(memberId) || memberId <= 0) {
      return NextResponse.json({ error: `items[${i}]: memberId 누락` }, { status: 400 });
    }
    if (!Number.isFinite(installment) || installment < 1 || installment > 12) {
      return NextResponse.json({ error: `items[${i}]: 회차 1~12` }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: `items[${i}]: 금액 > 0` }, { status: 400 });
    }
    cleaned.push({
      memberId,
      installment,
      amount,
      description: (it.description ?? null)?.toString().slice(0, 200) ?? null,
    });
  }

  // 중복 검사 — 입금 일자와 무관하게 같은 (category, memberId, installment) 가 이미 존재하면 그 항목 skip
  const existing = await prisma.monthlyDuesDeposit.findMany({
    where: {
      category,
      memberId: { in: cleaned.map((c) => c.memberId) },
      installment: { in: cleaned.map((c) => c.installment) },
    },
    select: { memberId: true, installment: true },
  });
  const existSet = new Set(existing.map((e) => `${e.memberId}:${e.installment}`));

  const operatorName = acc.user?.name ?? acc.user?.userId ?? "";
  const toCreate = cleaned.filter((c) => !existSet.has(`${c.memberId}:${c.installment}`));
  const skipped = cleaned.length - toCreate.length;

  if (toCreate.length === 0) {
    return NextResponse.json({ ok: true, created: 0, skipped, message: "모두 이미 입금됨" });
  }

  await prisma.monthlyDuesDeposit.createMany({
    data: toCreate.map((c) => ({
      category,
      date,
      memberId: c.memberId,
      amount: c.amount,
      installment: c.installment,
      description: c.description,
      createdBy: operatorName,
    })),
  });

  return NextResponse.json({ ok: true, created: toCreate.length, skipped });
}
