"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import type {
  AllocationResult,
  DenomCounts,
  AllocationGroup,
} from "@/lib/offeringAllocation";

interface Categories {
  amtTithe: number;
  amtSunday: number;
  amtThanks: number;
  amtSpecial: number;
  amtOil: number;
  amtSeason: number;
}

const ZERO_CAT: Categories = {
  amtTithe: 0,
  amtSunday: 0,
  amtThanks: 0,
  amtSpecial: 0,
  amtOil: 0,
  amtSeason: 0,
};
const ZERO_COUNTS: DenomCounts = {
  check: 0,
  w50000: 0,
  w10000: 0,
  w5000: 0,
  w1000: 0,
  w500: 0,
  w100: 0,
  w50: 0,
  w10: 0,
};

const fmt = (n: number) => n.toLocaleString("ko-KR");

const DENOM_ROWS: { key: keyof DenomCounts; label: string; unit: number | null }[] = [
  { key: "check", label: "수표 (총액)", unit: null },
  { key: "w50000", label: "50,000원", unit: 50000 },
  { key: "w10000", label: "10,000원", unit: 10000 },
  { key: "w5000", label: "5,000원", unit: 5000 },
  { key: "w1000", label: "1,000원", unit: 1000 },
  { key: "w500", label: "500원", unit: 500 },
  { key: "w100", label: "100원", unit: 100 },
  { key: "w50", label: "50원", unit: 50 },
  { key: "w10", label: "10원", unit: 10 },
];

