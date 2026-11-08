"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 회계 전표 증빙자료(이미지 / PDF) — 보기 · 올리기 · 지우기 공용 컴포넌트
 *   - EvidenceBadge   : 목록용 클립 아이콘 + 개수 (누르면 보기 창)
 *   - EvidenceViewer  : 크게 보기 창 (이미지 / PDF, 이전·다음, 내려받기)
 *   - EvidencePanel   : 저장된 전표의 증빙 목록 + 추가 · 삭제
 *   - PendingEvidence : 아직 저장 전인 전표에 붙일 파일 고르기 (저장 후 uploadEvidence 로 올림)
 * 파일은 서버에 <전표번호>-<일련번호>(예: 20261108-001-001.pdf) 로 저장된다 — 그 이름을 '증빙번호'로 보여준다.
 */

export interface EvidenceItem {
  id: number;
  seq?: number;
  storedPath?: string;
  origName: string;
  mimeType: string;
  fileSize: number;
  createdBy?: string;
  createdAt?: string;
}

export const EVIDENCE_ACCEPT = "image/*,.pdf,.heic,.heif,application/pdf";

export const evidenceUrl = (id: number, download = false) =>
  `/api/accounting/attachments/${id}${download ? "?download=1" : ""}`;

/** 서버 저장 이름(증빙번호) — 예: 20261108-001-001.pdf */
export function evidenceNo(it: EvidenceItem): string {
  return it.storedPath ? it.storedPath.split("/").pop() || it.origName : it.origName;
}

const isImage = (m: string) => m.startsWith("image/") && m !== "image/heic";
const isPdf = (m: string) => m === "application/pdf";
const fmtSize = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;

function ClipIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
      />
    </svg>
  );
}

/** 저장된 전표에 파일 올리기 */
export async function uploadEvidence(
  voucherId: number,
  files: File[],
): Promise<{ ok: true; items: EvidenceItem[] } | { ok: false; error: string }> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  try {
    const res = await fetch(`/api/accounting/vouchers/${voucherId}/attachments`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "증빙 올리기 실패" };
    return { ok: true, items: data.items || [] };
  } catch {
    return { ok: false, error: "증빙 올리기 실패 (네트워크)" };
  }
}

