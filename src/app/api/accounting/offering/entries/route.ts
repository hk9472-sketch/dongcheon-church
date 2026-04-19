import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess, hasMemberEdit } from "@/lib/accountAuth";

/**
 * 날짜 문자열(YYYY-MM-DD)을 UTC 자정 Date로 변환
 * @db.Date 컬럼은 날짜만 저장하므로 UTC 자정 기준으로 맞춘다
 */
function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function toNextDay(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * GET /api/accounting/offering/entries
 * 연보 내역 목록 조회
 * Query: memberId, dateFrom, dateTo, offeringType
 */
export async function GET(req: NextRequest) {
  const access = await checkAccAccess("offering");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = req.nextUrl;
  const memberId = searchParams.get("memberId");
  const singleDate = searchParams.get("date");
  const dateFrom = searchParams.get("dateFrom") || singleDate;
  const dateTo = searchParams.get("dateTo") || singleDate;
  const offeringType = searchParams.get("offeringType");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (memberId) {
    where.memberId = parseInt(memberId, 10);
  }
  if (offeringType) {
    where.offeringType = offeringType;
  }
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = toDateOnly(dateFrom);
    if (dateTo) where.date.lt = toNextDay(dateTo);
  }

  const entries = await prisma.offeringEntry.findMany({
    where,
    include: {
      member: {
        select: { id: true, name: true, groupName: true },
      },
    },
    orderBy: { date: "desc" },
  });

  // memberEdit 권한 없으면 성명 마스킹
  const canSeeName = hasMemberEdit(access.user);
  const result = canSeeName
    ? entries
    : entries.map((e) => ({
        ...e,
        member: e.member
          ? { id: e.member.id, name: "*", groupName: null }
          : null,
      }));

  return NextResponse.json(result);
}

/**
 * POST /api/accounting/offering/entries
 * 연보 내역 등록 (단건 또는 일괄)
 * Body: { entries: [{ date, memberId, offeringType, amount, description? }] }
 */
export async function POST(req: NextRequest) {
  const access = await checkAccAccess("offering");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await req.json();
  const { entries, date: commonDate } = body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json(
      { error: "entries 배열이 필요합니다" },
      { status: 400 }
    );
  }

  // 유효성 검사
  // memberId 는 선택 (null/0/undefined 허용 = 익명/개인번호없음)
  const validTypes = ["주일연보", "십일조연보", "감사연보", "특별연보", "오일연보", "절기연보", "감사", "특별", "절기", "오일"];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    // date가 개별 entry에 없으면 공통 date 사용
    if (!e.date && commonDate) e.date = commonDate;
    // memberId 정규화: 빈 문자열/0/undefined → null
    if (e.memberId === "" || e.memberId === 0 || e.memberId === undefined) {
      e.memberId = null;
    }
    if (!e.date || !e.offeringType || e.amount == null) {
      return NextResponse.json(
        { error: `entries[${i}]: date, offeringType, amount는 필수입니다` },
        { status: 400 }
      );
    }
    if (!validTypes.includes(e.offeringType)) {
      return NextResponse.json(
        { error: `entries[${i}]: 유효하지 않은 연보 유형입니다 (${validTypes.join(", ")})` },
        { status: 400 }
      );
    }
    if (typeof e.amount !== "number" || e.amount <= 0) {
      return NextResponse.json(
        { error: `entries[${i}]: 금액은 0보다 커야 합니다` },
        { status: 400 }
      );
    }
    if (e.memberId !== null && (typeof e.memberId !== "number" || e.memberId <= 0)) {
      return NextResponse.json(
        { error: `entries[${i}]: memberId는 양의 정수 또는 null이어야 합니다` },
        { status: 400 }
      );
    }
  }

  // memberId 유효성 일괄 확인 (null 제외)
  const memberIds = [
    ...new Set(
      entries
        .map((e: { memberId: number | null }) => e.memberId)
        .filter((v): v is number => typeof v === "number" && v > 0)
    ),
  ];
  if (memberIds.length > 0) {
    const existingMembers = await prisma.offeringMember.findMany({
      where: { id: { in: memberIds } },
      select: { id: true },
    });
    const existingIds = new Set(existingMembers.map((m) => m.id));
    for (const mid of memberIds) {
      if (!existingIds.has(mid)) {
        return NextResponse.json(
          { error: `교인 ID ${mid}을(를) 찾을 수 없습니다` },
          { status: 400 }
        );
      }
    }
  }

  const createdBy = access.user?.name || String(access.userId ?? "");

  const created = await prisma.offeringEntry.createMany({
    data: entries.map(
      (e: {
        date: string;
        memberId: number | null;
        offeringType: string;
        amount: number;
        description?: string;
      }) => ({
        date: toDateOnly(e.date),
        memberId: e.memberId,
        offeringType: e.offeringType,
        amount: e.amount,
        description: e.description?.trim() || null,
        createdBy,
      })
    ),
  });

  return NextResponse.json({ count: created.count }, { status: 201 });
}
