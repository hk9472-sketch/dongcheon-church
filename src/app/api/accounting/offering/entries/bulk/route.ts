import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

/**
 * POST /api/accounting/offering/entries/bulk
 *
 * Body: {
 *   date: "YYYY-MM-DD",  // 신규 entries 의 공통 일자 (필수)
 *   creates: [{ memberId?, offeringType, amount, description? }],
 *   updates: [{ id, memberId?, offeringType, amount, description? }],
 *   deletes: number[]    // OfferingEntry.id 배열
 * }
 *
 * 모두 단일 트랜잭션. 한 항목이라도 실패하면 전체 롤백 → 부분 저장 사고 방지.
 * 응답:
 *   { ok: true, creates: [{ id, offeringType, ... }], updateCount, deleteCount }
 *
 * multi-entry 페이지의 [전체 저장] 이 이 라우트 1회 호출로 모든 dirty 행을 처리.
 */

function toDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

const VALID_TYPES = [
  "주일연보",
  "십일조연보",
  "감사연보",
  "특별연보",
  "오일연보",
  "절기연보",
  "감사",
  "특별",
  "절기",
  "오일",
];

interface CreateItem {
  memberId?: number | null;
  offeringType: string;
  amount: number;
  description?: string | null;
}
interface UpdateItem extends CreateItem {
  id: number;
}

export async function POST(req: NextRequest) {
  const access = await checkAccAccess("offering");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: {
    date?: string;
    creates?: CreateItem[];
    updates?: UpdateItem[];
    deletes?: number[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const dateStr = body.date;
  const creates = Array.isArray(body.creates) ? body.creates : [];
  const updates = Array.isArray(body.updates) ? body.updates : [];
  const deletes = Array.isArray(body.deletes) ? body.deletes : [];

  if (creates.length + updates.length + deletes.length === 0) {
    return NextResponse.json({ error: "처리할 항목 없음" }, { status: 400 });
  }
  if (creates.length > 0 && !dateStr) {
    return NextResponse.json({ error: "신규 항목에는 date 필요" }, { status: 400 });
  }

  // 유효성
  for (let i = 0; i < creates.length; i++) {
    const c = creates[i];
    if (!VALID_TYPES.includes(c.offeringType)) {
      return NextResponse.json(
        { error: `creates[${i}].offeringType 잘못됨` },
        { status: 400 },
      );
    }
    if (typeof c.amount !== "number" || c.amount <= 0) {
      return NextResponse.json(
        { error: `creates[${i}].amount > 0` },
        { status: 400 },
      );
    }
  }
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    if (!Number.isInteger(u.id) || u.id <= 0) {
      return NextResponse.json({ error: `updates[${i}].id 잘못됨` }, { status: 400 });
    }
    if (!VALID_TYPES.includes(u.offeringType)) {
      return NextResponse.json(
        { error: `updates[${i}].offeringType 잘못됨` },
        { status: 400 },
      );
    }
    if (typeof u.amount !== "number" || u.amount <= 0) {
      return NextResponse.json(
        { error: `updates[${i}].amount > 0` },
        { status: 400 },
      );
    }
  }
  for (const id of deletes) {
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "deletes 에 잘못된 id" }, { status: 400 });
    }
  }

  const createdBy = access.user?.name || String(access.userId ?? "");
  const date = dateStr ? toDateOnly(dateStr) : null;

  // 모두 한 트랜잭션. 한 건이라도 실패하면 전부 롤백.
  // ★ 대량(100+건) 처리 대비:
  //   · 인터랙티브 트랜잭션 기본 timeout 5초 → 30초로 상향(대량 입력 시 P2028 방지)
  //   · 전체를 try/catch 로 감싸 미처리 예외로 500 크래시(→ 클라가 "로그인" 등으로 오인) 방지,
  //     원인별로 친절한 메시지 반환. 트랜잭션이라 실패 시 부분 저장 없이 전부 롤백 → 데이터 일관성 유지.
  let result: { creates: Array<{ id: number; offeringType: string; amount: number }>; updateCount: number; deleteCount: number };
  try {
    result = await prisma.$transaction(
      async (tx) => {
        // DELETE
        if (deletes.length > 0) {
          await tx.offeringEntry.deleteMany({
            where: { id: { in: deletes } },
          });
        }
        // UPDATE
        for (const u of updates) {
          await tx.offeringEntry.update({
            where: { id: u.id },
            data: {
              memberId: u.memberId ?? null,
              offeringType: u.offeringType,
              amount: u.amount,
              description: u.description?.toString().trim() || null,
            },
          });
        }
        // CREATE — 응답에 id 포함
        const created: Array<{ id: number; offeringType: string; amount: number }> = [];
        for (const c of creates) {
          const row = await tx.offeringEntry.create({
            data: {
              date: date!,
              memberId: c.memberId ?? null,
              offeringType: c.offeringType,
              amount: c.amount,
              description: c.description?.toString().trim() || null,
              createdBy,
            },
            select: { id: true, offeringType: true, amount: true },
          });
          created.push(row);
        }
        return {
          creates: created,
          updateCount: updates.length,
          deleteCount: deletes.length,
        };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (e) {
    console.error("[offering/entries/bulk] 저장 실패:", e);
    const msg = e instanceof Error ? e.message : String(e);
    let userMsg = "저장 중 오류가 발생했습니다. 입력 내용은 그대로 보존됩니다 — 잠시 후 다시 저장하세요.";
    if (/too long|P2000|Data too long/i.test(msg)) {
      userMsg = "일부 행의 비고가 너무 깁니다(1000자 이내로). 해당 행을 줄여 다시 저장하세요.";
    } else if (/P2028|timed out|timeout/i.test(msg)) {
      userMsg = "처리량이 많아 시간이 초과됐습니다. 기간/건수를 나눠 저장하거나 다시 시도하세요.";
    } else if (/P2024|connection pool|Timed out fetching/i.test(msg)) {
      userMsg = "서버가 일시적으로 바쁩니다. 입력은 보존됩니다 — 잠시 후 다시 저장하세요.";
    }
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...result }, { status: 201 });
}
