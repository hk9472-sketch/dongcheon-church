import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

type RouteParams = { params: Promise<{ id: string }> };

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
