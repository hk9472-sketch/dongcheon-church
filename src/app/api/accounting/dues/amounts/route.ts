import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

const VALID_CATEGORIES = ["전도회", "건축"] as const;

// GET /api/accounting/dues/amounts?category=전도회&year=2026
//   해당 단위 + 연도의 모든 회원 월정액 (회원 미등록자도 amount 0 으로 포함)
export async function GET(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const category = req.nextUrl.searchParams.get("category") || "";
  const yearStr = req.nextUrl.searchParams.get("year") || "";
  const year = parseInt(yearStr, 10);
  if (!VALID_CATEGORIES.includes(category as never) || !Number.isFinite(year)) {
    return NextResponse.json({ error: "category/year 필수" }, { status: 400 });
  }

  const [members, amounts] = await Promise.all([
    prisma.monthlyDuesMember.findMany({
      where: { category, isActive: true },
      orderBy: { memberNo: "asc" },
    }),
    prisma.monthlyDuesAmount.findMany({
      where: { category, year },
    }),
  ]);
  const amtMap = new Map(amounts.map((a) => [a.memberId, a.amount]));
  const items = members.map((m) => ({
    id: amounts.find((a) => a.memberId === m.id)?.id ?? 0,
    memberId: m.id,
    memberNo: m.memberNo,
    name: m.name,
    amount: amtMap.get(m.id) ?? 0,
  }));
  return NextResponse.json({ items });
}

// PUT /api/accounting/dues/amounts
//   body: { category, year, memberId, amount }
//   upsert by (category, year, memberId)
export async function PUT(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  let body: { category?: string; year?: number; memberId?: number; amount?: number };
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
  const memberId = typeof body.memberId === "number" ? body.memberId : NaN;
  const amount = typeof body.amount === "number" ? Math.floor(body.amount) : NaN;
  if (!Number.isFinite(year) || !Number.isFinite(memberId) || !Number.isFinite(amount)) {
    return NextResponse.json({ error: "year/memberId/amount 필수" }, { status: 400 });
  }
  if (amount < 0) return NextResponse.json({ error: "음수 불가" }, { status: 400 });

  const saved = await prisma.monthlyDuesAmount.upsert({
    where: {
      category_year_memberId: { category, year, memberId },
    },
    create: { category, year, memberId, amount },
    update: { amount },
  });
  return NextResponse.json({ ok: true, item: saved });
}
