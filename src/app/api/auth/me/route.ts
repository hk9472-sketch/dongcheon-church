import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/auth/me
export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("dc_session")?.value;
    if (!sessionToken) {
      return NextResponse.json({ user: null });
    }

    const session = await prisma.session.findUnique({ where: { sessionToken } });
    if (!session || session.expires < new Date()) {
      return NextResponse.json({ user: null });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        userId: true,
        name: true,
        level: true,
        isAdmin: true,
        email: true,
        groupNo: true,
        councilAccess: true,
        accountAccess: true,
        accLedgerAccess: true,
        accOfferingAccess: true,
        accMemberEditAccess: true,
      },
    });

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null });
  }
}
