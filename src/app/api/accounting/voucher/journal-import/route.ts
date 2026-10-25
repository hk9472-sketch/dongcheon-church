import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import { toDateOnly } from "@/lib/accFund";

/**
 * 외부 회계사이트 '분개장' 가져오기
 *
 * POST /api/accounting/voucher/journal-import
 * body: {
 *   unitId, fundId (null = 기본 통장), cashCode (기본 "3004"),
 *   lines: [{ date, no, drAmt, drAcc, crAcc, crAmt, memo, party }],  // 브라우저에서 파싱한 분개장 행
 *   confirm?: boolean   // false = 미리보기, true = 저장
 * }
 *
 * 변환 규칙
 *  - (일자, 번호) 가 같은 줄 = 한 전표. 현금(cashCode) 줄은 '통장' 쪽이므로 버리고, 나머지 줄이 항목.
 *    나머지 줄이 대변이면 수입(D), 차변이면 지출(C).
 *  - 같은 일자·같은 계정에서 +x / −x 로 상쇄되는 쌍(입력 정정분)은 가져오지 않는다.
 *    단독 음수(전기세 환급 등)는 실제 입금이므로 음수 항목으로 그대로 가져온다.
 *  - 계정은 같은 회계단위 안에서 '코드'로 매칭. 매칭된 계정이 하위를 가진 상위 계정이면
 *    절기 하위(부활/맥추/추수/성탄)를 월로 고른다: 1~5월 부활, 6~8월 맥추, 9~11월 추수, 12월 성탄.
 *  - externalRef = "분개장:일자#번호" 로 저장 → 다시 올려도 중복 생성되지 않음.
 */

interface Line {
  date: string;
  no: string;
  drAmt: number;
  drAcc: string;
  crAcc: string;
  crAmt: number;
  memo: string;
  party: string;
}

interface Body {
  unitId?: number;
  fundId?: number | null;
  cashCode?: string;
  lines?: Line[];
  confirm?: boolean;
}

const SEASON_BY_MONTH = (m: number) =>
  m <= 5 ? "부활감사" : m <= 8 ? "맥추감사" : m <= 11 ? "추수감사" : "성탄감사";

function parseAcc(cell: string): { code: string; name: string } | null {
  const m = /^\s*\[(\w+)\]\s*(.*)$/.exec(cell || "");
  return m ? { code: m[1], name: m[2].trim() } : null;
}

