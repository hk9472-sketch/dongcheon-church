import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

/**
 * 엑셀 업로드를 통한 전표 일괄 등록 API
 *
 * 두 단계:
 *  1) POST /api/accounting/voucher/import (multipart/form-data, file=<xlsx>)
 *     → 서버에서 xlsx 파싱 후 "미리보기" JSON 반환 (DB 저장 없음)
 *  2) POST /api/accounting/voucher/import (application/json, { rows: [...], confirm: true })
 *     → 검증된 행들을 (회계단위, 수입지출구분, 전표일자, 전표적요) 기준으로 그룹핑하여
 *       트랜잭션 내에서 전표 + 항목들을 일괄 저장
 *
 * 엑셀 컬럼(헤더 한국어, 1행):
 *   회계단위 | 수입지출구분 | 전표일자 | 전표적요 | 계정과목 | 금액 | 적요
 *
 *   - 회계단위: 코드 또는 이름 (예: "GEN" 또는 "본회계")
 *   - 수입지출구분: "수입"/"지출" 또는 "D"/"C"
 *   - 전표일자: YYYY-MM-DD 문자열 또는 엑셀 날짜 시리얼(number)
 *   - 전표적요: 전표 전체에 대한 적요 (동일 조합이면 한 전표로 묶임)
 *   - 계정과목: 코드 또는 이름 (leaf 계정만)
 *   - 금액: 숫자 또는 "1,000" 형태 문자열 (양수)
 *   - 적요: 항목별 적요 (선택)
 */

// ───────── 유틸 ─────────

function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

/** 엑셀 날짜 시리얼(number) → "YYYY-MM-DD" */
function excelSerialToISO(serial: number): string | null {
  // Excel epoch: 1899-12-30 (1900 leap-year bug 보정)
  if (!Number.isFinite(serial) || serial < 1) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function normalizeDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return excelSerialToISO(raw);
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const dd = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    // YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
    const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) {
      const y = m[1];
      const mo = String(parseInt(m[2], 10)).padStart(2, "0");
      const dd = String(parseInt(m[3], 10)).padStart(2, "0");
      return `${y}-${mo}-${dd}`;
    }
  }
  return null;
}

function normalizeType(raw: unknown): "D" | "C" | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toUpperCase();
  if (s === "D" || s === "수입" || s === "입금") return "D";
  if (s === "C" || s === "지출" || s === "출금") return "C";
  return null;
}

function normalizeAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw) : null;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[^0-9-]/g, "");
    if (!cleaned) return null;
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function strOrEmpty(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim();
}

// ───────── 타입 ─────────

interface PreviewRow {
  rowIndex: number;
  unitRaw: string;
  typeRaw: string;
  dateRaw: string;
  headerDesc: string;
  accountRaw: string;
  amountRaw: string;
  description: string;
  // 매칭 결과
  unitId: number | null;
  type: "D" | "C" | null;
  date: string | null; // YYYY-MM-DD
  accountId: number | null;
  amount: number | null;
  errors: string[];
}

interface ImportBody {
  confirm?: boolean;
  rows?: Array<{
    unitId: number;
    type: "D" | "C";
    date: string;
    headerDesc: string;
    accountId: number;
    amount: number;
    description?: string;
  }>;
}

// xlsx 패키지를 TS 의존성 선언 없이 런타임에만 불러오기
// (CLAUDE.md delta 배포 규칙: Claude 가 npm install 하지 않음 — 서버 측 설치 가정)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadXlsx(): Promise<any> {
  try {
    // bundler 가 정적 resolve 하지 않도록 Function 으로 우회
    const req = Function("m", "return require(m)") as (m: string) => unknown;
    return req("xlsx");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_e) {
    return null;
  }
}

// ───────── POST ─────────

