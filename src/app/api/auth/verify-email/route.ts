import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/auth/verify-email?token=xxx
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/auth/verify-email?error=missing", request.url));
  }

  const user = await prisma.user.findFirst({
    where: {
      emailVerifyToken: token,
      emailVerified: false,
    },
  });

  if (!user) {
    return NextResponse.redirect(new URL("/auth/verify-email?error=invalid", request.url));
  }

  if (user.emailVerifyExpiry && user.emailVerifyExpiry < new Date()) {
    return NextResponse.redirect(new URL("/auth/verify-email?error=expired", request.url));
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerifyToken: null,
      emailVerifyExpiry: null,
    },
  });

  return NextResponse.redirect(new URL("/auth/verify-email?success=1", request.url));
}
