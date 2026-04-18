import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

// 기부금영수증 발급자 정보 (국세청 서식 29호 필수 항목).
// SiteSetting 에 church_* key 로 저장.
const CHURCH_KEYS = [
  "church_name",          // 단체명
  "church_reg_no",        // 고유번호/사업자등록번호
  "church_address",       // 주소
  "church_rep_name",      // 대표자 성명
  "church_rep_title",     // 대표자 직함 (예: 담임목사)
  "church_contact_name",  // 연락담당자
  "church_phone",         // 전화
  "church_donation_code", // 기부금 단체 구분 (종교단체=41, 일반=40)
] as const;

type ChurchKey = typeof CHURCH_KEYS[number];

const DEFAULTS: Record<ChurchKey, string> = {
  church_name: "동천교회",
  church_reg_no: "",
  church_address: "",
  church_rep_name: "",
  church_rep_title: "담임목사",
  church_contact_name: "",
  church_phone: "",
  church_donation_code: "41",
};

export async function GET() {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [...CHURCH_KEYS] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<ChurchKey, string> = { ...DEFAULTS };
  for (const k of CHURCH_KEYS) {
    out[k] = map.get(k) ?? DEFAULTS[k];
  }
  return NextResponse.json(out);
}

export async function PUT(request: NextRequest) {
  // 관리자 혹은 회계 권한자만 수정 가능
  const access = await checkAccAccess("ledger");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }

  const body = await request.json();
  const ops: Promise<unknown>[] = [];
  for (const k of CHURCH_KEYS) {
    if (typeof body[k] === "string") {
      const value = body[k] as string;
      ops.push(
        prisma.siteSetting.upsert({
          where: { key: k },
          create: { key: k, value },
          update: { value },
        })
      );
    }
  }
  await Promise.all(ops);

  return NextResponse.json({ ok: true });
}
