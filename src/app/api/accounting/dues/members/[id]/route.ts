import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

type RouteParams = { params: Promise<{ id: string }> };

// PUT /api/accounting/dues/members/[id]
//   body: { name?, memberNo? }
//   회원 이름·고유번호 수정. memberNo 변경 시 (category, memberNo) 중복 검사.
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const acc = await checkAccAccess("dues");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id))
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const cur = await prisma.monthlyDuesMember.findUnique({ where: { id } });
  if (!cur) return NextResponse.json({ error: "회원 없음" }, { status: 404 });

  let body: { name?: string; memberNo?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const newName =
    typeof body.name === "string" ? body.name.trim() : undefined;
  const newNo =
    typeof body.memberNo === "number" && Number.isInteger(body.memberNo) && body.memberNo > 0
      ? body.memberNo
      : undefined;

  if (newName === undefined && newNo === undefined) {
    return NextResponse.json({ error: "수정 항목 없음" }, { status: 400 });
  }
  if (newName !== undefined && newName === "") {
    return NextResponse.json({ error: "이름 필수" }, { status: 400 });
  }

  // memberNo 변경 시 중복 검사 (같은 category 내)
  if (newNo !== undefined && newNo !== cur.memberNo) {
    const dup = await prisma.monthlyDuesMember.findUnique({
      where: { category_memberNo: { category: cur.category, memberNo: newNo } },
    });
    if (dup && dup.id !== id) {
      return NextResponse.json(
        { error: `${cur.category} 고유번호 ${newNo} 이미 존재 (${dup.name})` },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.monthlyDuesMember.update({
    where: { id },
    data: {
      ...(newName !== undefined ? { name: newName } : {}),
      ...(newNo !== undefined ? { memberNo: newNo } : {}),
    },
  });
  return NextResponse.json({ ok: true, member: updated });
}

// DELETE /api/accounting/dues/members/[id]
//   입금 내역이 1건이라도 있으면 거부 (409). 없으면 월정액 함께 삭제.
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const acc = await checkAccAccess("dues");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id))
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const member = await prisma.monthlyDuesMember.findUnique({ where: { id } });
  if (!member) return NextResponse.json({ error: "회원 없음" }, { status: 404 });

  const depositCount = await prisma.monthlyDuesDeposit.count({
    where: { category: member.category, memberId: id },
  });
  if (depositCount > 0) {
    return NextResponse.json(
      {
        error: `이 회원의 입금 내역 ${depositCount}건이 있어 삭제할 수 없습니다. 입금 먼저 삭제 후 시도하세요.`,
      },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.monthlyDuesAmount.deleteMany({
      where: { category: member.category, memberId: id },
    }),
    prisma.monthlyDuesMember.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
