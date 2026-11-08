import path from "path";
import { mkdir, unlink, writeFile } from "fs/promises";


/**
 * 회계 전표 증빙자료(이미지 / PDF) 저장 헬퍼.
 *
 *  - 저장: <업로드 루트>/acc-evidence/<YYYY>/<회계코드>_<회계명>/<전표번호>-<일련번호3자리>.<ext>
 *      예) acc-evidence/2026/002_일반회계/20261108-001-001.pdf
 *    서버 폴더(또는 백업본)에서 전표번호만으로 증빙을 찾을 수 있게 한다. 전표번호는 회계단위마다
 *    따로 매겨지므로 회계 폴더로 나눈다. (웹 공개 경로 없음 — API 로만 내려줌)
 *  - 업로드 루트: UPLOAD_DIR 설정과 무관하게 항상 <앱 폴더>/data — 이름이 예측 가능하므로
 *    public/ 같은 공개 폴더로 가면 안 되고, 관리자 파일 백업(data 고정)에도 포함되게.
 *  - 형식은 확장자가 아니라 파일 앞부분(시그니처)으로 판별 — 이름만 바꾼 실행파일 등 차단
 *  - path.join/resolve 금지 (Turbopack 추적 경고) → uploadPath 헬퍼만 사용
 */

export const EVIDENCE_MAX_BYTES = 20 * 1024 * 1024; // 파일당 20MB
export const EVIDENCE_MAX_PER_VOUCHER = 30;

const SUBDIR = "acc-evidence";

/** 증빙 루트 = <앱 폴더>/data (path.join/resolve 대신 join(sep)+normalize — Turbopack 추적 회피) */
function evidenceRoot(): string {
  return path.normalize([process.cwd(), "data"].join(path.sep));
}
function absOf(rel: string): string {
  return path.normalize([evidenceRoot(), rel].join(path.sep));
}

/** 시그니처로 형식 판별. 허용 형식이 아니면 null */
export function sniffEvidenceType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  const ascii = (from: number, len: number) => buf.subarray(from, from + len).toString("latin1");
  if (ascii(0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf[0] === 0x89 && ascii(1, 3) === "PNG") return { mime: "image/png", ext: "png" };
  if (ascii(0, 4) === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) {
      return { mime: "image/heic", ext: "heic" }; // 아이폰 사진 — 브라우저 미리보기 불가, 내려받기로 열람
    }
  }
  return null;
}

/** 브라우저에서 바로 보여줄 수 있는 형식인지 (HEIC 는 내려받기) */
export function isInlineViewable(mime: string): boolean {
  return mime === "application/pdf" || (mime.startsWith("image/") && mime !== "image/heic");
}

/** 원본 파일명 정리 — 경로·제어문자 제거, 길이 제한 */
export function cleanOrigName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "file";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "file";
}

/** 폴더 이름에 쓸 수 없는 문자 정리 */
function safeSeg(s: string): string {
  return s.replace(/[\\/:*?"<>|\s.]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "unit";
}

export interface EvidenceTarget {
  year: number; // 전표 일자의 연도
  unitCode: string;
  unitName: string;
  voucherNo: string; // YYYYMMDD-NNN
  seq: number; // 전표 안 첨부 일련번호
}

/** 저장 경로(업로드 루트 기준) — <연도>/<회계코드>_<회계명>/<전표번호>-<일련번호>.<ext> */
export function evidencePathOf(t: EvidenceTarget, ext: string): string {
  return `${SUBDIR}/${t.year}/${safeSeg(t.unitCode)}_${safeSeg(t.unitName)}/${safeSeg(t.voucherNo)}-${String(t.seq).padStart(3, "0")}.${ext}`;
}

/** 파일 저장 → 업로드 루트 기준 상대 경로 반환. 같은 이름 파일이 이미 있으면 덮어쓰지 않고 오류(EEXIST). */
export async function saveEvidenceFile(buf: Buffer, ext: string, t: EvidenceTarget): Promise<string> {
  const rel = evidencePathOf(t, ext);
  const abs = absOf(rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf, { flag: "wx" });
  return rel;
}

/** 상대 경로 → 절대 경로 (업로드 루트 밖이면 null) */
export function evidenceAbsPath(storedPath: string): string | null {
  if (!storedPath.startsWith(`${SUBDIR}/`) || storedPath.includes("..")) return null;
  const abs = absOf(storedPath);
  return abs.startsWith(evidenceRoot() + path.sep) ? abs : null;
}

/** 파일 삭제 (없으면 무시) */
export async function removeEvidenceFiles(storedPaths: string[]): Promise<void> {
  for (const p of storedPaths) {
    const abs = evidenceAbsPath(p);
    if (abs) await unlink(abs).catch(() => {});
  }
}
