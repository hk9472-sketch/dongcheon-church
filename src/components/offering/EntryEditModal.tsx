"use client";

import { useState, useEffect } from "react";

const OFFERING_TYPES = [
  "주일연보",
  "십일조연보",
  "감사연보",
  "특별연보",
  "오일연보",
  "절기연보",
] as const;

interface SavedEntry {
  id: number;
  date: string;
  memberId: number | null;
  offeringType: string;
  amount: number;
  description: string | null;
}

interface Props {
  entry: SavedEntry;
  onClose: () => void;
  onSaved: () => void;
}

export default function EntryEditModal({ entry, onClose, onSaved }: Props) {
  const [date, setDate] = useState(entry.date.slice(0, 10));
  const [memberId, setMemberId] = useState(entry.memberId?.toString() || "");
  const [offeringType, setOfferingType] = useState(entry.offeringType);
  const [amount, setAmount] = useState(entry.amount.toString());
  const [description, setDescription] = useState(entry.description || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const mid = memberId.trim() === "" ? null : parseInt(memberId, 10);
      const amt = parseInt(amount.replace(/[^\d-]/g, ""), 10);
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error("금액은 양의 정수여야 합니다.");
      }
      const res = await fetch(`/api/accounting/offering/entries/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          memberId: mid,
          offeringType,
          amount: amt,
          description: description || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">연보 내역 수정</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-3 px-5 py-3 text-sm">
          <div>
            <label className="block text-xs text-gray-500 mb-1">일자</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">관리번호 (없으면 비움)</label>
            <input
              type="text"
              inputMode="numeric"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="0 또는 비워두면 익명"
              className="w-full rounded border border-gray-300 px-2 py-1.5"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">연보종류</label>
            <select
              value={offeringType}
              onChange={(e) => setOfferingType(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5"
            >
              {OFFERING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">금액</label>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-right font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">비고</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded border border-gray-300 bg-white px-4 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
