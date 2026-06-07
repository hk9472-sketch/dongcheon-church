import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

const VALID_CATEGORIES = ["전도회", "건축"] as const;

/**
 * POST /api/accounting/dues/amounts/bulk
 *
 * Body: {
 *   category: "전도회" | "건축",
 *   year: number,
 *   amounts: [{ memberId, amount }],     // 기존 회원 월정액 upsert
 *   newMembers: [{                       // 신규 회원 등록 + amount
 *     memberNo?: number,                  //  생략 시 자동 채번
 *     name: string,
 *     amount: number
 *   }]
 * }
 *
 * 모두 prisma.$transaction 한 번 안에서 처리. 한 건이라도 실패하면 전체 롤백.
 */
export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("dues");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  let body: {
    category?: string;
    year?: number;
    amounts?: { memberId: number; amount: number }[];
    newMembers?: { memberNo?: number; name: string; amount: number }[];
  };
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
  const amounts = Array.isArray(body.amounts) ? body.amounts : [];
  const newMembers = Array.isArray(body.newMembers) ? body.newMembers : [];

  if (amounts.length + newMembers.length === 0) {
    return NextResponse.json({ error: "처리할 항목 없음" }, { status: 400 });
  }

  // 유효성
  for (let i = 0; i < amounts.length; i++) {
    const a = amounts[i];
    if (!Number.isInteger(a.memberId) || a.memberId <= 0) {
      return NextResponse.json({ error: `amounts[${i}].memberId 잘못됨` }, { status: 400 });
    }
    if (typeof a.amount !== "number" || a.amount < 0) {
      return NextResponse.json({ error: `amounts[${i}].amount 음수 불가` }, { status: 400 });
    }
  }
  for (let i = 0; i < newMembers.length; i++) {
    const m = newMembers[i];
    if (typeof m.name !== "string" || !m.name.trim()) {
      return NextResponse.json({ error: `newMembers[${i}].name 필수` }, { status: 400 });
    }
    if (typeof m.amount !== "number" || m.amount < 0) {
      return NextResponse.json({ error: `newMembers[${i}].amount 음수 불가` }, { status: 400 });
    }
    if (m.memberNo !== undefined) {
      if (!Number.isInteger(m.memberNo) || m.memberNo <= 0) {
        return NextResponse.json({ error: `newMembers[${i}].memberNo 잘못됨` }, { status: 400 });
      }
    }
  }

  // 자동 채번 — 트랜잭션 전에 마지막 memberNo 조회
  const last = await prisma.monthlyDuesMember.findFirst({
    where: { category },
    orderBy: { memberNo: "desc" },
    select: { memberNo: true },
  });
  let nextNo = (last?.memberNo ?? 0) + 1;
  const newMembersResolved = newMembers.map((m) => ({
    memberNo: m.memberNo ?? nextNo++,
    name: m.name.trim(),
    amount: Math.floor(m.amount),
  }));

  // 중복 memberNo 사전 검사 (DB + 입력 내부)
  const askingNos = newMembersResolved.map((m) => m.memberNo);
  if (new Set(askingNos).size !== askingNos.length) {
    return NextResponse.json(
      { error: "newMembers 안에 memberNo 중복" },
      { status: 400 },
    );
  }
  const dupRows = await prisma.monthlyDuesMember.findMany({
    where: { category, memberNo: { in: askingNos } },
    select: { memberNo: true, name: true },
  });
  if (dupRows.length > 0) {
    return NextResponse.json(
      {
        error:
          `${category} 고유번호 ${dupRows.map((d) => `${d.memberNo}(${d.name})`).join(", ")} 이미 존재`,
      },
      { status: 409 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1) 신규 회원 + amount
      const createdMembers: Array<{ memberNo: number; name: string; id: number }> = [];
      for (const m of newMembersResolved) {
        const mem = await tx.monthlyDuesMember.create({
          data: { category, memberNo: m.memberNo, name: m.name, isActive: true },
        });
        createdMembers.push({ memberNo: mem.memberNo, name: mem.name, id: mem.id });
        if (m.amount > 0) {
          await tx.monthlyDuesAmount.upsert({
            where: { category_year_memberId: { category, year, memberId: mem.id } },
            create: { category, year, memberId: mem.id, amount: m.amount },
            update: { amount: m.amount },
          });
        }
      }
      // 2) 기존 amount upsert
      for (const a of amounts) {
        await tx.monthlyDuesAmount.upsert({
          where: { category_year_memberId: { category, year, memberId: a.memberId } },
          create: { category, year, memberId: a.memberId, amount: Math.floor(a.amount) },
          update: { amount: Math.floor(a.amount) },
        });
      }
      return { createdMembers, updateCount: amounts.length };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "저장 실패" },
      { status: 500 },
    );
  }
}
