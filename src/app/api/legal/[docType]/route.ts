import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

const ALLOWED_TYPES = new Set(["privacy", "terms"]);
const ALLOWED_CHANGE = new Set(["revision", "improvement"]);

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
 * GET /api/legal/:docType — 현재 적용 버전 (공개)
 *   ?history=1 → 이력 목록 (관리자만)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ docType: string }> }) {
  const { docType } = await params;
  if (!ALLOWED_TYPES.has(docType)) {
    return NextResponse.json({ error: "잘못된 문서 종류" }, { status: 400 });
  }

  const history = req.nextUrl.searchParams.get("history") === "1";
  if (history) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    const list = await prisma.legalDocumentVersion.findMany({
      where: { docType },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ list });
  }

  const current = await prisma.legalDocumentVersion.findFirst({
    where: { docType },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ current });
}

/**
 * POST /api/legal/:docType — 새 버전 등록 (관리자만)
 * body: { content, version, changeType, changeNote?, effectiveDate? }
 *   - 개정(revision): version 새로 부여, effectiveDate 권장
 *   - 개선(improvement): 표현/오탈자 — version 은 minor 증가 또는 유지
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ docType: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { docType } = await params;
  if (!ALLOWED_TYPES.has(docType)) {
    return NextResponse.json({ error: "잘못된 문서 종류" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const content = String(body?.content || "").trim();
  const version = String(body?.version || "").trim();
  const changeType = String(body?.changeType || "").trim();
  const changeNote = body?.changeNote ? String(body.changeNote).trim() : null;
  const effectiveDate = body?.effectiveDate ? new Date(String(body.effectiveDate)) : null;

  if (!content) {
    return NextResponse.json({ error: "본문을 입력하세요." }, { status: 400 });
  }
  if (!version) {
    return NextResponse.json({ error: "버전을 입력하세요." }, { status: 400 });
  }
  if (!ALLOWED_CHANGE.has(changeType)) {
    return NextResponse.json({ error: "changeType 은 revision 또는 improvement" }, { status: 400 });
  }
  if (changeType === "revision" && !effectiveDate) {
    return NextResponse.json({ error: "개정 시 시행일을 지정해 주세요." }, { status: 400 });
  }

  const created = await prisma.legalDocumentVersion.create({
    data: {
      docType,
      content,
      version,
      changeType,
      changeNote,
      effectiveDate,
      createdBy: admin.id,
    },
  });

  return NextResponse.json({ id: created.id });
}
