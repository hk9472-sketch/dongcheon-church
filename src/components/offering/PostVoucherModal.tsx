"use client";

import { useEffect, useState } from "react";

interface AccUnit {
  id: number;
  name: string;
  code: string;
}

interface Props {
  date: string;
  /** 절기 금액 — 0 이면 절기 선택 라디오 안 보임 */
  seasonAmount: number;
  /** 미리보기용 합계 */
  totals: {
    tithe: number;
    sunday: number;
    thanks: number;
    special: number;
    oil: number;
    season: number;
    sundaySchool: number;
  };
  sundaySchool: number;
  onClose: () => void;
  onSuccess: () => void;
}

const SEASON_TYPES = ["부활감사", "맥추감사", "추수감사", "성탄감사"] as const;
type SeasonType = (typeof SEASON_TYPES)[number];

const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function PostVoucherModal({
  date,
  seasonAmount,
  totals,
  sundaySchool,
  onClose,
  onSuccess,
}: Props) {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [seasonType, setSeasonType] = useState<SeasonType | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/accounting/units")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : d.units || [];
        setUnits(list);
        if (list.length > 0) setUnitId(list[0].id);
      })
      .catch(() => setError("회계단위 조회 실패"));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    setError(null);
    if (!unitId) {
      setError("회계단위를 선택하세요.");
      return;
    }
    if (seasonAmount > 0 && !seasonType) {
      setError("절기 금액이 있어 종류(부활/맥추/추수/성탄)를 선택해야 합니다.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/accounting/offering/settlement/post-voucher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          unitId,
          sundaySchool,
          seasonType: seasonType || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "전표 반영 실패");
      let msg = `전표 ${data.voucher.voucherNo} 생성됨 (${data.items}건)`;
      if (Array.isArray(data.missing) && data.missing.length > 0) {
        msg += `\n\n매칭 안 된 계정과목: ${data.missing.join(", ")}\n→ /accounting/settings/accounts 에서 동일 이름의 수입(D) 계정과목 추가 필요`;
      }
      alert(msg);
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "전표 반영 실패");
    } finally {
      setBusy(false);
    }
  };

  const items: Array<{ label: string; amount: number }> = [
    { label: "십일조연보", amount: totals.tithe },
    { label: "주일연보", amount: totals.sunday },
    { label: "감사연보", amount: totals.thanks },
    { label: "특별연보", amount: totals.special },
    { label: "오일연보", amount: totals.oil },
    { label: seasonType ? `절기 (${seasonType})` : "절기연보", amount: totals.season },
    { label: "주일학교", amount: totals.sundaySchool },
  ].filter((i) => i.amount > 0);

  const total = items.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">전표 반영 — {date}</h2>
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
          <div className="mx-4 mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 whitespace-pre-line">
            {error}
          </div>
        )}

        <div className="space-y-3 px-5 py-3 text-sm">
          <div>
            <label className="block text-xs text-gray-500 mb-1">회계단위</label>
            <select
              value={unitId ?? ""}
              onChange={(e) => setUnitId(parseInt(e.target.value, 10))}
              className="w-full rounded border border-gray-300 px-2 py-1.5"
            >
              {units.length === 0 && <option value="">회계단위 없음</option>}
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.code})
                </option>
              ))}
            </select>
          </div>

          {seasonAmount > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                절기 종류 (절기 금액 {fmt(seasonAmount)}원)
              </label>
              <div className="flex flex-wrap gap-2">
                {SEASON_TYPES.map((t) => (
                  <label key={t} className="inline-flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      name="seasonType"
                      value={t}
                      checked={seasonType === t}
                      onChange={() => setSeasonType(t)}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="rounded border border-gray-200 bg-gray-50 p-2">
            <div className="text-xs text-gray-500 mb-1">반영될 항목</div>
            {items.length === 0 ? (
              <div className="text-xs text-gray-400">반영할 금액 없음</div>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {items.map((i) => (
                    <tr key={i.label}>
                      <td className="py-0.5">{i.label}</td>
                      <td className="py-0.5 text-right font-mono">{fmt(i.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold">
                    <td className="py-1">합계</td>
                    <td className="py-1 text-right font-mono">{fmt(total)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          <div className="text-[11px] text-gray-500">
            ※ 각 항목 이름과 동일한 수입(D) 계정과목이 회계단위에 등록돼 있어야 매칭됩니다.
            (예: "십일조연보", "주일학교", "부활감사" 등)
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
            onClick={submit}
            disabled={busy || items.length === 0}
            className="rounded bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            전표 반영
          </button>
        </div>
      </div>
    </div>
  );
}
