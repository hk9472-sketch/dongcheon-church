import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { diffLines } from "diff";

const ALLOWED_TYPES = new Set(["privacy", "terms"]);

async function requireAdmin() {
  const c = await cookies();
  const token = c.get("dc_session")?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { sessionToken: token } });
  if (!s || s.expires <= new Date()) return null;
  const u = await prisma.user.findUnique({
    where: { id: s.userId },
    select: { id: true, isAdmin: true },
  });
  if (!u || u.isAdmin > 2) return null;
  return u;
}

/**
 * GET /api/legal/:docType/diff?from=ID&to=ID
 * 두 버전 간 줄 단위 diff 반환. 관리자만.
 * to 가 from 보다 최신이어야 자연스러움 (UI 에서 강제).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ docType: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { docType } = await params;
  if (!ALLOWED_TYPES.has(docType)) {
    return NextResponse.json({ error: "잘못된 문서 종류" }, { status: 400 });
  }

  const sp = req.nextUrl.searchParams;
  const fromId = parseInt(sp.get("from") || "0", 10);
  const toId = parseInt(sp.get("to") || "0", 10);
  if (!fromId || !toId) {
    return NextResponse.json({ error: "from, to id 가 필요합니다." }, { status: 400 });
  }

  const [a, b] = await Promise.all([
    prisma.legalDocumentVersion.findUnique({ where: { id: fromId } }),
    prisma.legalDocumentVersion.findUnique({ where: { id: toId } }),
  ]);
  if (!a || !b || a.docType !== docType || b.docType !== docType) {
    return NextResponse.json({ error: "버전을 찾을 수 없음" }, { status: 404 });
  }

  // diffLines: 줄 단위로 added/removed/unchanged 마킹
  const parts = diffLines(a.content, b.content).map((p) => ({
    value: p.value,
    added: !!p.added,
    removed: !!p.removed,
  }));

  return NextResponse.json({
    from: { id: a.id, version: a.version, createdAt: a.createdAt },
    to: { id: b.id, version: b.version, createdAt: b.createdAt },
    parts,
  });
}
