import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

// 연보 종류 → 계정과목 매핑 API.
// GET  : 모든 매핑 + 선택 가능한 수입(D) 계정과목 목록 (단위명 포함)
// PUT  : body { offeringKey, accountId } 단건 upsert (accountId=null 이면 매핑 해제)

const OFFERING_KEYS = [
  "tithe",
  "sunday",
  "thanks",
  "special",
  "oil",
  "easter",
  "midyear",
  "harvest",
  "christmas",
  "sundaySchool",
] as const;

export async function GET() {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const [mappings, accounts] = await Promise.all([
    prisma.offeringAccountMapping.findMany(),
    prisma.accAccount.findMany({
      where: { type: "D", isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        unitId: true,
        unit: { select: { name: true, code: true } },
      },
      orderBy: [{ unit: { sortOrder: "asc" } }, { code: "asc" }],
    }),
  ]);

  return NextResponse.json({
    mappings: mappings.reduce(
      (acc, m) => {
        acc[m.offeringKey] = m.accountId;
        return acc;
      },
      {} as Record<string, number>,
    ),
    accounts: accounts.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      unitId: a.unitId,
      unitName: a.unit.name,
      unitCode: a.unit.code,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  let body: { offeringKey?: string; accountId?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const key = typeof body.offeringKey === "string" ? body.offeringKey : "";
  if (!(OFFERING_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ error: "유효하지 않은 offeringKey" }, { status: 400 });
  }

  if (body.accountId === null || body.accountId === undefined) {
    // 매핑 해제
    await prisma.offeringAccountMapping.deleteMany({ where: { offeringKey: key } });
    return NextResponse.json({ ok: true, removed: true });
  }

  const accountId = typeof body.accountId === "number" ? body.accountId : NaN;
  if (!Number.isInteger(accountId)) {
    return NextResponse.json({ error: "accountId 필수" }, { status: 400 });
  }
  // 계정 존재 확인
  const account = await prisma.accAccount.findUnique({ where: { id: accountId } });
  if (!account || account.type !== "D" || !account.isActive) {
    return NextResponse.json(
      { error: "활성 수입(D) 계정과목만 매핑 가능합니다." },
      { status: 400 },
    );
  }

  await prisma.offeringAccountMapping.upsert({
    where: { offeringKey: key },
    create: { offeringKey: key, accountId },
    update: { accountId },
  });

  return NextResponse.json({ ok: true });
}
