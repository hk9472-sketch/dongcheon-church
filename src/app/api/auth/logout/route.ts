import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// POST /api/auth/logout
export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("dc_session")?.value;
    if (sessionToken) {
      await prisma.session.deleteMany({ where: { sessionToken } });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set("dc_session", "", { maxAge: 0, path: "/" });
    response.cookies.set("dc_reauth", "", { maxAge: 0, path: "/" });
    response.cookies.set("dc_legacy_token", "", { maxAge: 0, path: "/" });
    return response;
  } catch {
    return NextResponse.json({ success: true });
  }
}
