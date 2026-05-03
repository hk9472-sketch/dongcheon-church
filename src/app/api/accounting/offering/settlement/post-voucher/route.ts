import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

// POST /api/accounting/offering/settlement/post-voucher
// body: { date, unitId, sundaySchool, seasonType }
//   해당 일자의 OfferingEntry 카테고리 합계 + 주일학교를 수입(D) 전표 1건으로 생성.
//   각 카테고리 → 같은 이름의 AccAccount 매칭 (대상 회계단위 안에서).
//   절기 금액 > 0 이면 seasonType (부활감사/맥추감사/추수감사/성탄감사) 으로 매칭.

const SEASON_TYPES = ["부활감사", "맥추감사", "추수감사", "성탄감사"] as const;
type SeasonType = (typeof SEASON_TYPES)[number];

interface CategoryMapping {
  /** OfferingEntry.offeringType 값 */
  offeringType: string | null; // null = 주일학교(외부 입력)
  /** 매칭할 계정과목 이름 후보들 (첫 매치 사용) */
  accountNames: string[];
}

const CATEGORY_MAP: Record<string, CategoryMapping> = {
  tithe: { offeringType: "십일조연보", accountNames: ["십일조연보", "십일조"] },
  sunday: { offeringType: "주일연보", accountNames: ["주일연보", "주일"] },
  thanks: { offeringType: "감사연보", accountNames: ["감사연보", "감사"] },
  special: { offeringType: "특별연보", accountNames: ["특별연보", "특별"] },
  oil: { offeringType: "오일연보", accountNames: ["오일연보", "오일"] },
  // season 은 동적 (seasonType 으로 결정)
  sundaySchool: { offeringType: null, accountNames: ["주일학교"] },
};

export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  let body: {
    date?: string;
    unitId?: number;
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

  const unitId = typeof body.unitId === "number" ? body.unitId : 0;
  if (!unitId)
    return NextResponse.json({ error: "회계단위(unitId) 필수" }, { status: 400 });

  // 해당 일자의 OfferingEntry 합계 (UTC 기준)
  const dayStart = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const rows = await prisma.offeringEntry.groupBy({
    by: ["offeringType"],
    where: { date: { gte: dayStart, lt: dayEnd } },
    _sum: { amount: true },
  });

  const categorySums: Record<string, number> = {
    "십일조연보": 0,
    "주일연보": 0,
    "감사연보": 0,
    "특별연보": 0,
    "오일연보": 0,
    "절기연보": 0,
  };
  for (const r of rows) {
    if (r.offeringType in categorySums) {
      categorySums[r.offeringType] = r._sum.amount ?? 0;
    }
  }

  const sundaySchool =
    typeof body.sundaySchool === "number" && body.sundaySchool >= 0
      ? Math.floor(body.sundaySchool)
      : 0;

  // 절기 매핑: 금액 > 0 이면 seasonType 필수
  const seasonAmount = categorySums["절기연보"];
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

  // 각 카테고리에 해당하는 AccAccount 찾기. 항목별로 (offeringType, accountId, amount).
  type Item = { name: string; accountId: number; amount: number };
  const items: Item[] = [];
  const missing: string[] = [];

  async function findAccount(names: string[]): Promise<number | null> {
    for (const n of names) {
      const a = await prisma.accAccount.findFirst({
        where: { unitId, name: n, type: "D", isActive: true },
      });
      if (a) return a.id;
    }
    return null;
  }

  // 십일조, 주일, 감사, 특별, 오일
  const standardKeys = ["tithe", "sunday", "thanks", "special", "oil"] as const;
  for (const k of standardKeys) {
    const map = CATEGORY_MAP[k];
    if (!map.offeringType) continue;
    const amt = categorySums[map.offeringType];
    if (amt <= 0) continue;
    const accId = await findAccount(map.accountNames);
    if (!accId) {
      missing.push(map.offeringType);
      continue;
    }
    items.push({ name: map.offeringType, accountId: accId, amount: amt });
  }

  // 절기 (선택된 seasonType 으로)
  if (seasonAmount > 0 && seasonType) {
    const accId = await findAccount([seasonType, "절기연보", "절기"]);
    if (!accId) missing.push(seasonType);
    else items.push({ name: seasonType, accountId: accId, amount: seasonAmount });
  }

  // 주일학교
  if (sundaySchool > 0) {
    const accId = await findAccount(CATEGORY_MAP.sundaySchool.accountNames);
    if (!accId) missing.push("주일학교");
    else items.push({ name: "주일학교", accountId: accId, amount: sundaySchool });
  }

  if (items.length === 0) {
    return NextResponse.json(
      { error: "반영할 금액이 없습니다." + (missing.length ? ` 또는 계정과목 미설정: ${missing.join(", ")}` : "") },
      { status: 400 },
    );
  }

  // 마감 여부
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const closing = await prisma.accClosing.findUnique({
    where: { unitId_year_month: { unitId, year, month } },
  });
  if (closing && closing.closedAt) {
    return NextResponse.json(
      { error: `${year}년 ${month}월은 마감되어 전표를 추가할 수 없습니다.` },
      { status: 409 },
    );
  }

  const operatorName = acc.user?.name ?? acc.user?.userId ?? "결산";
  const totalAmount = items.reduce((s, i) => s + i.amount, 0);

  // 전표번호 채번 (재시도 포함)
  const dateNoStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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
          include: { items: true },
        });
        return voucher;
      });

      return NextResponse.json({
        ok: true,
        voucher: { id: result.id, voucherNo: result.voucherNo },
        items: result.items.length,
        missing,
      });
    } catch (e) {
      // 전표번호 충돌 재시도
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        if (attempt < MAX_RETRIES - 1) continue;
      }
      throw e;
    }
  }
  return NextResponse.json({ error: "전표 생성 실패" }, { status: 500 });
}
