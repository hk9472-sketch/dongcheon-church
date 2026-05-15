import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCouncilUser } from "@/lib/council";

interface Paragraph {
  text: string;
  startMs: number;
  endMs: number;
}

function validParagraphs(arr: unknown): arr is Paragraph[] {
  if (!Array.isArray(arr)) return false;
  return arr.every(
    (p) =>
      p && typeof p === "object" &&
      typeof (p as Paragraph).text === "string" &&
      Number.isFinite((p as Paragraph).startMs) &&
      Number.isFinite((p as Paragraph).endMs)
  );
}

/** GET — 단건 (재생/편집용) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCouncilUser();
  if (!me) {
    return NextResponse.json({ message: "권한 없음" }, { status: 403 });
  }
  const { id } = await params;
  const sid = parseInt(id, 10);
  if (!Number.isFinite(sid)) {
    return NextResponse.json({ message: "id 오류" }, { status: 400 });
  }
  const row = await prisma.readingSession.findUnique({ where: { id: sid } });
  if (!row) {
    return NextResponse.json({ message: "존재하지 않습니다." }, { status: 404 });
  }
  return NextResponse.json(row);
}

/** PATCH — title / paragraphs (싱크) 갱신 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCouncilUser();
  if (!me) {
    return NextResponse.json({ message: "권한 없음" }, { status: 403 });
  }
  const { id } = await params;
  const sid = parseInt(id, 10);
  if (!Number.isFinite(sid)) {
    return NextResponse.json({ message: "id 오류" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const data: { title?: string; paragraphs?: Paragraph[] } = {};
  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }
  if (validParagraphs(body.paragraphs)) {
    data.paragraphs = body.paragraphs;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "변경 사항 없음" }, { status: 400 });
  }
  await prisma.readingSession.update({
    where: { id: sid },
    data: {
      ...(data.title ? { title: data.title } : {}),
      ...(data.paragraphs ? { paragraphs: data.paragraphs as unknown as object } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

/** DELETE — 관리자만 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCouncilUser();
  if (!me || me.isAdmin > 2) {
    return NextResponse.json({ message: "관리자 권한 필요" }, { status: 403 });
  }
  const { id } = await params;
  const sid = parseInt(id, 10);
  if (!Number.isFinite(sid)) {
    return NextResponse.json({ message: "id 오류" }, { status: 400 });
  }
  await prisma.readingSession.delete({ where: { id: sid } });
  return NextResponse.json({ ok: true });
}
