import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCouncilUser } from "@/lib/council";

// GET /api/council/depts — 부서 목록 (groups 포함)
export async function GET() {
  const user = await getCouncilUser();
  if (!user) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const depts = await prisma.councilDept.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      groups: {
        orderBy: { sortOrder: "asc" },
        include: {
          _count: { select: { members: true } },
        },
      },
    },
  });

  return NextResponse.json(depts);
}