export default function OfferingSettlementPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedMode, setSavedMode] = useState<"new" | "saved">("new");
  const [categories, setCategories] = useState<Categories>(ZERO_CAT);
  const [counts, setCounts] = useState<DenomCounts>(ZERO_COUNTS);
  const [allocation, setAllocation] = useState<AllocationResult | null>(null);
  const [previewCalc, setPreviewCalc] = useState<{
    diff: number;
    finalSunday: number;
    generalAmount: number;
    titheAmount: number;
    cashTotal: number;
    inputTotal: number;
  } | null>(null);
  const [finalizedAt, setFinalizedAt] = useState<string | null>(null);
  const [finalizedBy, setFinalizedBy] = useState<string | null>(null);

  const inputTotal = useMemo(
    () =>
      categories.amtTithe +
      categories.amtSunday +
      categories.amtThanks +
      categories.amtSpecial +
      categories.amtOil +
      categories.amtSeason,
    [categories],
  );

  const cashTotal = useMemo(
    () =>
      counts.check +
      counts.w50000 * 50000 +
      counts.w10000 * 10000 +
      counts.w5000 * 5000 +
      counts.w1000 * 1000 +
      counts.w500 * 500 +
      counts.w100 * 100 +
      counts.w50 * 50 +
      counts.w10 * 10,
    [counts],
  );

  const diff = Math.max(0, cashTotal - inputTotal);

  // 일자 변경 → 카테고리 + 기존 결산 로드
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAllocation(null);
    setPreviewCalc(null);
    setFinalizedAt(null);
    setFinalizedBy(null);
    try {
      const res = await fetch(`/api/accounting/offering/settlement?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");

      if (data.mode === "saved") {
        const s = data.settlement;
        setSavedMode("saved");
        setCategories({
          amtTithe: s.amtTithe,
          amtSunday: s.amtSunday,
          amtThanks: s.amtThanks,
          amtSpecial: s.amtSpecial,
          amtOil: s.amtOil,
          amtSeason: s.amtSeason,
        });
        setCounts({
          check: s.cashCheck,
          w50000: s.cnt50000,
          w10000: s.cnt10000,
          w5000: s.cnt5000,
          w1000: s.cnt1000,
          w500: s.cnt500,
          w100: s.cnt100,
          w50: s.cnt50,
          w10: s.cnt10,
        });
        setAllocation(s.allocation);
        setFinalizedAt(s.finalizedAt);
        setFinalizedBy(s.finalizedBy);
      } else {
        setSavedMode("new");
        setCategories(data.categories);
        setCounts(ZERO_COUNTS);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const updateCount = (key: keyof DenomCounts, value: string) => {
    const n = parseInt(value.replace(/[^\d]/g, ""), 10) || 0;
    setCounts((prev) => ({ ...prev, [key]: n }));
    setAllocation(null);
    setPreviewCalc(null);
  };

  // 분배 미리보기
  const preview = async () => {
    setError(null);
    try {
      const res = await fetch("/api/accounting/offering/settlement/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories, denominations: counts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "미리보기 실패");
      setAllocation(data.allocation);
      setPreviewCalc({
        diff: data.diff,
        finalSunday: data.finalCategories.amtSunday,
        generalAmount: data.generalAmount,
        titheAmount: data.titheAmount,
        cashTotal: data.cashTotal,
        inputTotal: data.inputTotal,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "미리보기 실패");
    }
  };

  // 최종 확정
  const finalize = async () => {
    if (cashTotal < inputTotal) {
      alert(`매수합(${fmt(cashTotal)})이 입력합(${fmt(inputTotal)})보다 적습니다.`);
      return;
    }
    if (
      !confirm(
        `${date} 결산을 확정합니다.\n\n` +
          `· 차액 ${fmt(diff)}원이 주일연보로 추가됨\n` +
          `· 매수 분배 결과 저장\n` +
          `· 확정 후 잠김 (수정 불가)\n\n계속하시겠습니까?`,
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounting/offering/settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, denominations: counts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "확정 실패");
      alert("결산이 확정되었습니다.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "확정 실패");
    } finally {
      setLoading(false);
    }
  };

  const isFinalized = !!finalizedAt;
  const general = allocation?.general;
  const tithe = allocation?.tithe;

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">연보 일별 결산</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isFinalized && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          🔒 확정됨 — {finalizedAt && new Date(finalizedAt).toLocaleString("ko-KR")} ·{" "}
          {finalizedBy} (수정 불가)
        </div>
      )}

      {/* 카테고리별 입력 금액 */}
      <section className="rounded-lg border bg-white shadow-sm">
        <header className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
          1. 카테고리별 입력 금액 (DB 자동 집계)
        </header>
        <table className="w-full text-sm">
          <tbody>
            <CatRow label="십일조연보" value={categories.amtTithe} highlight="amber" />
            <CatRow label="주일연보" value={categories.amtSunday} />
            <CatRow label="감사연보" value={categories.amtThanks} />
            <CatRow label="특별연보" value={categories.amtSpecial} />
            <CatRow label="오일연보" value={categories.amtOil} />
            <CatRow label="절기연보" value={categories.amtSeason} />
            <tr className="border-t bg-gray-50 font-semibold">
              <td className="px-4 py-2">일반합계 (주일+감사+특별+오일+절기)</td>
              <td className="px-4 py-2 text-right text-emerald-700">
                {fmt(
                  categories.amtSunday +
                    categories.amtThanks +
                    categories.amtSpecial +
                    categories.amtOil +
                    categories.amtSeason,
                )}
              </td>
            </tr>
            <tr className="border-t font-bold">
              <td className="px-4 py-2">총계</td>
              <td className="px-4 py-2 text-right">{fmt(inputTotal)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 매수 입력 */}
      <section className="rounded-lg border bg-white shadow-sm">
        <header className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
          2. 화폐 매수 입력
        </header>
        <table className="w-full text-sm">
          <thead className="border-b text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">종류</th>
              <th className="px-4 py-2 text-right font-medium w-32">매수 / 총액</th>
              <th className="px-4 py-2 text-right font-medium w-40">금액</th>
            </tr>
          </thead>
          <tbody>
            {DENOM_ROWS.map((row) => {
              const v = counts[row.key];
              const amount = row.unit ? v * row.unit : v;
              return (
                <tr key={row.key} className="border-b last:border-b-0">
                  <td className="px-4 py-2">{row.label}</td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={v === 0 ? "" : v.toLocaleString()}
                      onChange={(e) => updateCount(row.key, e.target.value)}
                      disabled={isFinalized || loading}
                      placeholder={row.unit ? "매수" : "총액"}
                      className="w-32 rounded border border-gray-300 px-2 py-1 text-right disabled:bg-gray-100"
                    />
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(amount)}</td>
                </tr>
              );
            })}
            <tr className="border-t bg-gray-50 font-bold">
              <td className="px-4 py-2">매수 합계</td>
              <td className="px-4 py-2"></td>
              <td className="px-4 py-2 text-right">{fmt(cashTotal)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 차액 */}
      <section className="rounded-lg border bg-white shadow-sm">
        <header className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
          3. 차액 — 매수합 vs 입력합
        </header>
        <div className="px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">매수 합계</span>
            <span className="font-mono">{fmt(cashTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">입력 합계</span>
            <span className="font-mono">{fmt(inputTotal)}</span>
          </div>
          <div
            className={`flex justify-between border-t pt-1 font-bold ${
              cashTotal < inputTotal ? "text-red-600" : "text-emerald-700"
            }`}
          >
            <span>차액 (주일연보 추가 예정)</span>
            <span className="font-mono">{fmt(diff)}</span>
          </div>
          {cashTotal < inputTotal && (
            <div className="text-xs text-red-600">
              ⚠ 매수합이 입력합보다 적습니다 — 매수를 다시 확인하거나 연보 입력을 점검하세요.
            </div>
          )}
        </div>
      </section>

      {/* 분배 결과 */}
      <section className="rounded-lg border bg-white shadow-sm">
        <header className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 flex items-center justify-between">
          <span>4. 일반/십일조 분배</span>
          {!isFinalized && (
            <button
              type="button"
              onClick={preview}
              disabled={loading || cashTotal === 0}
              className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              분배 계산
            </button>
          )}
        </header>
        {!allocation ? (
          <div className="p-6 text-center text-sm text-gray-500">
            매수 입력 후 "분배 계산" 버튼을 눌러주세요.
          </div>
        ) : (
          <>
            {previewCalc && (
              <div className="px-4 py-2 text-xs text-gray-600 bg-blue-50 border-b">
                일반금액(주일+감사+특별+오일+절기, 차액 반영) {fmt(previewCalc.generalAmount)} ·
                십일조 {fmt(previewCalc.titheAmount)}
                {!allocation.exact && (
                  <span className="ml-2 text-amber-700">
                    ⚠ 매수가 단위로 안 떨어져 일부 수표 분배로 흡수됨
                  </span>
                )}
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="border-b text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">종류</th>
                  <th className="px-4 py-2 text-right font-medium">일반 매수</th>
                  <th className="px-4 py-2 text-right font-medium">일반 금액</th>
                  <th className="px-4 py-2 text-right font-medium">십일조 매수</th>
                  <th className="px-4 py-2 text-right font-medium">십일조 금액</th>
                </tr>
              </thead>
              <tbody>
                {DENOM_ROWS.map((row) => {
                  const gv = general?.[row.key as keyof AllocationGroup] ?? 0;
                  const tv = tithe?.[row.key as keyof AllocationGroup] ?? 0;
                  const gAmt = row.unit ? gv * row.unit : gv;
                  const tAmt = row.unit ? tv * row.unit : tv;
                  return (
                    <tr key={row.key} className="border-b last:border-b-0">
                      <td className="px-4 py-2">{row.label}</td>
                      <td className="px-4 py-2 text-right">
                        {row.unit ? gv : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{fmt(gAmt)}</td>
                      <td className="px-4 py-2 text-right">
                        {row.unit ? tv : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{fmt(tAmt)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t bg-gray-50 font-bold">
                  <td className="px-4 py-2">합계</td>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2 text-right text-emerald-700">
                    {fmt(general ? sumGroup(general) : 0)}
                  </td>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2 text-right text-amber-700">
                    {fmt(tithe ? sumGroup(tithe) : 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </section>

      {/* 확정 */}
      {!isFinalized && (
        <div className="flex justify-end gap-2 sticky bottom-2 bg-white border rounded-lg shadow-md p-3">
          <span className="text-xs text-gray-500 self-center mr-auto">
            확정하면 차액이 주일연보 entry 로 추가되고 결산이 잠깁니다.
          </span>
          <button
            type="button"
            onClick={finalize}
            disabled={loading || cashTotal < inputTotal || cashTotal === 0}
            className="rounded bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            최종 확정
          </button>
        </div>
      )}

      {savedMode === "saved" && isFinalized && (
        <div className="text-xs text-gray-500 text-center">
          이 결산은 {finalizedBy} 가 확정했습니다. 변경하려면 관리자에게 문의하세요.
        </div>
      )}
    </div>
  );
}

function CatRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: "amber";
}) {
  const cellClass =
    highlight === "amber"
      ? "px-4 py-2 text-right font-mono bg-amber-50 text-amber-900 font-semibold"
      : "px-4 py-2 text-right font-mono";
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-4 py-2">{label}</td>
      <td className={cellClass}>{value.toLocaleString("ko-KR")}</td>
    </tr>
  );
}

function sumGroup(g: AllocationGroup): number {
  return (
    g.check +
    g.w50000 * 50000 +
    g.w10000 * 10000 +
    g.w5000 * 5000 +
    g.w1000 * 1000 +
    g.w500 * 500 +
    g.w100 * 100 +
    g.w50 * 50 +
    g.w10 * 10
  );
}
