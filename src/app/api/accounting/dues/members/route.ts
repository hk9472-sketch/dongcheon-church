import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

const VALID_CATEGORIES = ["전도회", "건축"] as const;

// GET /api/accounting/dues/members?category=전도회
//   해당 단위의 활성 회원 목록 (memberNo asc)
export async function GET(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const category = req.nextUrl.searchParams.get("category") || "";
  if (!VALID_CATEGORIES.includes(category as never)) {
    return NextResponse.json({ error: "잘못된 category" }, { status: 400 });
  }

  const members = await prisma.monthlyDuesMember.findMany({
    where: { category, isActive: true },
    orderBy: { memberNo: "asc" },
  });
  return NextResponse.json({ members });
}

// POST /api/accounting/dues/members
//   body: { category, memberNo?, name }
//   memberNo 미지정 시 다음 번호 자동 채번. 지정 시 해당 번호로 등록 (충돌 시 409).
export async function POST(req: NextRequest) {
  const acc = await checkAccAccess("offering");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  let body: { category?: string; memberNo?: number; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const category = body.category || "";
  if (!VALID_CATEGORIES.includes(category as never)) {
    return NextResponse.json({ error: "잘못된 category" }, { status: 400 });
  }
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "이름 필수" }, { status: 400 });

  let memberNo = typeof body.memberNo === "number" ? body.memberNo : 0;
  if (!Number.isInteger(memberNo) || memberNo <= 0) {
    // 자동 채번
    const last = await prisma.monthlyDuesMember.findFirst({
      where: { category },
      orderBy: { memberNo: "desc" },
    });
    memberNo = (last?.memberNo ?? 0) + 1;
  } else {
    const exists = await prisma.monthlyDuesMember.findUnique({
      where: { category_memberNo: { category, memberNo } },
    });
    if (exists) {
      return NextResponse.json(
        { error: `${category} 고유번호 ${memberNo} 이미 존재 (${exists.name})` },
        { status: 409 },
      );
    }
  }

  const created = await prisma.monthlyDuesMember.create({
    data: { category, memberNo, name, isActive: true },
  });
  return NextResponse.json({ ok: true, member: created });
}
