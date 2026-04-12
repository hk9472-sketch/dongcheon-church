import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyPassword } from "@/lib/auth";

// GET /api/auth/reauth — 재인증 상태 확인
export async function GET(request: NextRequest) {
  const reauthCookie = request.cookies.get("dc_reauth")?.value;
  const sessionCookie = request.cookies.get("dc_session")?.value;
  return NextResponse.json({ reauthed: !!(reauthCookie && sessionCookie) });
}

// POST /api/auth/reauth — 비밀번호 확인 후 재인증 쿠키 설정
export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires < new Date()) {
    return NextResponse.json({ error: "세션이 유효하지 않습니다." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, password: true, legacyPwHash: true },
  });
  if (!user) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 401 });
  }

  const { password } = await request.json();
  if (!password) {
    return NextResponse.json({ error: "비밀번호를 입력해주세요." }, { status: 400 });
  }

  const isValid = await verifyPassword(
    password,
    user.password,
    user.legacyPwHash,
    user.id
  );

  if (!isValid) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 403 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("dc_reauth", "1", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    // maxAge 미설정 = 브라우저 세션 쿠키 (브라우저 종료 시 삭제)
  });
  return response;
}
