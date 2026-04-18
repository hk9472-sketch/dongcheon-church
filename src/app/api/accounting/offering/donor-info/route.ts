import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess, hasMemberEdit } from "@/lib/accountAuth";

// 기부금영수증용 기부자 정보 (주민번호/주소/연락처/이메일).
// 주민등록번호는 개인정보보호법상 고유식별정보 → memberEdit 권한 있는 회계 관리자만 접근.

function maskResident(n: string | null | undefined): string | null {
  if (!n) return null;
  // 000000-0****** 형식으로 마스킹 (앞6자리 + 성별코드 1자리만 노출)
  const digits = n.replace(/-/g, "");
  if (digits.length < 7) return n;
  const front = digits.slice(0, 6);
  const genderDigit = digits.charAt(6);
  return `${front}-${genderDigit}******`;
}

// GET /api/accounting/offering/donor-info?memberId=123
//   단일 조회 (마스킹/원본 옵션)
// GET /api/accounting/offering/donor-info?search=김&page=1&limit=50
//   목록 조회
export async function GET(request: NextRequest) {
  const access = await checkAccAccess("offering");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const editor = access.user ? hasMemberEdit(access.user) : false;

  const { searchParams } = new URL(request.url);
  const memberIdStr = searchParams.get("memberId");
  const reveal = searchParams.get("reveal") === "1" && editor;

  if (memberIdStr) {
    const id = parseInt(memberIdStr, 10);
    const m = await prisma.offeringMember.findUnique({
      where: { id },
      select: {
        id: true,
        name: editor ? true : false,
        groupName: true,
        residentNumber: true,
        address: true,
        phone: true,
        donorEmail: true,
      },
    });
    if (!m) return NextResponse.json({ error: "교인을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({
      id: m.id,
      name: editor ? m.name : null,
      groupName: m.groupName,
      residentNumber: reveal ? m.residentNumber : maskResident(m.residentNumber),
      address: m.address,
      phone: m.phone,
      donorEmail: m.donorEmail,
    });
  }

  // 목록
  const search = searchParams.get("search") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

  const where = search
    ? { OR: [{ name: { contains: search } }, { groupName: { contains: search } }] }
    : {};

  const [total, rows] = await Promise.all([
    prisma.offeringMember.count({ where }),
    prisma.offeringMember.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: editor ? true : false,
        groupName: true,
        residentNumber: true,
        address: true,
        phone: true,
        donorEmail: true,
      },
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    limit,
    rows: rows.map((m) => ({
      id: m.id,
      name: editor ? m.name : null,
      groupName: m.groupName,
      residentNumber: maskResident(m.residentNumber),
      hasResidentNumber: !!m.residentNumber,
      address: m.address,
      phone: m.phone,
      donorEmail: m.donorEmail,
    })),
  });
}

// PUT /api/accounting/offering/donor-info
// Body: { memberId, residentNumber?, address?, phone?, donorEmail? }
// null/"" 로 보내면 해당 필드 초기화.
export async function PUT(request: NextRequest) {
  const access = await checkAccAccess("offering");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.user || !hasMemberEdit(access.user)) {
    return NextResponse.json(
      { error: "기부자 정보 수정 권한이 없습니다. (관리번호 수정 권한 필요)" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { memberId, residentNumber, address, phone, donorEmail } = body;

  if (!memberId || typeof memberId !== "number") {
    return NextResponse.json({ error: "memberId는 필수입니다." }, { status: 400 });
  }

  const exists = await prisma.offeringMember.findUnique({ where: { id: memberId } });
  if (!exists) {
    return NextResponse.json({ error: "교인을 찾을 수 없습니다." }, { status: 404 });
  }

  // 주민번호 형식 검증 (입력된 경우만)
  if (residentNumber != null && residentNumber !== "") {
    const normalized = String(residentNumber).replace(/\s/g, "");
    // 6자리-7자리 또는 13자리 숫자
    if (!/^\d{6}-?\d{7}$/.test(normalized)) {
      return NextResponse.json(
        { error: "주민등록번호 형식이 올바르지 않습니다 (000000-0000000)." },
        { status: 400 }
      );
    }
  }

  if (donorEmail != null && donorEmail !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(donorEmail))) {
    return NextResponse.json({ error: "이메일 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // 빈 문자열은 null 로 저장 (컬럼 초기화)
  const normalize = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  const residentNorm = normalize(residentNumber);
  const addressNorm = normalize(address);
  const phoneNorm = normalize(phone);
  const emailNorm = normalize(donorEmail);

  // 주민번호 저장 시 하이픈 통일
  let rrn: string | null = residentNorm;
  if (rrn && !/^\d{6}-\d{7}$/.test(rrn)) {
    rrn = `${rrn.slice(0, 6)}-${rrn.slice(6)}`;
  }

  await prisma.offeringMember.update({
    where: { id: memberId },
    data: {
      ...(residentNumber !== undefined ? { residentNumber: rrn } : {}),
      ...(address !== undefined ? { address: addressNorm } : {}),
      ...(phone !== undefined ? { phone: phoneNorm } : {}),
      ...(donorEmail !== undefined ? { donorEmail: emailNorm } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
