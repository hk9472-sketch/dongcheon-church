import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import {
  applyBatchChange,
  migrateInitialNumbers,
} from "@/lib/offeringMemberNumber";

// GET /api/accounting/offering/member-numbers?date=YYYY-MM-DD
//   해당 일자에 유효한 모든 매핑 (memberNo → name)
export async function GET(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const dateStr = req.nextUrl.searchParams.get("date");
  if (!dateStr) return NextResponse.json({ error: "date 필수" }, { status: 400 });
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(date.getTime())) return NextResponse.json({ error: "잘못된 날짜" }, { status: 400 });

  // 미초기화 (기존 OfferingMember 가 있는데 history 없는 경우) — 자동 migrate
  await migrateInitialNumbers();

  const rows = await prisma.offeringMemberNumber.findMany({
    where: {
      validFrom: { lte: date },
      OR: [{ validUntil: null }, { validUntil: { gt: date } }],
    },
    orderBy: { memberNo: "asc" },
  });

  // 회원 정보 join
  const memberIds = Array.from(new Set(rows.map((r) => r.memberId)));
  const members =
    memberIds.length > 0
      ? await prisma.offeringMember.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, name: true, groupName: true, isActive: true },
        })
      : [];
  const mMap = new Map(members.map((m) => [m.id, m]));
  const items = rows.map((r) => ({
    memberId: r.memberId,
    memberNo: r.memberNo,
    name: mMap.get(r.memberId)?.name ?? "",
    groupName: mMap.get(r.memberId)?.groupName ?? null,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
  }));
  return NextResponse.json({ items });
}

// POST /api/accounting/offering/member-numbers
//   body: { effectiveDate, changes: [{ memberId, memberNo }] }
//   기준일자에 여러 사람의 번호를 일괄 변경. 위험 작업이라 memberEdit 권한 필요.
export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("memberEdit");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  type Body = {
    effectiveDate?: string;
    changes?: Array<{ memberId?: number; memberNo?: number }>;
  };
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const dateStr = body.effectiveDate;
  if (!dateStr) return NextResponse.json({ error: "effectiveDate 필수" }, { status: 400 });
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (changes.length === 0) {
    return NextResponse.json({ error: "변경 항목 없음" }, { status: 400 });
  }
  const valid: Array<{ memberId: number; memberNo: number }> = [];
  for (const c of changes) {
    if (
      typeof c.memberId === "number" &&
      typeof c.memberNo === "number" &&
      c.memberId > 0 &&
      c.memberNo > 0
    ) {
      valid.push({ memberId: c.memberId, memberNo: c.memberNo });
    }
  }
  if (valid.length === 0) {
    return NextResponse.json({ error: "유효한 변경 항목 없음" }, { status: 400 });
  }

  // 같은 일자에 동일 memberNo 가 다른 사람에게 동시에 할당되면 충돌 — 사전 검증.
  const noSet = new Map<number, number>();
  for (const c of valid) {
    const prev = noSet.get(c.memberNo);
    if (prev !== undefined && prev !== c.memberId) {
      return NextResponse.json(
        { error: `같은 변경 안에 memberNo ${c.memberNo} 가 두 사람에게 할당됨` },
        { status: 400 },
      );
    }
    noSet.set(c.memberNo, c.memberId);
  }

  await applyBatchChange(dateStr, valid);
  return NextResponse.json({ ok: true, applied: valid.length });
}
