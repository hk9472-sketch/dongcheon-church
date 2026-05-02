import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPuaCode } from "@/lib/hwpPuaMap";
import { ensurePuaMapHydrated } from "@/lib/puaMapServer";

// HWP PUA 매핑 — 클라이언트 hydrate 용 + 작성자 등록 엔드포인트.
//
// GET  : { map: { "F081": "①", ... } } — 모든 등록 매핑 (10초 브라우저 캐시).
// POST : body { code: number, char: string, context?: string } —
//        로그인 사용자만 등록. first-write-wins (이미 등록된 코드는 admin 만 갱신).

export async function GET() {
  try {
    const rows = await prisma.puaMapping.findMany({
      select: { code: true, char: true },
    });
    const map: Record<string, string> = {};
    for (const r of rows) map[r.code.toString(16).toUpperCase().padStart(4, "0")] = r.char;
    return NextResponse.json(
      { map },
      { headers: { "Cache-Control": "public, max-age=10, stale-while-revalidate=60" } },
    );
  } catch {
    return NextResponse.json({ map: {} });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: { code?: unknown; char?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const code = typeof body.code === "number" ? body.code : NaN;
  const char = typeof body.char === "string" ? body.char.trim() : "";
  const context = typeof body.context === "string" ? body.context.slice(0, 64) : null;

  if (!Number.isInteger(code) || !isPuaCode(code)) {
    return NextResponse.json({ error: "PUA 코드포인트가 아닙니다." }, { status: 400 });
  }
  // 보통 1글자, 결합문자 포함해서 최대 4 코드포인트(8 utf-16) 까지 허용
  if (!char || char.length === 0 || char.length > 8) {
    return NextResponse.json({ error: "치환할 글자는 1~8자 길이여야 합니다." }, { status: 400 });
  }
  // 다시 PUA 로 등록하는 건 금지 (의미 없음)
  for (const ch of char) {
    const c = ch.codePointAt(0);
    if (c !== undefined && isPuaCode(c)) {
      return NextResponse.json(
        { error: "PUA 글자로는 등록할 수 없습니다 (다른 표준 unicode 글자로 입력해주세요)." },
        { status: 400 },
      );
    }
  }

  const existing = await prisma.puaMapping.findUnique({ where: { code } });
  const isAdmin = user.isAdmin <= 2;

  if (existing && !isAdmin) {
    // first-write-wins: 일반 사용자는 기존 매핑 변경 불가
    return NextResponse.json(
      { error: "이미 등록된 매핑입니다. 변경은 관리자에게 요청해주세요.", existing: existing.char },
      { status: 409 },
    );
  }

  const saved = await prisma.puaMapping.upsert({
    where: { code },
    create: {
      code,
      char,
      context,
      addedById: user.id,
      addedByName: user.name,
    },
    update: {
      char,
      context,
      addedById: user.id,
      addedByName: user.name,
    },
  });

  // 서버측 런타임 캐시 즉시 갱신 — 다음 sanitize 부터 새 매핑 적용
  await ensurePuaMapHydrated(true);

  return NextResponse.json({ ok: true, code: saved.code, char: saved.char });
}