export async function POST(request: NextRequest) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const contentType = request.headers.get("content-type") || "";

  // ── (1) JSON confirm 단계: 실제 저장 ──
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as ImportBody;
    if (!body?.confirm || !Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json(
        { error: "저장할 행이 없습니다." },
        { status: 400 }
      );
    }
    return await commitRows(body.rows, access.user?.name ?? String(access.userId ?? ""));
  }

  // ── (2) multipart 단계: xlsx 파싱 → 미리보기 ──
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "파일 업로드는 multipart/form-data 로 전송하세요." },
      { status: 400 }
    );
  }

  const xlsx = await loadXlsx();
  if (!xlsx) {
    return NextResponse.json(
      {
        error:
          "서버에 xlsx 패키지가 설치되어 있지 않습니다. 서버에서 `npm install xlsx` 실행 후 재시작이 필요합니다.",
      },
      { status: 500 }
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let rows: Record<string, unknown>[];
  try {
    const wb = xlsx.read(buf, { type: "buffer", cellDates: true });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) throw new Error("시트가 없습니다.");
    const sheet = wb.Sheets[firstSheetName];
    rows = xlsx.utils.sheet_to_json(sheet, { defval: "" }) as Record<
      string,
      unknown
    >[];
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "엑셀 파싱 실패" },
      { status: 400 }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ rows: [], error: "데이터 행이 없습니다." });
  }

  // 매칭용 마스터 로드
  const [units, accounts] = await Promise.all([
    prisma.accUnit.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
    }),
    prisma.accAccount.findMany({
      where: { isActive: true },
      select: {
        id: true,
        unitId: true,
        code: true,
        name: true,
        type: true,
        parentId: true,
      },
    }),
  ]);

  // leaf 계정만 (parentId 로 참조되지 않는)
  const parentIdSet = new Set(
    accounts.filter((a) => a.parentId !== null).map((a) => a.parentId as number)
  );
  const leafAccounts = accounts.filter((a) => !parentIdSet.has(a.id));

  function findUnit(raw: string) {
    if (!raw) return null;
    const v = raw.trim();
    return (
      units.find((u) => u.code === v) ||
      units.find((u) => u.name === v) ||
      units.find((u) => u.code.toLowerCase() === v.toLowerCase()) ||
      units.find((u) => u.name.toLowerCase() === v.toLowerCase()) ||
      null
    );
  }

  function findAccount(unitId: number, type: "D" | "C", raw: string) {
    if (!raw) return null;
    const v = raw.trim();
    const candidates = leafAccounts.filter(
      (a) => a.unitId === unitId && a.type === type
    );
    return (
      candidates.find((a) => a.code === v) ||
      candidates.find((a) => a.name === v) ||
      candidates.find((a) => a.code.toLowerCase() === v.toLowerCase()) ||
      candidates.find((a) => a.name.toLowerCase() === v.toLowerCase()) ||
      null
    );
  }

  const preview: PreviewRow[] = rows.map((r, i) => {
    const unitRaw = strOrEmpty(r["회계단위"]);
    const typeRaw = strOrEmpty(r["수입지출구분"]);
    const dateRaw = strOrEmpty(r["전표일자"]);
    const headerDesc = strOrEmpty(r["전표적요"]);
    const accountRaw = strOrEmpty(r["계정과목"]);
    const amountRaw = strOrEmpty(r["금액"]);
    const description = strOrEmpty(r["적요"]);

    const errors: string[] = [];

    const unit = findUnit(unitRaw);
    if (!unit) errors.push("회계단위 불일치");

    const type = normalizeType(r["수입지출구분"]);
    if (!type) errors.push("수입지출구분 오류");

    const date = normalizeDate(r["전표일자"]);
    if (!date) errors.push("전표일자 오류");

    const amount = normalizeAmount(r["금액"]);
    if (amount === null || amount <= 0) errors.push("금액 오류");

    let accountId: number | null = null;
    if (unit && type) {
      const acc = findAccount(unit.id, type, accountRaw);
      if (!acc) errors.push("계정과목 불일치");
      else accountId = acc.id;
    } else if (!accountRaw) {
      errors.push("계정과목 누락");
    }

    if (!headerDesc) errors.push("전표적요 누락");

    return {
      rowIndex: i + 2, // 엑셀 기준: 1행은 헤더이므로 +2
      unitRaw,
      typeRaw,
      dateRaw,
      headerDesc,
      accountRaw,
      amountRaw,
      description,
      unitId: unit?.id ?? null,
      type,
      date,
      accountId,
      amount: amount ?? null,
      errors,
    };
  });

  // 마감월 검증 (에러가 없는 행만)
  const closingKeys = new Set<string>();
  for (const row of preview) {
    if (row.errors.length === 0 && row.unitId && row.date) {
      const [y, m] = row.date.split("-").map((x) => parseInt(x, 10));
      closingKeys.add(`${row.unitId}|${y}|${m}`);
    }
  }
  if (closingKeys.size > 0) {
    const closings = await prisma.accClosing.findMany({
      where: {
        OR: Array.from(closingKeys).map((k) => {
          const [u, y, m] = k.split("|").map((x) => parseInt(x, 10));
          return { unitId: u, year: y, month: m };
        }),
      },
    });
    const closedSet = new Set(
      closings
        .filter((c) => c.closedAt)
        .map((c) => `${c.unitId}|${c.year}|${c.month}`)
    );
    for (const row of preview) {
      if (row.errors.length === 0 && row.unitId && row.date) {
        const [y, m] = row.date.split("-").map((x) => parseInt(x, 10));
        if (closedSet.has(`${row.unitId}|${y}|${m}`)) {
          row.errors.push(`${y}년 ${m}월 마감됨`);
        }
      }
    }
  }

  const errorCount = preview.filter((r) => r.errors.length > 0).length;

  return NextResponse.json({
    total: preview.length,
    errorCount,
    rows: preview,
  });
}

