import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess, hasMemberEdit } from "@/lib/accountAuth";
import { attachMember } from "@/lib/offeringMemberJoin";

/**
 * 날짜 문자열(YYYY-MM-DD)을 UTC 자정 Date로 변환
 * @db.Date 컬럼은 날짜만 저장하므로 UTC 자정 기준으로 맞춘다
 */
function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/accounting/offering/entries/[id]
 * 연보 내역 단건 조회
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const access = await checkAccAccess("offering");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const entryId = parseInt(id, 10);
  if (isNaN(entryId))
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const rawEntry = await prisma.offeringEntry.findUnique({
    where: { id: entryId },
  });

  if (!rawEntry) {
    return NextResponse.json({ error: "연보 내역을 찾을 수 없습니다" }, { status: 404 });
  }

  const entry = await attachMember(rawEntry);
  const canSeeName = hasMemberEdit(access.user);
  const result = canSeeName
    ? entry
    : {
        ...entry,
        member: entry.member
          ? { id: entry.member.id, name: "*", groupName: null }
          : null,
      };

  return NextResponse.json(result);
}

/**
 * PUT /api/accounting/offering/entries/[id]
 * 연보 내역 수정
 * Body: { date?, memberId?, offeringType?, amount?, description? }
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const access = await checkAccAccess("offering");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const entryId = parseInt(id, 10);
  if (isNaN(entryId))
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const existing = await prisma.offeringEntry.findUnique({
    where: { id: entryId },
  });
  if (!existing) {
    return NextResponse.json({ error: "연보 내역을 찾을 수 없습니다" }, { status: 404 });
  }

  const body = await req.json();
  const { date, memberId, offeringType, amount, description } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};

  if (date !== undefined) {
    data.date = toDateOnly(date);
  }
  if (memberId !== undefined) {
    // null/0/빈문자열 → null (익명)
    if (memberId === null || memberId === 0 || memberId === "") {
      data.memberId = null;
    } else {
      if (typeof memberId !== "number" || memberId <= 0) {
        return NextResponse.json(
          { error: "memberId는 양의 정수 또는 null이어야 합니다" },
          { status: 400 }
        );
      }
      // 미등록 번호 허용 — soft FK
      data.memberId = memberId;
    }
  }
  if (offeringType !== undefined) {
    // POST와 동일한 유효 타입 목록 사용
    const validTypes = ["주일연보", "십일조연보", "감사연보", "특별연보", "오일연보", "절기연보", "감사", "특별", "절기", "오일"];
    if (!validTypes.includes(offeringType)) {
      return NextResponse.json(
        { error: `유효하지 않은 연보 유형입니다 (${validTypes.join(", ")})` },
        { status: 400 }
      );
    }
    data.offeringType = offeringType;
  }
  if (amount !== undefined) {
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "금액은 0보다 커야 합니다" },
        { status: 400 }
      );
    }
    data.amount = amount;
  }
  if (description !== undefined) {
    data.description = description?.trim() || null;
  }

  const updated = await prisma.offeringEntry.update({
    where: { id: entryId },
    data,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/accounting/offering/entries/[id]
 * 연보 내역 삭제
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const access = await checkAccAccess("offering");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const entryId = parseInt(id, 10);
  if (isNaN(entryId))
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const existing = await prisma.offeringEntry.findUnique({
    where: { id: entryId },
  });
  if (!existing) {
    return NextResponse.json({ error: "연보 내역을 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.offeringEntry.delete({ where: { id: entryId } });

  return NextResponse.json({ success: true });
}
