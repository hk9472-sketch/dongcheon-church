import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

const VALID_CATEGORIES = ["전도회", "건축"] as const;

function toDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

// GET /api/accounting/dues/deposits?category=...&dateFrom=...&dateTo=...&memberId=...
export async function GET(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const sp = req.nextUrl.searchParams;
  const category = sp.get("category") || "";
  if (!VALID_CATEGORIES.includes(category as never)) {
    return NextResponse.json({ error: "잘못된 category" }, { status: 400 });
  }
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");
  const memberIdStr = sp.get("memberId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { category };
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = toDateOnly(dateFrom);
    if (dateTo) {
      const end = toDateOnly(dateTo);
      end.setUTCDate(end.getUTCDate() + 1);
      where.date.lt = end;
    }
  }
  if (memberIdStr) where.memberId = parseInt(memberIdStr, 10);

  const deposits = await prisma.monthlyDuesDeposit.findMany({
    where,
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });

  // 회원 정보 조인 (단위별)
  const memberIds = Array.from(new Set(deposits.map((d) => d.memberId)));
  const members =
    memberIds.length > 0
      ? await prisma.monthlyDuesMember.findMany({
          where: { id: { in: memberIds } },
        })
      : [];
  const mMap = new Map(members.map((m) => [m.id, m]));
  const items = deposits.map((d) => ({
    ...d,
    member: mMap.get(d.memberId)
      ? { id: d.memberId, memberNo: mMap.get(d.memberId)!.memberNo, name: mMap.get(d.memberId)!.name }
      : null,
  }));
  return NextResponse.json({ items });
}

// POST /api/accounting/dues/deposits — 신규 1건
export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  type Body = {
    category?: string;
    date?: string;
    memberId?: number;
    amount?: number;
    installment?: number;
    description?: string | null;
  };
  let body: Body;
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
  if (isNaN(date.getTime())) return NextResponse.json({ error: "잘못된 날짜" }, { status: 400 });
  const memberId = typeof body.memberId === "number" ? body.memberId : NaN;
  const amount = typeof body.amount === "number" ? Math.floor(body.amount) : NaN;
  const installment = typeof body.installment === "number" ? body.installment : NaN;
  if (!Number.isFinite(memberId) || !Number.isFinite(amount) || !Number.isFinite(installment)) {
    return NextResponse.json({ error: "memberId/amount/installment 필수" }, { status: 400 });
  }
  if (amount <= 0) return NextResponse.json({ error: "금액 > 0" }, { status: 400 });
  if (installment < 1 || installment > 12) {
    return NextResponse.json({ error: "회차는 1~12 사이" }, { status: 400 });
  }

  const operatorName = acc.user?.name ?? acc.user?.userId ?? "";
  const created = await prisma.monthlyDuesDeposit.create({
    data: {
      category,
      date,
      memberId,
      amount,
      installment,
      description: body.description?.toString().slice(0, 200) ?? null,
      createdBy: operatorName,
    },
  });
  return NextResponse.json({ ok: true, item: created });
}
