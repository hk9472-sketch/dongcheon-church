import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";

function toDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const acc = await checkAccAccess("dues");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id))
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  type Body = {
    date?: string;
    memberId?: number;
    amount?: number;
    installment?: number;
    description?: string | null;
  };
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.date) data.date = toDateOnly(body.date);
  if (typeof body.memberId === "number") data.memberId = body.memberId;
  if (typeof body.amount === "number") {
    if (body.amount <= 0)
      return NextResponse.json({ error: "금액 > 0" }, { status: 400 });
    data.amount = Math.floor(body.amount);
  }
  if (typeof body.installment === "number") {
    if (body.installment < 1 || body.installment > 12)
      return NextResponse.json({ error: "회차는 1~12" }, { status: 400 });
    data.installment = body.installment;
  }
  if ("description" in body) data.description = body.description ?? null;

  const updated = await prisma.monthlyDuesDeposit.update({
    where: { id },
    data,
  });
  return NextResponse.json({ ok: true, item: updated });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const acc = await checkAccAccess("dues");
  if (!acc.ok) return NextResponse.json({ error: acc.error }, { status: acc.status });

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id))
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  await prisma.monthlyDuesDeposit.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
