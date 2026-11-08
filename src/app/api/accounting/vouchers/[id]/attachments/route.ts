import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_PER_VOUCHER,
  cleanOrigName,
  removeEvidenceFiles,
  saveEvidenceFile,
  sniffEvidenceType,
} from "@/lib/accEvidence";

/**
 * 전표 증빙자료
 *   GET  /api/accounting/vouchers/:id/attachments  → 목록
 *   POST /api/accounting/vouchers/:id/attachments  → multipart "files" (여러 개) 업로드
 *
 * 파일 이름: <전표번호>-<일련번호3자리> (예: 20261108-001-001.pdf) — 서버 폴더에서 전표번호로 찾기 쉽게.
 * 증빙 추가는 마감된 전표에도 허용(금액에 영향 없음 — 영수증을 나중에 받는 경우).
 * 삭제는 /api/accounting/attachments/:id (마감 전표는 불가).
 */

const SELECT = {
  id: true,
  seq: true,
  storedPath: true,
  origName: true,
  mimeType: true,
  fileSize: true,
  createdBy: true,
  createdAt: true,
} as const;

async function voucherOf(idStr: string) {
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  return prisma.accVoucher.findUnique({
    where: { id },
    select: { id: true, date: true, voucherNo: true, unit: { select: { code: true, name: true } } },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const v = await voucherOf((await params).id);
  if (!v) return NextResponse.json({ error: "전표를 찾을 수 없습니다." }, { status: 404 });
  const items = await prisma.accVoucherAttachment.findMany({
    where: { voucherId: v.id },
    orderBy: { seq: "asc" },
    select: SELECT,
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await checkAccAccess("ledger");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const v = await voucherOf((await params).id);
  if (!v) return NextResponse.json({ error: "전표를 찾을 수 없습니다." }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "파일을 읽지 못했습니다." }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "파일을 선택하세요." }, { status: 400 });

  const already = await prisma.accVoucherAttachment.count({ where: { voucherId: v.id } });
  if (already + files.length > EVIDENCE_MAX_PER_VOUCHER) {
    return NextResponse.json(
      { error: `전표 1장에 증빙은 ${EVIDENCE_MAX_PER_VOUCHER}개까지입니다. (현재 ${already}개)` },
      { status: 400 },
    );
  }

  // 먼저 전부 검사 — 하나라도 문제가 있으면 아무것도 저장하지 않음
  const checked: { file: File; buf: Buffer; mime: string; ext: string }[] = [];
  for (const f of files) {
    if (f.size > EVIDENCE_MAX_BYTES) {
      return NextResponse.json({ error: `"${f.name}" — 20MB 를 넘습니다.` }, { status: 400 });
    }
    const buf = Buffer.from(await f.arrayBuffer());
    const t = sniffEvidenceType(buf);
    if (!t) {
      return NextResponse.json(
        { error: `"${f.name}" — 이미지(JPG·PNG·GIF·WEBP·HEIC) 또는 PDF 만 올릴 수 있습니다.` },
        { status: 400 },
      );
    }
    checked.push({ file: f, buf, ...t });
  }

  const createdBy = access.user?.name ?? String(access.userId ?? "");
  // 일련번호 예약: 전표의 evidenceSeq(마지막으로 쓴 번호)를 이번 파일 수만큼 올리고 그 범위를 쓴다.
  //   지운 번호는 다시 쓰지 않음 — 출력해 둔 전표의 증빙번호와 새 파일이 겹치지 않게.
  //   원시 SQL: updatedAt 을 건드리지 않고(카운터 규칙), 동시에 올려도 번호가 겹치지 않게.
  const reserved = await prisma.$transaction(async (tx) => {
    const last = await tx.accVoucherAttachment.aggregate({ where: { voucherId: v.id }, _max: { seq: true } });
    await tx.$executeRaw`UPDATE acc_vouchers SET evidenceSeq = GREATEST(evidenceSeq, ${last._max.seq ?? 0}) + ${checked.length} WHERE id = ${v.id}`;
    const row = await tx.accVoucher.findUnique({ where: { id: v.id }, select: { evidenceSeq: true } });
    return row?.evidenceSeq ?? checked.length;
  });
  let seq = reserved - checked.length;
  const savedPaths: string[] = [];
  try {
    const items = [];
    for (const c of checked) {
      // 같은 이름 파일이 이미 있으면(예: 예전에 지운 기록의 파일) 다음 번호로
      let storedPath = "";
      for (let tries = 0; tries < 50 && !storedPath; tries++) {
        seq += 1;
        try {
          storedPath = await saveEvidenceFile(c.buf, c.ext, {
            year: v.date.getUTCFullYear(),
            unitCode: v.unit.code,
            unitName: v.unit.name,
            voucherNo: v.voucherNo,
            seq,
          });
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        }
      }
      if (!storedPath) throw new Error("저장할 파일 이름을 정하지 못했습니다.");
      savedPaths.push(storedPath);
      items.push(
        await prisma.accVoucherAttachment.create({
          data: {
            voucherId: v.id,
            seq,
            storedPath,
            origName: cleanOrigName(c.file.name),
            mimeType: c.mime,
            fileSize: c.buf.length,
            createdBy,
          },
          select: SELECT,
        }),
      );
    }
    return NextResponse.json({ items }, { status: 201 });
  } catch (e) {
    console.error("[voucher attachments] 저장 실패:", e);
    // 일부만 저장되는 일이 없도록 이번에 만든 파일·기록 정리
    await prisma.accVoucherAttachment.deleteMany({ where: { storedPath: { in: savedPaths } } }).catch(() => {});
    await removeEvidenceFiles(savedPaths);
    return NextResponse.json({ error: "증빙 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