/* ───────────────────────── 보기 창 ───────────────────────── */
export function EvidenceViewer({
  items,
  start = 0,
  title,
  onClose,
}: {
  items: EvidenceItem[];
  start?: number;
  title?: string;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(Math.min(start, Math.max(0, items.length - 1)));
  const it = items[idx];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => Math.min(items.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, onClose]);

  if (!it || typeof document === "undefined") return null;
  // body 로 portal — 목록 줄(button) 안에서 열려도 DOM 이 섞이지 않게. 클릭이 바깥 줄로 번지지 않게 막음.
  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-3 print:hidden"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-gray-800">
              {title ? `${title} · ` : ""}증빙 {idx + 1}/{items.length} — {evidenceNo(it)}
            </div>
            <div className="truncate text-xs text-gray-400">
              {it.origName} · {fmtSize(it.fileSize)}
              {it.createdBy ? ` · ${it.createdBy}` : ""}
            </div>
          </div>
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => setIdx(idx - 1)}
            className="rounded border border-gray-300 px-2.5 py-1 text-sm disabled:opacity-30"
          >
            ◀ 이전
          </button>
          <button
            type="button"
            disabled={idx >= items.length - 1}
            onClick={() => setIdx(idx + 1)}
            className="rounded border border-gray-300 px-2.5 py-1 text-sm disabled:opacity-30"
          >
            다음 ▶
          </button>
          <a
            href={evidenceUrl(it.id, true)}
            className="rounded bg-teal-600 px-3 py-1 text-sm text-white hover:bg-teal-700"
          >
            내려받기
          </a>
          <a
            href={evidenceUrl(it.id)}
            target="_blank"
            rel="noopener"
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            새 창
          </a>
          <button type="button" onClick={onClose} className="px-2 text-xl leading-none text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-100">
          {isImage(it.mimeType) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={evidenceUrl(it.id)} alt={it.origName} className="max-h-full max-w-full object-contain" />
          ) : isPdf(it.mimeType) ? (
            <iframe src={evidenceUrl(it.id)} title={it.origName} className="h-full w-full border-0 bg-white" />
          ) : (
            <div className="p-8 text-center text-sm text-gray-500">
              이 형식(아이폰 HEIC 사진 등)은 화면에서 바로 볼 수 없습니다.
              <br />
              <a href={evidenceUrl(it.id, true)} className="text-teal-700 underline">
                내려받아
              </a>{" "}
              사진 앱에서 열어 주세요.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────────────── 목록용 배지 ───────────────────────── */
export function EvidenceBadge({ items, title }: { items?: EvidenceItem[] | null; title?: string }) {
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return null;
  return (
    <>
      {/* 목록 줄 자체가 button 인 곳(오늘의 전표 등)에도 넣을 수 있게 span 으로 */}
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
        className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 print:hidden"
        title={`증빙 ${items.length}개 보기`}
      >
        <ClipIcon className="w-3 h-3" />
        {items.length}
      </span>
      {open && <EvidenceViewer items={items} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ───────────────────────── 파일 고르기 칸 ───────────────────────── */
function DropZone({ onFiles, disabled, hint }: { onFiles: (f: File[]) => void; disabled?: boolean; hint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled && e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={`flex flex-wrap items-center gap-2 rounded-lg border-2 border-dashed px-3 py-2 text-xs ${
        over ? "border-teal-500 bg-teal-50" : "border-gray-300 bg-gray-50"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-1 rounded border border-teal-600 bg-white px-2.5 py-1 font-semibold text-teal-700 hover:bg-teal-50"
      >
        <ClipIcon /> 증빙 추가
      </button>
      <span className="text-gray-500">{hint ?? "영수증 사진 · PDF 를 고르거나 여기로 끌어 놓으세요 (파일당 20MB)"}</span>
      <input
        ref={ref}
        type="file"
        multiple
        accept={EVIDENCE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files || []);
          e.target.value = "";
          if (fs.length) onFiles(fs);
        }}
      />
    </div>
  );
}

function Thumb({ it, onOpen }: { it: EvidenceItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-200 bg-white hover:ring-2 hover:ring-teal-400"
      title="크게 보기"
    >
      {isImage(it.mimeType) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={evidenceUrl(it.id)} alt={it.origName} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="text-[11px] font-bold text-red-600">{isPdf(it.mimeType) ? "PDF" : "HEIC"}</span>
      )}
    </button>
  );
}

/* ───────────────────────── 저장된 전표의 증빙 칸 ───────────────────────── */
export function EvidencePanel({
  voucherId,
  initial,
  closed,
  title,
  onChange,
}: {
  voucherId: number;
  initial?: EvidenceItem[];
  closed?: boolean; // 마감된 전표 — 추가는 되지만 삭제는 안 됨
  title?: string;
  onChange?: (items: EvidenceItem[]) => void;
}) {
  const [items, setItems] = useState<EvidenceItem[]>(initial ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [view, setView] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/accounting/vouchers/${voucherId}/attachments`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setItems(data.items || []);
      onChange?.(data.items || []);
    }
  }, [voucherId, onChange]);

  useEffect(() => {
    if (!initial) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherId]);

  async function add(files: File[]) {
    setBusy(true);
    setMsg(null);
    const r = await uploadEvidence(voucherId, files);
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    setMsg({ ok: true, text: `증빙 ${r.items.length}개를 올렸습니다.` });
    await load();
  }

  async function remove(it: EvidenceItem) {
    if (!confirm(`증빙 ${evidenceNo(it)} (${it.origName}) 을(를) 삭제할까요?`)) return;
    const res = await fetch(evidenceUrl(it.id), { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ ok: false, text: data.error || "삭제 실패" });
      return;
    }
    await load();
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((it, i) => (
            <div key={it.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-1.5 pr-2">
              <Thumb it={it} onOpen={() => setView(i)} />
              <div className="min-w-0 text-xs">
                <div className="font-mono font-semibold text-gray-700">{evidenceNo(it)}</div>
                <div className="max-w-[180px] truncate text-gray-400" title={it.origName}>
                  {it.origName}
                </div>
                <div className="mt-0.5 flex gap-2">
                  <a href={evidenceUrl(it.id, true)} className="text-teal-700 hover:underline">
                    내려받기
                  </a>
                  {!closed && (
                    <button type="button" onClick={() => remove(it)} className="text-red-500 hover:underline">
                      삭제
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <DropZone onFiles={add} disabled={busy} hint={busy ? "올리는 중..." : undefined} />
      {msg && <div className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</div>}
      {closed && <div className="text-[11px] text-gray-400">마감된 전표 — 증빙 추가만 되고 삭제는 [월마감] 해제 후 가능합니다.</div>}
      {view !== null && <EvidenceViewer items={items} start={view} title={title} onClose={() => setView(null)} />}
    </div>
  );
}

/* ───────────────────────── 저장 전 전표의 파일 고르기 ───────────────────────── */
export function PendingEvidence({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-1">
              <ClipIcon />
              <span className="max-w-[200px] truncate" title={f.name}>
                {f.name}
              </span>
              <span className="text-gray-400">{fmtSize(f.size)}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="text-red-500 hover:text-red-700"
                title="빼기"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <DropZone
        onFiles={(fs) => onChange([...files, ...fs])}
        hint="저장할 때 함께 올라갑니다 — 영수증 사진 · PDF (파일당 20MB)"
      />
    </div>
  );
}
