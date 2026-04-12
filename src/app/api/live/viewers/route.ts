import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/live/viewers — /live 페이지 최근 15분 내 고유 접속자 수
export async function GET() {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

  const result = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(DISTINCT ip) as cnt
    FROM visit_logs
    WHERE path = '/live'
      AND createdAt >= ${fifteenMinAgo}
  `;

  const count = result.length > 0 ? Number(result[0].cnt) : 0;

  return NextResponse.json({ count });
}
