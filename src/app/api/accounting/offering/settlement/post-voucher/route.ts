import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

// POST /api/accounting/offering/settlement/post-voucher
// body: { date, sundaySchool, seasonType }
//   해당 일자의 OfferingEntry 합계 + 주일학교를 회계단위별로 분리해서 수입(D) 전표 생성.
//   카테고리 → 회계단위 매핑 (이름 후보 첫 매치):
//     · 십일조연보       → 회계단위 "십일조회계"
//     · 주일학교         → 회계단위 "주교회계"
//     · 그 외 (주일/감사/특별/오일/절기) → 회계단위 "일반회계"
//   각 단위 안에서 같은 이름의 AccAccount(type=D, isActive) 매칭.
//   절기 금액 > 0 이면 seasonType (부활감사/맥추감사/추수감사/성탄감사) 1개 선택 필수.

const SEASON_TYPES = ["부활감사", "맥추감사", "추수감사", "성탄감사"] as const;
type SeasonType = (typeof SEASON_TYPES)[number];

// 카테고리 키 → { 회계단위 이름 후보, 계정과목 이름 후보 }
interface CategoryMap {
  unitNames: string[]; // 회계단위 이름 후보 (첫 매치)
  accountNames: string[]; // 계정과목 이름 후보 (단위 안에서 첫 매치)
  label: string;
}

const TITHE_UNIT = ["십일조회계", "십일조"];
const SS_UNIT = ["주교회계", "주일학교회계", "주교"];
const GEN_UNIT = ["일반회계", "일반"];

const CAT_MAPS: Record<string, CategoryMap> = {
  tithe: { unitNames: TITHE_UNIT, accountNames: ["십일조연보", "십일조"], label: "십일조연보" },
  sunday: { unitNames: GEN_UNIT, accountNames: ["주일연보", "주일"], label: "주일연보" },
  thanks: { unitNames: GEN_UNIT, accountNames: ["감사연보", "감사"], label: "감사연보" },
  special: { unitNames: GEN_UNIT, accountNames: ["특별연보", "특별"], label: "특별연보" },
  oil: { unitNames: GEN_UNIT, accountNames: ["오일연보", "오일"], label: "오일연보" },
  // season 은 동적: seasonType 으로 계정 이름 결정, 단위는 일반회계
  sundaySchool: { unitNames: SS_UNIT, accountNames: ["주일학교"], label: "주일학교" },
};

