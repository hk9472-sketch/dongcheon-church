import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import { evidenceAbsPath, isInlineViewable, removeEvidenceFiles } from "@/lib/accEvidence";

/**
 * 전표 증빙 파일
 *   GET    /api/accounting/attachments/:id            → 파일 (이미지·PDF 는 화면에 바로 표시)
 *   GET    /api/accounting/attachments/:id?download=1 → 내려받기
 *   DELETE /api/accounting/attachments/:id            → 삭제 (마감된 전표는 불가)
 * 행정실(ledger) 권한이 있어야 볼 수 있다 — 공개 URL 없음.
 */

async function find(idStr: string) {
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  return prisma.accVoucherAttachment.findUnique({
    where: { id },
    include: { voucher: { select: { isClosed: true } } },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const att = await find((await params).id);
  if (!att) return NextResponse.json({ error: "증빙을 찾을 수 없습니다." }, { status: 404 });

  const abs = evidenceAbsPath(att.storedPath);
  if (!abs) return NextResponse.json({ error: "잘못된 파일 경로입니다." }, { status: 400 });
  let buf: Buffer;
  try {
    buf = await readFile(abs);
  } catch {
    return NextResponse.json({ error: "파일이 서버에 없습니다." }, { status: 404 });
  }

  const download = req.nextUrl.searchParams.get("download") === "1" || !isInlineViewable(att.mimeType);
  const encoded = encodeURIComponent(att.origName);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Length": String(buf.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encoded}`,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const att = await find((await params).id);
  if (!att) return NextResponse.json({ error: "증빙을 찾을 수 없습니다." }, { status: 404 });
  if (att.voucher.isClosed) {
    return NextResponse.json(
      { error: "마감된 전표의 증빙은 삭제할 수 없습니다. [월마감]에서 해제 후 삭제하세요." },
      { status: 409 },
    );
  }
  await prisma.accVoucherAttachment.delete({ where: { id: att.id } });
  await removeEvidenceFiles([att.storedPath]);
  return NextResponse.json({ success: true });
}
