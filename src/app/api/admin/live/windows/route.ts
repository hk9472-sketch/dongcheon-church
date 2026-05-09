import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import {
  loadWindows,
  saveWindows,
  DEFAULT_WINDOWS,
  type ServiceWindow,
} from "@/lib/liveService";

async function requireAdmin() {
  const c = await cookies();
  const token = c.get("dc_session")?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { sessionToken: token } });
  if (!s || s.expires <= new Date()) return null;
  const u = await prisma.user.findUnique({ where: { id: s.userId } });
  if (!u || u.isAdmin > 2) return null;
  return u;
}

/** GET /api/admin/live/windows — 현재 설정된 서비스 시간 윈도우 + 기본값 비교 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const windows = await loadWindows();
  return NextResponse.json({ windows, defaults: DEFAULT_WINDOWS });
}

/**
 * POST /api/admin/live/windows
 * body: { windows: ServiceWindow[] }
 * 검증: code 중복 X, days 0~6 정수, startMin < endMin, 0 ≤ startMin < 1440, 0 < endMin ≤ 1440.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const raw = body?.windows;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "windows 배열 필요" }, { status: 400 });
  }

  const validCodes = new Set([
    "dawn", "eve", "sun_child_am", "sun_adult_am", "sun_adult_pm", "sun_child_pm",
  ]);
  const seen = new Set<string>();
  const cleaned: ServiceWindow[] = [];

  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    if (!w || typeof w !== "object") {
      return NextResponse.json({ error: `[${i}] 잘못된 형식` }, { status: 400 });
    }
    if (!validCodes.has(w.code)) {
      return NextResponse.json({ error: `[${i}] 잘못된 code: ${w.code}` }, { status: 400 });
    }
    if (seen.has(w.code)) {
      return NextResponse.json({ error: `[${i}] 중복된 code: ${w.code}` }, { status: 400 });
    }
    seen.add(w.code);

    if (typeof w.label !== "string" || w.label.trim().length === 0) {
      return NextResponse.json({ error: `[${i}] label 필요` }, { status: 400 });
    }
    if (
      !Array.isArray(w.days) ||
      w.days.length === 0 ||
      !w.days.every((d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)
    ) {
      return NextResponse.json({ error: `[${i}] days 는 0~6 정수 배열` }, { status: 400 });
    }
    if (
      typeof w.startMin !== "number" ||
      typeof w.endMin !== "number" ||
      w.startMin < 0 || w.startMin >= 1440 ||
      w.endMin <= w.startMin || w.endMin > 1440
    ) {
      return NextResponse.json(
        { error: `[${i}] 시간 범위 오류 (startMin < endMin, 0 ≤ start, end ≤ 1440)` },
        { status: 400 },
      );
    }

    cleaned.push({
      code: w.code,
      label: w.label.trim().slice(0, 50),
      days: [...new Set(w.days as number[])].sort(),
      startMin: Math.floor(w.startMin),
      endMin: Math.floor(w.endMin),
    });
  }

  await saveWindows(cleaned);
  return NextResponse.json({ ok: true, windows: cleaned });
}
