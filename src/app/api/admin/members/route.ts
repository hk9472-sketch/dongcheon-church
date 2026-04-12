import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

async function requireAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

// GET /api/admin/members?councilOnly=1
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const councilOnly = request.nextUrl.searchParams.get("councilOnly");

  const where = councilOnly === "1" ? { councilAccess: true } : {};

  const users = await prisma.user.findMany({
    where,
    select: { id: true, userId: true, name: true, isAdmin: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}
