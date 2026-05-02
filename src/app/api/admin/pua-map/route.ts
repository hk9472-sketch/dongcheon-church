import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPuaCode } from "@/lib/hwpPuaMap";
import { ensurePuaMapHydrated } from "@/lib/puaMapServer";

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || u.isAdmin > 2) return null;
  return u;
}

// GET /api/admin/pua-map — 등록된 PUA 매핑 전체 (등록자·시각 포함)
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const rows = await prisma.puaMapping.findMany({
    orderBy: { code: "asc" },
  });
  return NextResponse.json({
    items: rows.map((r) => ({
      code: r.code,
      hex: `U+${r.code.toString(16).toUpperCase().padStart(4, "0")}`,
      char: r.char,
      context: r.context,
      addedById: r.addedById,
      addedByName: r.addedByName,
      createdAt: r.createdAt,
    })),
  });
}

// PUT /api/admin/pua-map — 매핑 수정 (관리자만)
// body: { code: number, char: string }
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  let body: { code?: unknown; char?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const code = typeof body.code === "number" ? body.code : NaN;
  const char = typeof body.char === "string" ? body.char.trim() : "";
  if (!Number.isInteger(code) || !isPuaCode(code)) {
    return NextResponse.json({ error: "PUA 코드포인트가 아닙니다." }, { status: 400 });
  }
  if (!char || char.length === 0 || char.length > 8) {
    return NextResponse.json({ error: "치환할 글자는 1~8자여야 합니다." }, { status: 400 });
  }
  for (const ch of char) {
    const c = ch.codePointAt(0);
    if (c !== undefined && isPuaCode(c)) {
      return NextResponse.json(
        { error: "PUA 글자로는 등록할 수 없습니다." },
        { status: 400 },
      );
    }
  }

  await prisma.puaMapping.update({
    where: { code },
    data: {
      char,
      addedById: admin.id,
      addedByName: admin.name,
    },
  });
  await ensurePuaMapHydrated(true);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/pua-map?code=61569
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const codeStr = req.nextUrl.searchParams.get("code");
  const code = codeStr ? parseInt(codeStr, 10) : NaN;
  if (!Number.isInteger(code) || !isPuaCode(code)) {
    return NextResponse.json({ error: "PUA 코드포인트가 아닙니다." }, { status: 400 });
  }

  await prisma.puaMapping.delete({ where: { code } }).catch(() => {});
  await ensurePuaMapHydrated(true);
  return NextResponse.json({ ok: true });
}
