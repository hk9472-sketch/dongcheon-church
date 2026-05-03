import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

const VALID_CATEGORIES = ["전도회", "건축"] as const;

function toDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

// GET /api/accounting/dues/report?category=&mode=period&dateFrom=&dateTo=
//   기간 내 회원별 회차별 입금 매트릭스.
// GET /api/accounting/dues/report?category=&mode=member&year=
//   연간 회원별 1~12월 입금 매트릭스 + 월정액 비교.
export async function GET(req: NextRequest) {
  const acc = await checkAccAccess("dues");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const sp = req.nextUrl.searchParams;
  const category = sp.get("category") || "";
  if (!VALID_CATEGORIES.includes(category as never)) {
    return NextResponse.json({ error: "잘못된 category" }, { status: 400 });
  }
  const mode = sp.get("mode");

  if (mode === "period") {
    const dateFromStr = sp.get("dateFrom");
    const dateToStr = sp.get("dateTo");
    if (!dateFromStr || !dateToStr) {
      return NextResponse.json({ error: "dateFrom, dateTo 필수" }, { status: 400 });
    }
    return periodReport(category, dateFromStr, dateToStr);
  }
  if (mode === "member") {
    const yearStr = sp.get("year");
    const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: "잘못된 year" }, { status: 400 });
    }
    return memberReport(category, year);
  }
  return NextResponse.json({ error: "mode=period|member 필요" }, { status: 400 });
}

async function periodReport(category: string, dateFromStr: string, dateToStr: string) {
  const from = toDateOnly(dateFromStr);
  const to = toDateOnly(dateToStr);
  to.setUTCDate(to.getUTCDate() + 1);

  const [members, deposits] = await Promise.all([
    prisma.monthlyDuesMember.findMany({
      where: { category, isActive: true },
      orderBy: { memberNo: "asc" },
    }),
    prisma.monthlyDuesDeposit.findMany({
      where: { category, date: { gte: from, lt: to } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
  ]);

  const memberMap = new Map(members.map((m) => [m.id, m]));

  // 회원별 회차별 합계
  type Bucket = {
    memberId: number;
    memberNo: number;
    name: string;
    byInstallment: Record<number, number>; // 1-12
    total: number;
  };
  const bucketMap = new Map<number, Bucket>();
  // 회차별 전체 합계
  const installmentTotals: Record<number, number> = {};
  let grandTotal = 0;

  for (const d of deposits) {
    let b = bucketMap.get(d.memberId);
    if (!b) {
      const m = memberMap.get(d.memberId);
      b = {
        memberId: d.memberId,
        memberNo: m?.memberNo ?? 0,
        name: m?.name ?? "(미등록)",
        byInstallment: {},
        total: 0,
      };
      bucketMap.set(d.memberId, b);
    }
    b.byInstallment[d.installment] = (b.byInstallment[d.installment] || 0) + d.amount;
    b.total += d.amount;
    installmentTotals[d.installment] = (installmentTotals[d.installment] || 0) + d.amount;
    grandTotal += d.amount;
  }

  const items = Array.from(bucketMap.values()).sort((a, b) => a.memberNo - b.memberNo);

  return NextResponse.json({
    mode: "period",
    dateFrom: dateFromStr,
    dateTo: dateToStr,
    items,
    installmentTotals,
    grandTotal,
    depositCount: deposits.length,
  });
}

async function memberReport(category: string, year: number) {
  const yearStart = toDateOnly(`${year}-01-01`);
  const yearEnd = toDateOnly(`${year + 1}-01-01`);

  const [members, amounts, deposits] = await Promise.all([
    prisma.monthlyDuesMember.findMany({
      where: { category, isActive: true },
      orderBy: { memberNo: "asc" },
    }),
    prisma.monthlyDuesAmount.findMany({
      where: { category, year },
    }),
    prisma.monthlyDuesDeposit.findMany({
      where: { category, date: { gte: yearStart, lt: yearEnd } },
    }),
  ]);

  const amtMap = new Map(amounts.map((a) => [a.memberId, a.amount]));

  type Row = {
    memberId: number;
    memberNo: number;
    name: string;
    monthlyDues: number;
    byInstallment: Record<number, number>;
    total: number;
    expectedAnnual: number; // monthlyDues * 12
    unpaidInstallments: number[]; // 1-12 중 입금 = 0 인 회차
  };
  const rows: Row[] = members.map((m) => {
    const monthlyDues = amtMap.get(m.id) ?? 0;
    return {
      memberId: m.id,
      memberNo: m.memberNo,
      name: m.name,
      monthlyDues,
      byInstallment: {},
      total: 0,
      expectedAnnual: monthlyDues * 12,
      unpaidInstallments: [],
    };
  });
  const rowMap = new Map(rows.map((r) => [r.memberId, r]));

  for (const d of deposits) {
    const r = rowMap.get(d.memberId);
    if (!r) continue;
    r.byInstallment[d.installment] = (r.byInstallment[d.installment] || 0) + d.amount;
    r.total += d.amount;
  }
  for (const r of rows) {
    if (r.monthlyDues > 0) {
      for (let m = 1; m <= 12; m++) {
        if (!r.byInstallment[m]) r.unpaidInstallments.push(m);
      }
    }
  }

  // 회차별 전체 합계
  const installmentTotals: Record<number, number> = {};
  let grandTotal = 0;
  let totalExpected = 0;
  for (const r of rows) {
    for (const m of Object.keys(r.byInstallment)) {
      const k = parseInt(m, 10);
      installmentTotals[k] = (installmentTotals[k] || 0) + r.byInstallment[k];
    }
    grandTotal += r.total;
    totalExpected += r.expectedAnnual;
  }

  return NextResponse.json({
    mode: "member",
    year,
    rows,
    installmentTotals,
    grandTotal,
    totalExpected,
  });
}
