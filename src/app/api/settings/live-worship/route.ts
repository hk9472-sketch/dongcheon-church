import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

const KEY_ENABLED = "live_worship_enabled";
const KEY_URL = "live_worship_url";
const KEY_YT_KEY = "youtube_api_key";

const DEFAULT_URL = "https://www.youtube.com/watch?v=7KxscHRMaBE";
const DEFAULT_ENABLED = "1";

// GET /api/settings/live-worship — 공개 (헤더가 사용)
//   API 키는 노출하지 않고 boolean 으로 "설정됨" 여부만 반환.
export async function GET() {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [KEY_ENABLED, KEY_URL, KEY_YT_KEY] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return NextResponse.json({
    enabled: (map.get(KEY_ENABLED) ?? DEFAULT_ENABLED) === "1",
    url: map.get(KEY_URL) ?? DEFAULT_URL,
    youtubeApiKeySet: !!(map.get(KEY_YT_KEY) || "").trim(),
  });
}

// POST /api/settings/live-worship — 관리자
// body: { enabled?: boolean, url?: string, youtubeApiKey?: string }
//   youtubeApiKey 가 빈 문자열로 오면 키 삭제.
//   undefined 면 그대로 유지 (기존 키 보존).
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

  const ops: Promise<unknown>[] = [];

  if (typeof body?.enabled === "boolean") {
    const v = body.enabled ? "1" : "0";
    ops.push(
      prisma.siteSetting.upsert({
        where: { key: KEY_ENABLED },
        create: { key: KEY_ENABLED, value: v },
        update: { value: v },
      }),
    );
  }

  if (typeof body?.url === "string") {
    const url = body.url.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "URL 은 http:// 또는 https:// 로 시작해야 합니다." },
        { status: 400 },
      );
    }
    ops.push(
      prisma.siteSetting.upsert({
        where: { key: KEY_URL },
        create: { key: KEY_URL, value: url },
        update: { value: url },
      }),
    );
  }

  if (typeof body?.youtubeApiKey === "string") {
    const k = body.youtubeApiKey.trim();
    ops.push(
      prisma.siteSetting.upsert({
        where: { key: KEY_YT_KEY },
        create: { key: KEY_YT_KEY, value: k },
        update: { value: k },
      }),
    );
  }

  await Promise.all(ops);

  // 갱신 후 현재 상태 반환 (키는 boolean 으로만)
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [KEY_ENABLED, KEY_URL, KEY_YT_KEY] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return NextResponse.json({
    success: true,
    enabled: (map.get(KEY_ENABLED) ?? DEFAULT_ENABLED) === "1",
    url: map.get(KEY_URL) ?? DEFAULT_URL,
    youtubeApiKeySet: !!(map.get(KEY_YT_KEY) || "").trim(),
  });
}
