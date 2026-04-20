import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

const KEY = "media_base_url";

// GET /api/settings/media-base-url — 공개 (에디터가 사용)
// 로그인 사용자만 받을 수 있으면 좋지만 에디터 편의상 공개. 값 자체가 서버 URL 이라 민감도는 낮음.
export async function GET() {
  const row = await prisma.siteSetting.findUnique({ where: { key: KEY } });
  return NextResponse.json({ url: row?.value || "" });
}

// POST /api/settings/media-base-url — 관리자만
// body: { url: string }
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("dc_session")?.value;
  if (!sessionToken) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires < new Date()) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });
  if (!user || user.isAdmin > 2) {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const url = String(body.url || "").trim();
  // 빈 문자열 허용 — 설정 해제 의미
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "http:// 또는 https:// 로 시작해야 합니다." }, { status: 400 });
  }

  await prisma.siteSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: url },
    update: { value: url },
  });

  return NextResponse.json({ success: true, url });
}
