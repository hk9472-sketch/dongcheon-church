import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

const VALID_CATEGORIES = ["전도회", "건축"] as const;

// GET /api/accounting/dues/members?category=전도회&year=2026
//   해당 단위의 활성 회원 목록 (memberNo asc) + 연도별 월정액.
//   year 미지정 시 현재 연도. 해당 연도에 amount 가 없거나 0 인 회원은
//   가장 최근(과거) 연도의 amount 로 fallback — 신년에 월정액을 아직
//   안 옮긴 경우에도 매트릭스/입금 화면에서 금액이 자동 표시되도록.
export async function GET(req: NextRequest) {
  const acc = await checkAccAccess("dues");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const category = req.nextUrl.searchParams.get("category") || "";
  if (!VALID_CATEGORIES.includes(category as never)) {
    return NextResponse.json({ error: "잘못된 category" }, { status: 400 });
  }
  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "잘못된 year" }, { status: 400 });
  }

  const members = await prisma.monthlyDuesMember.findMany({
    where: { category, isActive: true },
    orderBy: { memberNo: "asc" },
  });

  if (members.length === 0) {
    return NextResponse.json({ members: [] });
  }

  const memberIds = members.map((m) => m.id);

  // 1) 요청 연도의 amount
  const currentAmounts = await prisma.monthlyDuesAmount.findMany({
    where: { category, year, memberId: { in: memberIds } },
    select: { memberId: true, amount: true },
  });
  const currentMap = new Map(currentAmounts.map((a) => [a.memberId, a.amount]));

  // 2) 요청 연도에 amount 가 없거나 0 인 회원은 과거 가장 최근 연도 amount 로 fallback
  const missingIds = memberIds.filter((id) => {
    const cur = currentMap.get(id);
    return cur == null || cur === 0;
  });
  const fallbackMap = new Map<number, number>();
  if (missingIds.length > 0) {
    const past = await prisma.monthlyDuesAmount.findMany({
      where: {
        category,
        memberId: { in: missingIds },
        year: { lt: year },
        amount: { gt: 0 },
      },
      orderBy: [{ year: "desc" }],
      select: { memberId: true, year: true, amount: true },
    });
    for (const a of past) {
      if (!fallbackMap.has(a.memberId)) fallbackMap.set(a.memberId, a.amount);
    }
  }

  const withAmount = members.map((m) => ({
    ...m,
    monthlyAmount: currentMap.get(m.id) ?? fallbackMap.get(m.id) ?? null,
  }));

  return NextResponse.json({ members: withAmount });
}

// POST /api/accounting/dues/members
//   body: { category, memberNo?, name }
//   memberNo 미지정 시 다음 번호 자동 채번. 지정 시 해당 번호로 등록 (충돌 시 409).
export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("dues");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  let body: { category?: string; memberNo?: number; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const category = body.category || "";
  if (!VALID_CATEGORIES.includes(category as never)) {
    return NextResponse.json({ error: "잘못된 category" }, { status: 400 });
  }
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "이름 필수" }, { status: 400 });

  let memberNo = typeof body.memberNo === "number" ? body.memberNo : 0;
  if (!Number.isInteger(memberNo) || memberNo <= 0) {
    // 자동 채번
    const last = await prisma.monthlyDuesMember.findFirst({
      where: { category },
      orderBy: { memberNo: "desc" },
    });
    memberNo = (last?.memberNo ?? 0) + 1;
  } else {
    const exists = await prisma.monthlyDuesMember.findUnique({
      where: { category_memberNo: { category, memberNo } },
    });
    if (exists) {
      return NextResponse.json(
        { error: `${category} 고유번호 ${memberNo} 이미 존재 (${exists.name})` },
        { status: 409 },
      );
    }
  }

  const created = await prisma.monthlyDuesMember.create({
    data: { category, memberNo, name, isActive: true },
  });
  return NextResponse.json({ ok: true, member: created });
}
