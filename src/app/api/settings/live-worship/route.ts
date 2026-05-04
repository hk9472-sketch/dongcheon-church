import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

const KEY_ENABLED = "live_worship_enabled";
const KEY_URL = "live_worship_url";

const DEFAULT_URL = "https://www.youtube.com/watch?v=7KxscHRMaBE";
const DEFAULT_ENABLED = "1";

// GET /api/settings/live-worship — 공개 (헤더가 사용)
export async function GET() {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [KEY_ENABLED, KEY_URL] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return NextResponse.json({
    enabled: (map.get(KEY_ENABLED) ?? DEFAULT_ENABLED) === "1",
    url: map.get(KEY_URL) ?? DEFAULT_URL,
  });
}

// POST /api/settings/live-worship — 관리자
// body: { enabled: boolean, url: string }
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
  const enabled = body?.enabled ? "1" : "0";
  const url = String(body?.url ?? "").trim();
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "URL 은 http:// 또는 https:// 로 시작해야 합니다." },
      { status: 400 },
    );
  }

  await Promise.all([
    prisma.siteSetting.upsert({
      where: { key: KEY_ENABLED },
      create: { key: KEY_ENABLED, value: enabled },
      update: { value: enabled },
    }),
    prisma.siteSetting.upsert({
      where: { key: KEY_URL },
      create: { key: KEY_URL, value: url },
      update: { value: url },
    }),
  ]);

  return NextResponse.json({ success: true, enabled: enabled === "1", url });
}