export async function POST(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const unitId = Number(body.unitId);
  const cashCode = String(body.cashCode || "3004").trim();
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!unitId || lines.length === 0) {
    return NextResponse.json({ error: "회계단위와 분개장 데이터가 필요합니다." }, { status: 400 });
  }

  let fundId: number | null = null;
  if (body.fundId) {
    const f = await prisma.accFund.findUnique({ where: { id: Number(body.fundId) } });
    if (!f || f.unitId !== unitId) {
      return NextResponse.json({ error: "통장이 이 회계단위에 속하지 않습니다." }, { status: 400 });
    }
    fundId = f.id;
  }

  const accounts = await prisma.accAccount.findMany({ where: { unitId } });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const childrenOf = new Map<number, typeof accounts>();
  for (const a of accounts) {
    if (a.parentId) childrenOf.set(a.parentId, [...(childrenOf.get(a.parentId) || []), a]);
  }

  // ── 1) (일자, 번호) 로 묶기 ──
  const groups = new Map<string, Line[]>();
  for (const l of lines) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date || "")) continue;
    // 계정·금액이 모두 빈 줄(외부 사이트의 빈 전표 잔재)은 무시
    if (!(l.drAcc || "").trim() && !(l.crAcc || "").trim() && !l.drAmt && !l.crAmt) continue;
    const key = `${l.date}#${l.no}`;
    groups.set(key, [...(groups.get(key) || []), l]);
  }

  type Item = { code: string; extName: string; accountId: number | null; accountLabel: string; amount: number; memo: string; party: string };
  type Voucher = { ref: string; date: string; no: string; type: "D" | "C"; items: Item[]; errors: string[] };
  const vouchers: Voucher[] = [];

  for (const [ref, ls] of groups) {
    const [date, no] = ref.split("#");
    const errors: string[] = [];
    const cashLines = ls.filter((l) => parseAcc(l.drAcc)?.code === cashCode || parseAcc(l.crAcc)?.code === cashCode);
    const others = ls.filter((l) => !cashLines.includes(l));
    if (cashLines.length === 0) errors.push(`현금(${cashCode}) 줄 없음 — 지원하지 않는 형식`);
    const sides = new Set(others.map((l) => (parseAcc(l.crAcc) ? "cr" : "dr")));
    if (sides.size !== 1) errors.push("수입·지출이 섞인 전표 — 지원하지 않는 형식");
    const type: "D" | "C" = sides.has("cr") ? "D" : "C";
    const month = parseInt(date.slice(5, 7), 10);

    const items: Item[] = others.map((l) => {
      const acc = parseAcc(type === "D" ? l.crAcc : l.drAcc);
      const amount = type === "D" ? l.crAmt : l.drAmt;
      if (!acc) errors.push(`계정 표기 형식 오류: '${type === "D" ? l.crAcc : l.drAcc}'`);
      let target = acc ? byCode.get(acc.code) : undefined;
      if (target && childrenOf.has(target.id)) {
        const season = SEASON_BY_MONTH(month);
        target = childrenOf.get(target.id)!.find((c) => c.name === season) ?? undefined;
        if (!target) errors.push(`${acc!.code} 은 상위 계정 — 하위 '${season}' 없음`);
      }
      if (acc && !target && !childrenOf.has(byCode.get(acc.code)?.id ?? -1)) {
        errors.push(`계정 ${acc.code} ${acc.name} 없음`);
      }
      if (target && target.type !== type) errors.push(`계정 ${target.code} 의 수입/지출 구분 불일치`);
      return {
        code: acc?.code || "?",
        extName: acc?.name || "",
        accountId: target?.id ?? null,
        accountLabel: target ? `${target.code} ${target.name}` : "",
        amount: Number(amount) || 0,
        memo: (l.memo || "").trim(),
        party: (l.party || "").trim(),
      };
    });
    if (items.length === 0) errors.push("항목 없음");
    vouchers.push({ ref, date, no, type, items, errors });
  }

  // ── 2) 상쇄 쌍 제외: 항목 1개 전표끼리 (일자, 계정, 구분, |금액|) 에서 + 와 − 를 짝지음 ──
  const excluded = new Set<string>();
  const bucket = new Map<string, { pos: Voucher[]; neg: Voucher[] }>();
  for (const v of vouchers) {
    if (v.items.length !== 1 || v.errors.length) continue;
    const it = v.items[0];
    if (it.amount === 0) continue;
    const k = `${v.date}|${it.code}|${v.type}|${Math.abs(it.amount)}`;
    const b = bucket.get(k) || { pos: [], neg: [] };
    (it.amount > 0 ? b.pos : b.neg).push(v);
    bucket.set(k, b);
  }
  const pairs: Array<{ date: string; code: string; name: string; amount: number; memo: string }> = [];
  for (const b of bucket.values()) {
    const n = Math.min(b.pos.length, b.neg.length);
    for (let i = 0; i < n; i++) {
      excluded.add(b.pos[i].ref);
      excluded.add(b.neg[i].ref);
      const it = b.pos[i].items[0];
      pairs.push({ date: b.pos[i].date, code: it.code, name: it.extName, amount: it.amount, memo: it.memo });
    }
  }

  // ── 3) 이미 가져온 전표 / 마감월 ──
  const refs = vouchers.map((v) => `분개장:${v.ref}`);
  const existing = await prisma.accVoucher.findMany({
    where: { unitId, externalRef: { in: refs } },
    select: { externalRef: true },
  });
  const existingSet = new Set(existing.map((e) => e.externalRef));
  const closings = await prisma.accClosing.findMany({ where: { unitId, closedAt: { not: null } } });
  const closedSet = new Set(closings.map((c) => `${c.year}-${String(c.month).padStart(2, "0")}`));

  const importable: Voucher[] = [];
  let duplicates = 0;
  for (const v of vouchers) {
    if (excluded.has(v.ref)) continue;
    if (existingSet.has(`분개장:${v.ref}`)) {
      duplicates++;
      continue;
    }
    if (closedSet.has(v.date.slice(0, 7))) v.errors.push(`${v.date.slice(0, 7)} 마감됨`);
    if (v.errors.length === 0) importable.push(v);
  }
  const errorVouchers = vouchers.filter((v) => v.errors.length > 0 && !excluded.has(v.ref));

  // 계정별 요약 (가져올 전표 기준)
  const summary = new Map<string, { code: string; extName: string; accountLabel: string; type: string; count: number; amount: number }>();
  for (const v of importable) {
    for (const it of v.items) {
      const k = `${it.code}|${it.accountLabel}`;
      const s = summary.get(k) || { code: it.code, extName: it.extName, accountLabel: it.accountLabel, type: v.type, count: 0, amount: 0 };
      s.count++;
      s.amount += it.amount;
      summary.set(k, s);
    }
  }
  const sumType = (t: "D" | "C") =>
    importable.filter((v) => v.type === t).reduce((s, v) => s + v.items.reduce((a, i) => a + i.amount, 0), 0);

  const preview = {
    totalVouchers: vouchers.length,
    importCount: importable.length,
    excludedPairs: pairs.sort((a, b) => a.date.localeCompare(b.date)),
    duplicates,
    errors: errorVouchers.map((v) => ({ ref: v.ref, errors: v.errors })),
    accounts: Array.from(summary.values()).sort((a, b) => a.code.localeCompare(b.code)),
    incomeTotal: sumType("D"),
    expenseTotal: sumType("C"),
    dateFrom: importable.map((v) => v.date).sort()[0] ?? null,
    dateTo: importable.map((v) => v.date).sort().slice(-1)[0] ?? null,
  };

  if (!body.confirm) return NextResponse.json(preview);

  if (errorVouchers.length > 0) {
    return NextResponse.json({ error: `오류 전표 ${errorVouchers.length}건을 먼저 해결하세요.`, ...preview }, { status: 400 });
  }
  if (importable.length === 0) {
    return NextResponse.json({ error: "가져올 전표가 없습니다.", ...preview }, { status: 400 });
  }

  // ── 4) 저장 — 일자별 전표번호 이어서 채번, 한 트랜잭션 ──
  const createdBy = access.user?.name ?? String(access.userId ?? "");
  importable.sort((a, b) => (a.date === b.date ? a.no.localeCompare(b.no) : a.date.localeCompare(b.date)));
  try {
    const count = await prisma.$transaction(
      async (tx) => {
        const seqByDate = new Map<string, number>();
        let n = 0;
        for (const v of importable) {
          const ds = v.date.replace(/-/g, "");
          let seq = seqByDate.get(ds);
          if (seq === undefined) {
            const last = await tx.accVoucher.findFirst({
              where: { unitId, voucherNo: { startsWith: ds } },
              orderBy: { voucherNo: "desc" },
              select: { voucherNo: true },
            });
            seq = last ? parseInt(last.voucherNo.split("-")[1], 10) : 0;
          }
          seq += 1;
          seqByDate.set(ds, seq);
          const memo = v.items.map((i) => i.memo).find(Boolean) || null;
          await tx.accVoucher.create({
            data: {
              unitId,
              voucherNo: `${ds}-${String(seq).padStart(3, "0")}`,
              type: v.type,
              date: toDateOnly(v.date),
              description: memo,
              totalAmount: v.items.reduce((s, i) => s + i.amount, 0),
              fundId,
              externalRef: `분개장:${v.ref}`,
              createdBy,
              items: {
                create: v.items.map((it, idx) => ({
                  seq: idx + 1,
                  accountId: it.accountId!,
                  amount: it.amount,
                  description: it.memo || null,
                  counterpart: it.party || null,
                })),
              },
            },
          });
          n++;
        }
        return n;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    return NextResponse.json({ ok: true, created: count, ...preview });
  } catch (e) {
    console.error("[journal-import] 저장 실패:", e);
    return NextResponse.json(
      { error: "저장 중 오류가 발생했습니다. 전체 취소되었습니다 — 다시 시도하세요." },
      { status: 500 },
    );
  }
}
