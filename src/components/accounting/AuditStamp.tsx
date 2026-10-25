"use client";

/**
 * 입력자 · 최종입력일시 표시 (행정실·연보관리·월정관리 조회 화면 공통)
 *
 *  - 입력자 = createdBy (처음 입력한 사람)
 *  - 최종입력 = modifiedAt ?? updatedAt ?? createdAt  (사용자가 입력·수정한 마지막 시각)
 *  - 다른 사람이 고쳤으면 "→ 수정자" 를 덧붙임
 *
 * modifiedAt/modifiedBy 는 사용자 입력·수정 때만 기록되는 필드라 마감 등 시스템 갱신에 흔들리지 않는다.
 */

type DateLike = string | Date | null | undefined;

/** KST "YYYY-MM-DD HH:mm" (short=true 면 "MM-DD HH:mm") */
export function fmtStamp(v: DateLike, short = false): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const k = new Date(d.getTime() + 9 * 3600 * 1000); // UTC → KST
  const iso = k.toISOString();
  const date = short ? iso.slice(5, 10) : iso.slice(0, 10);
  return `${date} ${iso.slice(11, 16)}`;
}

export interface AuditFields {
  createdBy?: string | null;
  createdAt?: DateLike;
  modifiedBy?: string | null;
  modifiedAt?: DateLike;
  updatedAt?: DateLike;
}

export function lastInputAt(r: AuditFields): DateLike {
  return r.modifiedAt ?? r.createdAt ?? r.updatedAt;
}

/** 표 셀용 2줄 표시: 입력자(→수정자) / 최종입력일시 */
export default function AuditStamp({ r, short = true, className = "" }: { r: AuditFields; short?: boolean; className?: string }) {
  const by = r.createdBy || "-";
  const mod = r.modifiedBy && r.modifiedBy !== r.createdBy ? r.modifiedBy : null;
  const at = fmtStamp(lastInputAt(r), short);
  return (
    <div className={`text-[11px] leading-tight text-gray-500 whitespace-nowrap ${className}`} title={auditTitle(r)}>
      <div className="text-gray-700">
        {by}
        {mod && <span className="text-amber-700"> → {mod}</span>}
      </div>
      <div>{at}</div>
    </div>
  );
}

/** 마우스오버 설명 */
export function auditTitle(r: AuditFields): string {
  const parts = [`입력: ${r.createdBy || "-"} ${fmtStamp(r.createdAt)}`];
  if (r.modifiedAt) parts.push(`최종수정: ${r.modifiedBy || "-"} ${fmtStamp(r.modifiedAt)}`);
  return parts.join("\n");
}

/** 한 줄 표시 (목록 요약 등) */
export function auditInline(r: AuditFields): string {
  const mod = r.modifiedBy && r.modifiedBy !== r.createdBy ? ` → ${r.modifiedBy}` : "";
  return `${r.createdBy || "-"}${mod} · ${fmtStamp(lastInputAt(r), true)}`;
}
