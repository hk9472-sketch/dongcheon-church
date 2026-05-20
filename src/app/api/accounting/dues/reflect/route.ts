import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

const ALLOWED_CATEGORIES = new Set(["전도회", "건축"]);

/**
 * POST /api/accounting/dues/reflect
 * body: {
 *   category: "전도회"|"건축",
 *   from: "YYYY-MM-DD", to: "YYYY-MM-DD",
 *   mode: "summary" | "row",    // summary = 한 voucher 합계 / row = 일자별 voucher
 * }
 *
 * 동작:
 *  - DuesAccountMapping 으로 unitId + accountId 결정
 *  - MonthlyDuesDeposit (category, date 범위) 조회
 *  - mode=summary: 한 voucher (date=to) + 합계 amount 한 item
 *  - mode=row: 일자별 voucher + 그 일자의 item 들 (회원별)
 *
 * 응답: { ok, voucherCount, totalAmount }
 */
export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("ledger");
  if (!acc.ok) return NextResponse.json({ message: acc.error }, { status: acc.status });
  const user = acc.user;

  const body = await req.json().catch(() => ({}));
  const category = String(body?.category || "");
  const fromStr = String(body?.from || "");
  const toStr = String(body?.to || "");
  const mode = (body?.mode === "row" ? "row" : "summary") as "row" | "summary";

  if (!ALLOWED_CATEGORIES.has(category)) {
    return NextResponse.json({ message: "category 는 전도회 또는 건축" }, { status: 400 });
  }
  if (!fromStr || !toStr) {
    return NextResponse.json({ message: "from, to 필요" }, { status: 400 });
  }

  // OfferingAccountMapping 재사용 — offeringKey="duesJeondo" | "duesBuild"
  const offeringKey = category === "전도회" ? "duesJeondo" : "duesBuild";
  const om = await prisma.offeringAccountMapping.findUnique({ where: { offeringKey } });
  if (!om) {
    return NextResponse.json({ message: `${category} 의 회계 계정 매핑이 없습니다. 연보 계정과목 매핑에서 "${offeringKey === "duesJeondo" ? "전도회 월정입금" : "건축 월정입금"}" 항목을 먼저 설정하세요.` }, { status: 400 });
  }
  const account = await prisma.accAccount.findUnique({
    where: { id: om.accountId },
    select: { id: true, unitId: true, isActive: true, type: true },
  });
  if (!account || !account.isActive || account.type !== "D") {
    return NextResponse.json({ message: "매핑된 계정이 비활성이거나 수입(D)이 아닙니다." }, { status: 400 });
  }
  const mapping = { unitId: account.unitId, accountId: account.id };

  const from = new Date(fromStr + "T00:00:00.000Z");
  const to = new Date(toStr + "T23:59:59.999Z");

  const deposits = await prisma.monthlyDuesDeposit.findMany({
    where: { category, date: { gte: from, lte: to } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  if (deposits.length === 0) {
    return NextResponse.json({ message: "기간 내 입금이 없습니다." }, { status: 400 });
  }

  // 회원 이름 조회 (counterpart 용)
  const memberIds = Array.from(new Set(deposits.map((d) => d.memberId)));
  const members = await prisma.monthlyDuesMember.findMany({
    where: { category, id: { in: memberIds } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(members.map((m) => [m.id, m.name]));

  const username = String(user?.userId || `user#${user?.id ?? ""}`);
  const createdVoucherIds: number[] = [];
  let totalAmount = 0;

  if (mode === "summary") {
    // 한 voucher — 합계
    const sum = deposits.reduce((s, d) => s + d.amount, 0);
    totalAmount = sum;

    // voucherNo 생성: YYYYMMDD-순번
    const dateKey = toStr.replace(/-/g, "");
    const last = await prisma.accVoucher.findFirst({
      where: { unitId: mapping.unitId, voucherNo: { startsWith: dateKey + "-" } },
      orderBy: { voucherNo: "desc" },
      select: { voucherNo: true },
    });
    const lastSeq = last ? parseInt(last.voucherNo.split("-")[1] || "0", 10) : 0;
    const voucherNo = `${dateKey}-${String(lastSeq + 1).padStart(3, "0")}`;

    const v = await prisma.accVoucher.create({
      data: {
        unitId: mapping.unitId,
        voucherNo,
        type: "D",
        date: new Date(toStr + "T00:00:00.000Z"),
        description: `${category} 월정입금 합계 (${fromStr} ~ ${toStr})`,
        totalAmount: sum,
        createdBy: username,
        items: {
          create: {
            seq: 1,
            accountId: mapping.accountId,
            amount: sum,
            description: `${category} ${deposits.length}건 합계`,
          },
        },
      },
    });
    createdVoucherIds.push(v.id);
  } else {
    // 일자별 voucher
    const byDate = new Map<string, typeof deposits>();
    for (const d of deposits) {
      const k = d.date.toISOString().slice(0, 10);
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k)!.push(d);
    }

    for (const [dateStr, rows] of Array.from(byDate.entries()).sort()) {
      const sum = rows.reduce((s, r) => s + r.amount, 0);
      totalAmount += sum;
      const dateKey = dateStr.replace(/-/g, "");
      const last = await prisma.accVoucher.findFirst({
        where: { unitId: mapping.unitId, voucherNo: { startsWith: dateKey + "-" } },
        orderBy: { voucherNo: "desc" },
        select: { voucherNo: true },
      });
      const lastSeq = last ? parseInt(last.voucherNo.split("-")[1] || "0", 10) : 0;
      const voucherNo = `${dateKey}-${String(lastSeq + 1).padStart(3, "0")}`;

      const v = await prisma.accVoucher.create({
        data: {
          unitId: mapping.unitId,
          voucherNo,
          type: "D",
          date: new Date(dateStr + "T00:00:00.000Z"),
          description: `${category} 월정입금 (${rows.length}건)`,
          totalAmount: sum,
          createdBy: username,
          items: {
            create: rows.map((r, i) => ({
              seq: i + 1,
              accountId: mapping.accountId,
              amount: r.amount,
              description: r.description || `${r.installment}월분`,
              counterpart: nameMap.get(r.memberId) || `회원#${r.memberId}`,
            })),
          },
        },
      });
      createdVoucherIds.push(v.id);
    }
  }

  return NextResponse.json({
    ok: true,
    voucherCount: createdVoucherIds.length,
    totalAmount,
    depositCount: deposits.length,
  });
}
