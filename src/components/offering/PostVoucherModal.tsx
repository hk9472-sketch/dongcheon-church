"use client";

import { useEffect, useState } from "react";

interface Props {
  date: string;
  /** 절기 금액 — 0 이면 절기 선택 라디오 안 보임 */
  seasonAmount: number;
  /** 미리보기용 합계 (sunday 는 차액 반영 후 값) */
  totals: {
    tithe: number;
    sunday: number;
    thanks: number;
    special: number;
    oil: number;
    season: number;
    sundaySchool: number;
  };
  /** 차액(매수합 - 입력합)이 양수면 그 값. 주일연보에 자동 가산됐음을 안내. */
  diffApplied: number;
  sundaySchool: number;
  onClose: () => void;
  onSuccess: () => void;
}

const SEASON_TYPES = ["부활감사", "맥추감사", "추수감사", "성탄감사"] as const;
type SeasonType = (typeof SEASON_TYPES)[number];

const fmt = (n: number) => n.toLocaleString("ko-KR");

// 카테고리 → 회계단위 매핑 (서버와 동일)
const TITHE_UNIT = "십일조회계";
const SS_UNIT = "주교회계";
const GEN_UNIT = "일반회계";

export default function PostVoucherModal({
  date,
  seasonAmount,
  totals,
  diffApplied,
  sundaySchool,
  onClose,
  onSuccess,
}: Props) {
  const [seasonType, setSeasonType] = useState<SeasonType | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 실제 POST 요청 — force 옵션으로 덮어쓰기 강제
  const callApi = async (force: boolean) => {
    const res = await fetch("/api/accounting/offering/settlement/post-voucher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        sundaySchool,
        seasonType: seasonType || undefined,
        force,
      }),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  };

  const submit = async () => {
    setError(null);
    if (seasonAmount > 0 && !seasonType) {
      setError("절기 금액이 있어 종류(부활/맥추/추수/성탄)를 선택해야 합니다.");
      return;
    }
    setBusy(true);
    try {
      // 1차 시도: force=false. 기존 자동전표 있으면 409+needsConfirm 응답
      let res = await callApi(false);

      if (res.status === 409 && res.data?.needsConfirm) {
        const existing = (res.data.existing || []) as Array<{
          unitName: string;
          voucherNo: string;
          totalAmount: number;
        }>;
        const list = existing
          .map((e) => `· ${e.unitName} ${e.voucherNo} (${fmt(e.totalAmount)}원)`)
          .join("\n");
        const ok = confirm(
          `이 일자에 이미 자동생성된 결산 전표가 ${existing.length}건 있습니다.\n\n${list}\n\n` +
            `덮어쓰면 위 전표를 삭제하고 현재 데이터로 새로 생성합니다.\n계속하시겠습니까?`,
        );
        if (!ok) {
          setBusy(false);
          return;
        }
        // 2차 시도: force=true
        res = await callApi(true);
      }

      if (!res.ok) throw new Error(res.data?.error || "전표 반영 실패");

      const data = res.data;
      let msg = `회계단위별 전표 ${data.vouchers.length}건 생성됨:\n\n`;
      for (const v of data.vouchers) {
        msg += `· ${v.unitName} : ${v.voucherNo} (${v.items}건, ${fmt(v.total)}원)\n`;
      }
      const warns: string[] = [];
      if (Array.isArray(data.missingUnits) && data.missingUnits.length > 0) {
        warns.push(`회계단위 미설정: ${data.missingUnits.join(", ")}`);
      }
      if (Array.isArray(data.missingAccounts) && data.missingAccounts.length > 0) {
        warns.push(`계정과목 미설정: ${data.missingAccounts.join(", ")}`);
      }
      if (warns.length > 0) {
        msg += `\n⚠ ${warns.join(" / ")}\n→ 회계 설정에서 추가 후 재반영 가능`;
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

  // 단위별 그룹핑 (미리보기)
  type Row = { unit: string; label: string; amount: number };
  const all: Row[] = [
    { unit: TITHE_UNIT, label: "십일조연보", amount: totals.tithe },
    { unit: GEN_UNIT, label: "주일연보", amount: totals.sunday },
    { unit: GEN_UNIT, label: "감사연보", amount: totals.thanks },
    { unit: GEN_UNIT, label: "특별연보", amount: totals.special },
    { unit: GEN_UNIT, label: "오일연보", amount: totals.oil },
    {
      unit: GEN_UNIT,
      label: seasonType ? `절기 (${seasonType})` : "절기연보",
      amount: totals.season,
    },
    { unit: SS_UNIT, label: "주일학교", amount: totals.sundaySchool },
  ].filter((r) => r.amount > 0);

  // 단위별 묶기
  const grouped: Record<string, Row[]> = {};
  for (const r of all) {
    if (!grouped[r.unit]) grouped[r.unit] = [];
    grouped[r.unit].push(r);
  }
  const unitNames = Object.keys(grouped);

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

          {diffApplied > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              💡 차액 <strong>{fmt(diffApplied)}</strong>원이 주일연보 금액에 자동 가산되어
              전표에 반영됩니다.
            </div>
          )}
          <div className="rounded border border-gray-200 bg-gray-50 p-2">
            <div className="text-xs text-gray-500 mb-1">반영될 전표 (회계단위별 분리)</div>
            {unitNames.length === 0 ? (
              <div className="text-xs text-gray-400">반영할 금액 없음</div>
            ) : (
              <div className="space-y-2">
                {unitNames.map((unit) => {
                  const rows = grouped[unit];
                  const sum = rows.reduce((s, r) => s + r.amount, 0);
                  return (
                    <div key={unit} className="border border-gray-300 rounded bg-white">
                      <div className="px-2 py-1 bg-blue-50 border-b text-xs font-semibold text-blue-800">
                        {unit}
                      </div>
                      <table className="w-full text-xs">
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={i}>
                              <td className="px-2 py-0.5">{r.label}</td>
                              <td className="px-2 py-0.5 text-right font-mono">
                                {fmt(r.amount)}
                              </td>
                            </tr>
                          ))}
                          <tr className="border-t font-semibold">
                            <td className="px-2 py-1">소계</td>
                            <td className="px-2 py-1 text-right font-mono">{fmt(sum)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="text-[11px] text-gray-500">
            ※ 십일조→<strong>{TITHE_UNIT}</strong>, 주일학교→<strong>{SS_UNIT}</strong>,
            그 외→<strong>{GEN_UNIT}</strong> 으로 자동 분리. 각 단위 안에 동일 이름의
            수입(D) 계정과목이 있어야 매칭됩니다.
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
            disabled={busy || all.length === 0}
            className="rounded bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            전표 반영
          </button>
        </div>
      </div>
    </div>
  );
}
