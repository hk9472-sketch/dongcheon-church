import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

const VALID_CATEGORIES = ["전도회", "건축"] as const;

// POST /api/accounting/dues/amounts/copy-from-prev
//   body: { category, year, overwrite? }
//   전년(year-1) 의 amount > 0 인 활성 회원의 금액을 올해(year) 로 복사.
//   overwrite=false (기본) — 올해 amount 가 0/미설정인 회원만 복사
//   overwrite=true        — 올해 amount 가 있어도 전년 값으로 덮어씀
export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("dues");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  let body: { category?: string; year?: number; overwrite?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const category = body.category || "";
  if (!VALID_CATEGORIES.includes(category as never)) {
    return NextResponse.json({ error: "잘못된 category" }, { status: 400 });
  }
  const year = typeof body.year === "number" ? body.year : NaN;
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "year 필수" }, { status: 400 });
  }
  const overwrite = !!body.overwrite;
  const prevYear = year - 1;

  const prev = await prisma.monthlyDuesAmount.findMany({
    where: { category, year: prevYear, amount: { gt: 0 } },
  });
  if (prev.length === 0) {
    return NextResponse.json({
      ok: true,
      copied: 0,
      skipped: 0,
      message: `${prevYear}년 등록 금액이 없습니다.`,
    });
  }

  const activeIds = new Set(
    (
      await prisma.monthlyDuesMember.findMany({
        where: { category, isActive: true },
        select: { id: true },
      })
    ).map((m) => m.id),
  );

  const curr = await prisma.monthlyDuesAmount.findMany({
    where: { category, year },
  });
  const currMap = new Map(curr.map((a) => [a.memberId, a.amount]));

  let copied = 0;
  let skipped = 0;
  for (const p of prev) {
    if (!activeIds.has(p.memberId)) {
      skipped++;
      continue;
    }
    const existing = currMap.get(p.memberId) ?? 0;
    if (!overwrite && existing > 0) {
      skipped++;
      continue;
    }
    await prisma.monthlyDuesAmount.upsert({
      where: { category_year_memberId: { category, year, memberId: p.memberId } },
      create: { category, year, memberId: p.memberId, amount: p.amount },
      update: { amount: p.amount },
    });
    copied++;
  }

  return NextResponse.json({ ok: true, copied, skipped, prevYear });
}