export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  let body: {
    date?: string;
    sundaySchool?: number;
    seasonType?: SeasonType;
  };
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

  // 해당 일자 OfferingEntry 합계
  const dayStart = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const rows = await prisma.offeringEntry.groupBy({
    by: ["offeringType"],
    where: { date: { gte: dayStart, lt: dayEnd } },
    _sum: { amount: true },
  });

  const sums: Record<string, number> = {
    "십일조연보": 0,
    "주일연보": 0,
    "감사연보": 0,
    "특별연보": 0,
    "오일연보": 0,
    "절기연보": 0,
  };
  for (const r of rows) {
    if (r.offeringType in sums) sums[r.offeringType] = r._sum.amount ?? 0;
  }

  const sundaySchool =
    typeof body.sundaySchool === "number" && body.sundaySchool >= 0
      ? Math.floor(body.sundaySchool)
      : 0;

  const seasonAmount = sums["절기연보"];
  let seasonType: SeasonType | null = null;
  if (seasonAmount > 0) {
    if (
      typeof body.seasonType === "string" &&
      (SEASON_TYPES as readonly string[]).includes(body.seasonType)
    ) {
      seasonType = body.seasonType as SeasonType;
    } else {
      return NextResponse.json(
        { error: "절기 금액이 있어 부활감사/맥추감사/추수감사/성탄감사 중 1개를 선택해야 합니다." },
        { status: 400 },
      );
    }
  }

  // 회계단위 이름 → id 캐시
  const unitCache = new Map<string, number | null>();
  async function findUnit(names: string[]): Promise<number | null> {
    const key = names.join("|");
    if (unitCache.has(key)) return unitCache.get(key)!;
    for (const n of names) {
      const u = await prisma.accUnit.findFirst({
        where: { name: n, isActive: true },
      });
      if (u) {
        unitCache.set(key, u.id);
        return u.id;
      }
    }
    unitCache.set(key, null);
    return null;
  }

  async function findAccount(unitId: number, names: string[]): Promise<number | null> {
    for (const n of names) {
      const a = await prisma.accAccount.findFirst({
        where: { unitId, name: n, type: "D", isActive: true },
      });
      if (a) return a.id;
    }
    return null;
  }

  // 단위별 항목 그룹핑
  type Item = { name: string; accountId: number; amount: number };
  const byUnit = new Map<number, Item[]>(); // unitId → items
  const missingUnits: string[] = [];
  const missingAccounts: string[] = [];

  // 분류: [카테고리키, 금액, 라벨, unit 후보, account 후보]
  type Plan = {
    label: string;
    amount: number;
    unitNames: string[];
    accountNames: string[];
  };
  const plans: Plan[] = [];

  for (const k of ["tithe", "sunday", "thanks", "special", "oil"] as const) {
    const cat = CAT_MAPS[k];
    const amt = sums[cat.label];
    if (amt > 0) {
      plans.push({
        label: cat.label,
        amount: amt,
        unitNames: cat.unitNames,
        accountNames: cat.accountNames,
      });
    }
  }
  if (seasonAmount > 0 && seasonType) {
    plans.push({
      label: seasonType,
      amount: seasonAmount,
      unitNames: GEN_UNIT,
      accountNames: [seasonType, "절기연보", "절기"],
    });
  }
  if (sundaySchool > 0) {
    plans.push({
      label: "주일학교",
      amount: sundaySchool,
      unitNames: SS_UNIT,
      accountNames: CAT_MAPS.sundaySchool.accountNames,
    });
  }

  for (const p of plans) {
    const unitId = await findUnit(p.unitNames);
    if (!unitId) {
      missingUnits.push(`${p.label}(회계단위 ${p.unitNames[0]})`);
      continue;
    }
    const accId = await findAccount(unitId, p.accountNames);
    if (!accId) {
      missingAccounts.push(`${p.label}(${p.unitNames[0]} 안)`);
      continue;
    }
    const list = byUnit.get(unitId) ?? [];
    list.push({ name: p.label, accountId: accId, amount: p.amount });
    byUnit.set(unitId, list);
  }

  if (byUnit.size === 0) {
    return NextResponse.json(
      {
        error:
          "반영할 항목 없음." +
          (missingUnits.length ? ` 회계단위 누락: ${missingUnits.join(", ")}` : "") +
          (missingAccounts.length ? ` 계정과목 누락: ${missingAccounts.join(", ")}` : ""),
      },
      { status: 400 },
    );
  }

  // 마감 여부 — 어떤 단위라도 마감됐으면 그 단위만 거부 (전체 거부 X)
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const closedUnits: string[] = [];
  for (const unitId of byUnit.keys()) {
    const closing = await prisma.accClosing.findUnique({
      where: { unitId_year_month: { unitId, year, month } },
    });
    if (closing && closing.closedAt) {
      const u = await prisma.accUnit.findUnique({ where: { id: unitId } });
      closedUnits.push(u?.name ?? `unit ${unitId}`);
    }
  }
  if (closedUnits.length > 0) {
    return NextResponse.json(
      { error: `${year}년 ${month}월 마감된 단위: ${closedUnits.join(", ")}` },
      { status: 409 },
    );
  }

  const operatorName = acc.user?.name ?? acc.user?.userId ?? "결산";
  const dateNoStr = date.toISOString().slice(0, 10).replace(/-/g, "");

  // 단위별로 트랜잭션 분리 (전표번호 채번 충돌 격리)
  const created: Array<{ unitName: string; voucherNo: string; items: number; total: number }> = [];

  for (const [unitId, items] of byUnit.entries()) {
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    const MAX_RETRIES = 3;
    let succeeded = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !succeeded; attempt++) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const existing = await tx.accVoucher.findMany({
            where: { unitId, voucherNo: { startsWith: dateNoStr } },
            orderBy: { voucherNo: "desc" },
            take: 1,
          });
          const nextSeq =
            existing.length > 0
              ? parseInt(existing[0].voucherNo.split("-")[1], 10) + 1
              : 1;
          const voucherNo = `${dateNoStr}-${String(nextSeq).padStart(3, "0")}`;
          const voucher = await tx.accVoucher.create({
            data: {
              unitId,
              voucherNo,
              type: "D",
              date,
              description: "연보 결산 자동 반영",
              totalAmount,
              createdBy: operatorName,
              items: {
                create: items.map((it, idx) => ({
                  seq: idx + 1,
                  accountId: it.accountId,
                  amount: it.amount,
                  description: it.name,
                  counterpart: null,
                })),
              },
            },
          });
          const u = await tx.accUnit.findUnique({ where: { id: unitId } });
          return { voucherNo: voucher.voucherNo, unitName: u?.name ?? "?" };
        });
        created.push({
          unitName: result.unitName,
          voucherNo: result.voucherNo,
          items: items.length,
          total: totalAmount,
        });
        succeeded = true;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          if (attempt < MAX_RETRIES - 1) continue;
        }
        throw e;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    vouchers: created,
    missingUnits,
    missingAccounts,
  });
}