// ───────── commit ─────────

async function commitRows(
  rows: NonNullable<ImportBody["rows"]>,
  createdBy: string
) {
  // 그룹핑: (unitId, type, date, headerDesc)
  const groups = new Map<
    string,
    {
      unitId: number;
      type: "D" | "C";
      date: string;
      headerDesc: string;
      items: Array<{
        accountId: number;
        amount: number;
        description: string;
      }>;
    }
  >();

  for (const r of rows) {
    if (
      typeof r.unitId !== "number" ||
      (r.type !== "D" && r.type !== "C") ||
      typeof r.date !== "string" ||
      typeof r.accountId !== "number" ||
      typeof r.amount !== "number" ||
      r.amount <= 0
    ) {
      return NextResponse.json(
        { error: "행 데이터 형식 오류" },
        { status: 400 }
      );
    }
    const key = `${r.unitId}|${r.type}|${r.date}|${r.headerDesc || ""}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        unitId: r.unitId,
        type: r.type,
        date: r.date,
        headerDesc: r.headerDesc || "",
        items: [],
      };
      groups.set(key, g);
    }
    g.items.push({
      accountId: r.accountId,
      amount: r.amount,
      description: r.description || "",
    });
  }

  // 마감월 재확인
  const closingKeys = new Set<string>();
  for (const g of groups.values()) {
    const [y, m] = g.date.split("-").map((x) => parseInt(x, 10));
    closingKeys.add(`${g.unitId}|${y}|${m}`);
  }
  if (closingKeys.size > 0) {
    const closings = await prisma.accClosing.findMany({
      where: {
        OR: Array.from(closingKeys).map((k) => {
          const [u, y, m] = k.split("|").map((x) => parseInt(x, 10));
          return { unitId: u, year: y, month: m };
        }),
      },
    });
    for (const c of closings) {
      if (c.closedAt) {
        return NextResponse.json(
          {
            error: `${c.year}년 ${c.month}월은 마감되어 전표를 추가할 수 없습니다.`,
          },
          { status: 409 }
        );
      }
    }
  }

  // 전표번호 생성 + 저장 (트랜잭션)
  async function generateVoucherNo(
    tx: Prisma.TransactionClient,
    unitId: number,
    date: Date,
    usedSeqs: Map<string, number>
  ): Promise<string> {
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
    const mapKey = `${unitId}|${dateStr}`;

    let seq = usedSeqs.get(mapKey);
    if (seq === undefined) {
      const existing = await tx.accVoucher.findMany({
        where: { unitId, voucherNo: { startsWith: dateStr } },
        orderBy: { voucherNo: "desc" },
        take: 1,
      });
      seq =
        existing.length > 0
          ? parseInt(existing[0].voucherNo.split("-")[1], 10)
          : 0;
    }
    seq += 1;
    usedSeqs.set(mapKey, seq);
    return `${dateStr}-${String(seq).padStart(3, "0")}`;
  }

  const MAX_RETRIES = 3;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const usedSeqs = new Map<string, number>();
        const results: { id: number; voucherNo: string }[] = [];

        for (const g of groups.values()) {
          const voucherDate = toDateOnly(g.date);
          const voucherNo = await generateVoucherNo(
            tx,
            g.unitId,
            voucherDate,
            usedSeqs
          );
          const totalAmount = g.items.reduce((s, it) => s + it.amount, 0);

          const v = await tx.accVoucher.create({
            data: {
              unitId: g.unitId,
              voucherNo,
              type: g.type,
              date: voucherDate,
              description: g.headerDesc || null,
              totalAmount,
              createdBy,
              items: {
                create: g.items.map((it, idx) => ({
                  seq: idx + 1,
                  accountId: it.accountId,
                  amount: it.amount,
                  description: it.description || null,
                  counterpart: null,
                })),
              },
            },
            select: { id: true, voucherNo: true },
          });
          results.push(v);
        }
        return results;
      });

      return NextResponse.json({
        ok: true,
        count: created.length,
        vouchers: created,
      });
    } catch (err) {
      lastErr = err;
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        continue;
      }
      console.error("voucher bulk import failed", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "저장 실패" },
        { status: 500 }
      );
    }
  }

  console.error("voucher bulk import failed after retries", lastErr);
  return NextResponse.json(
    { error: "전표번호 경합이 계속 발생했습니다. 잠시 후 다시 시도해 주세요." },
    { status: 503 }
  );
}
