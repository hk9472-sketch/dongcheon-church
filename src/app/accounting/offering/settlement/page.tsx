"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import type {
  AllocationResult,
  DenomCounts,
  AllocationGroup,
} from "@/lib/offeringAllocation";
import { allocate as allocateFn } from "@/lib/offeringAllocation";
import PostVoucherModal from "@/components/offering/PostVoucherModal";
import AccountMappingPanel from "@/components/offering/AccountMappingPanel";

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
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [categories, setCategories] = useState<Categories>(ZERO_CAT);
  const [sundaySchool, setSundaySchool] = useState(0); // 장년반계와 별도, 매수·분배 로직엔 미반영
  const [envelopeCount, setEnvelopeCount] = useState(0); // 봉투수 (인쇄용)
  const [counts, setCounts] = useState<DenomCounts>(ZERO_COUNTS);
  const [allocation, setAllocation] = useState<AllocationResult | null>(null);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [tab, setTab] = useState<"settlement" | "mapping">("settlement");

  // 분배표의 매수 셀을 편집할 때 호출 — 일반/십일조 매수를 직접 수정.
  // 매수 변경 시 같은 단위의 다른 측 매수는 (전체 매수 - 변경값) 으로 자동 sync.
  const updateAllocCount = (
    side: "general" | "tithe",
    key: keyof AllocationGroup,
    value: string,
  ) => {
    if (!allocation) return;
    const n = parseInt(value.replace(/[^\d]/g, ""), 10) || 0;
    setAllocation((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        general: { ...prev.general },
        tithe: { ...prev.tithe },
        residual: { ...prev.residual },
      };
      if (key === "check") {
        // 수표 금액 — 한쪽 입력 시 다른쪽 = 총액 - 입력. 입력 후 알고리즘 재실행.
        next[side].check = n;
        const otherSide = side === "general" ? "tithe" : "general";
        next[otherSide].check = Math.max(0, counts.check - n);
        // 즉시 client-side allocate 재실행 — 새 수표 분배로 amount 재산출
        const finalSundayLocal = categories.amtSunday + Math.max(0, cashTotal - inputTotal);
        const generalAmountLocal =
          finalSundayLocal +
          categories.amtThanks +
          categories.amtSpecial +
          categories.amtOil +
          categories.amtSeason;
        const titheAmountLocal = categories.amtTithe;
        const newAlloc = allocateFn(counts, generalAmountLocal, titheAmountLocal, {
          general: side === "general" ? n : Math.max(0, counts.check - n),
          tithe: side === "tithe" ? n : Math.max(0, counts.check - n),
        });
        return newAlloc;
      } else {
        // 매수 셀 직접 수정 — 한쪽 변경 시 다른쪽 = 전체 - 변경값 (자동 sync)
        const totalCnt = counts[key as keyof DenomCounts];
        next[side][key] = n;
        const otherSide = side === "general" ? "tithe" : "general";
        next[otherSide][key] = Math.max(0, totalCnt - n);
      }
      // residual 재계산 (매수만 변경한 경우)
      const finalSunday = categories.amtSunday + Math.max(0, cashTotal - inputTotal);
      const generalAmount =
        finalSunday +
        categories.amtThanks +
        categories.amtSpecial +
        categories.amtOil +
        categories.amtSeason;
      const titheAmount = categories.amtTithe;
      const sumGroupLocal = (g: AllocationGroup) =>
        g.check +
        g.w50000 * 50000 +
        g.w10000 * 10000 +
        g.w5000 * 5000 +
        g.w1000 * 1000 +
        g.w500 * 500 +
        g.w100 * 100 +
        g.w50 * 50 +
        g.w10 * 10;
      next.residual = {
        general: generalAmount - sumGroupLocal(next.general),
        tithe: titheAmount - sumGroupLocal(next.tithe),
      };
      next.exact = next.residual.general === 0 && next.residual.tithe === 0;
      return next;
    });
  };

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

  const diff = cashTotal - inputTotal;

  // 분배 목표 금액 — 일반 합계 = 주일+감사+특별+오일+절기 (+ 차액 양수면 주일에 가산)
  const titheTarget = categories.amtTithe;
  const generalTarget = useMemo(
    () =>
      categories.amtSunday +
      categories.amtThanks +
      categories.amtSpecial +
      categories.amtOil +
      categories.amtSeason +
      (diff > 0 ? diff : 0),
    [categories, diff],
  );

  // 일자 선택 → 기존 결산 또는 카테고리 자동 로드
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAllocation(null);
    setSavedAt(null);
    try {
      const res = await fetch(`/api/accounting/offering/settlement?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");

      if (data.mode === "saved") {
        const s = data.settlement;
        setCategories({
          amtTithe: s.amtTithe,
          amtSunday: s.amtSunday,
          amtThanks: s.amtThanks,
          amtSpecial: s.amtSpecial,
          amtOil: s.amtOil,
          amtSeason: s.amtSeason,
        });
        setSundaySchool(s.amtSundaySchool ?? 0);
        setEnvelopeCount(s.envelopeCount ?? 0);
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
        setSavedAt(s.updatedAt || s.createdAt || null);
      } else {
        setCategories(data.categories);
        setSundaySchool(0);
        setEnvelopeCount(0);
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

  // 새로고침 — 매수 입력은 유지, 카테고리 합계만 DB 에서 재집계
  const refreshCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounting/offering/settlement?date=${date}&refresh=1`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "새로고침 실패");
      setCategories(data.categories);
      setAllocation(null); // 카테고리 바뀌면 분배 다시 계산 필요
    } catch (e) {
      setError(e instanceof Error ? e.message : "새로고침 실패");
    } finally {
      setLoading(false);
    }
  };

  // 매수/금액 양방향 sync
  // 매수 변경 시 금액 = 매수 × 단위 (수표 제외)
  // 금액 변경 시 매수 = round(금액 / 단위)
  const updateCount = (key: keyof DenomCounts, value: string) => {
    const n = parseInt(value.replace(/[^\d]/g, ""), 10) || 0;
    setCounts((prev) => ({ ...prev, [key]: n }));
    setAllocation(null);
  };

  const updateAmount = (key: keyof DenomCounts, value: string) => {
    const amt = parseInt(value.replace(/[^\d]/g, ""), 10) || 0;
    const row = DENOM_ROWS.find((r) => r.key === key);
    if (!row) return;
    if (row.unit === null) {
      // 수표 — 금액 그대로 저장
      setCounts((prev) => ({ ...prev, [key]: amt }));
    } else {
      // 매수 = round(금액 / 단위)
      const cnt = Math.round(amt / row.unit);
      setCounts((prev) => ({ ...prev, [key]: cnt }));
    }
    setAllocation(null);
  };

  // 화살표키 ↑↓ 로 매수 입력란 위/아래 이동.
  // 칸 인덱스: 0=수표, 1=50000, ... 8=10원. 좌우는 매수↔금액 (수표는 금액만).
  const inputRefs = useRef<Array<Array<HTMLInputElement | null>>>(
    DENOM_ROWS.map(() => [null, null]),
  );
  const focusCell = (rowIdx: number, colIdx: number) => {
    const r = Math.max(0, Math.min(DENOM_ROWS.length - 1, rowIdx));
    const c = Math.max(0, Math.min(1, colIdx));
    const el = inputRefs.current[r]?.[c];
    if (el) {
      el.focus();
      el.select();
    } else {
      // fallback: 다른 컬럼 시도
      const other = inputRefs.current[r]?.[1 - c];
      other?.focus();
    }
  };
  const onCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number,
  ) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(rowIdx + 1, colIdx);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(rowIdx - 1, colIdx);
    } else if (e.key === "ArrowLeft" && (e.target as HTMLInputElement).selectionStart === 0) {
      e.preventDefault();
      focusCell(rowIdx, colIdx - 1);
    } else if (
      e.key === "ArrowRight" &&
      (e.target as HTMLInputElement).selectionEnd ===
        (e.target as HTMLInputElement).value.length
    ) {
      e.preventDefault();
      focusCell(rowIdx, colIdx + 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      focusCell(rowIdx + 1, colIdx);
    }
  };

  // 분배 미리보기
  const preview = async () => {
    setError(null);
    try {
      const res = await fetch("/api/accounting/offering/settlement/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories,
          denominations: counts,
          // 사용자가 분배 표에서 수표 분배를 직접 수정했으면 그 값 유지
          checkSplit: allocation
            ? { general: allocation.general.check, tithe: allocation.tithe.check }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "미리보기 실패");
      setAllocation(data.allocation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "미리보기 실패");
    }
  };

  // 저장 (잠금 없음 — 언제든 다시 수정 가능)
  const save = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounting/offering/settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          denominations: counts,
          allocation: allocation || undefined,
          sundaySchool,
          envelopeCount,
          // 작업자가 차액을 주일연보로 반영한 경우 등 categories 수동 조정 보존
          categories,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      setAllocation(data.settlement.allocation);
      setSavedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  const general = allocation?.general;
  const tithe = allocation?.tithe;

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">연보 일별 결산</h1>
        {tab === "settlement" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={refreshCategories}
              disabled={loading}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              title="해당 일자의 연보 입력 합계를 다시 불러옵니다 (매수 입력은 유지)"
            >
              연보 다시 불러오기
            </button>
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab("settlement")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            tab === "settlement"
              ? "border-teal-600 text-teal-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          결산
        </button>
        <button
          type="button"
          onClick={() => setTab("mapping")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            tab === "mapping"
              ? "border-teal-600 text-teal-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          계정과목 매핑
        </button>
      </div>

      {tab === "mapping" && <AccountMappingPanel />}

      {tab === "settlement" && error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {savedAt && (
        <div className="rounded border border-green-200 bg-green-50 p-2 text-xs text-green-800">
          마지막 저장: {new Date(savedAt).toLocaleString("ko-KR")}
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
              <td className="px-4 py-2">
                장년반계
                <span className="ml-3 text-xs font-normal text-gray-600">
                  봉투수
                  <input
                    type="text"
                    inputMode="numeric"
                    value={envelopeCount === 0 ? "" : envelopeCount.toLocaleString()}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 0;
                      setEnvelopeCount(n);
                    }}
                    placeholder="0"
                    className="ml-1 w-16 rounded border border-gray-300 px-1.5 py-0.5 text-right text-xs"
                  />
                  매
                </span>
              </td>
              <td className="px-4 py-2 text-right">{fmt(inputTotal)}</td>
            </tr>
            <tr className="border-t">
              <td className="px-4 py-2">주일학교 (수동 입력)</td>
              <td className="px-4 py-2 text-right">
                <input
                  type="text"
                  inputMode="numeric"
                  value={sundaySchool === 0 ? "" : sundaySchool.toLocaleString()}
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 0;
                    setSundaySchool(n);
                  }}
                  placeholder="0"
                  className="w-32 rounded border border-gray-300 px-2 py-1 text-right font-mono"
                />
              </td>
            </tr>
            <tr className="border-t bg-blue-50 font-bold">
              <td className="px-4 py-2">총계 (장년반계 + 주일학교)</td>
              <td className="px-4 py-2 text-right text-blue-800">
                {fmt(inputTotal + sundaySchool)}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="border-t px-4 py-2 flex justify-end gap-2">
          <a
            href={`/accounting/offering/settlement/print?date=${date}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            title="수입내역서 인쇄용 페이지"
          >
            인쇄
          </a>
          <button
            type="button"
            onClick={() => setVoucherOpen(true)}
            disabled={loading || inputTotal + sundaySchool === 0}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
            title="이 일자의 카테고리별 합계를 회계 수입(D) 전표로 반영"
          >
            전표 반영
          </button>
        </div>
      </section>

      {/* 매수 입력 */}
      <section className="rounded-lg border bg-white shadow-sm">
        <header className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
          2. 화폐 매수 입력{" "}
          <span className="ml-2 text-xs font-normal text-gray-500">
            (↑↓←→ 키로 칸 이동, Enter 로 다음 칸)
          </span>
        </header>
        <table className="w-full text-sm">
          <thead className="border-b text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">종류</th>
              <th className="px-4 py-2 text-right font-medium w-32">매수</th>
              <th className="px-4 py-2 text-right font-medium w-40">금액</th>
            </tr>
          </thead>
          <tbody>
            {DENOM_ROWS.map((row, idx) => {
              const v = counts[row.key];
              const amount = row.unit ? v * row.unit : v;
              const isCheck = row.unit === null;
              return (
                <tr key={row.key} className="border-b last:border-b-0">
                  <td className="px-4 py-2">{row.label}</td>
                  <td className="px-4 py-2 text-right">
                    {isCheck ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <input
                        ref={(el) => {
                          inputRefs.current[idx][0] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        value={v === 0 ? "" : v.toLocaleString()}
                        onChange={(e) => updateCount(row.key, e.target.value)}
                        onKeyDown={(e) => onCellKeyDown(e, idx, 0)}
                        disabled={loading}
                        placeholder="0"
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-right disabled:bg-gray-100"
                      />
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      ref={(el) => {
                        inputRefs.current[idx][1] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      value={amount === 0 ? "" : amount.toLocaleString()}
                      onChange={(e) => updateAmount(row.key, e.target.value)}
                      onKeyDown={(e) => onCellKeyDown(e, idx, 1)}
                      disabled={loading}
                      placeholder="0"
                      className="w-32 rounded border border-gray-300 px-2 py-1 text-right disabled:bg-gray-100"
                    />
                  </td>
                </tr>
              );
            })}
            <tr className="border-t bg-gray-50 font-bold">
              <td className="px-4 py-2">매수 합계</td>
              <td className="px-4 py-2 text-right">
                {fmt(
                  counts.w50000 +
                    counts.w10000 +
                    counts.w5000 +
                    counts.w1000 +
                    counts.w500 +
                    counts.w100 +
                    counts.w50 +
                    counts.w10,
                )}
              </td>
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
              diff < 0 ? "text-red-600" : "text-emerald-700"
            }`}
          >
            <span>차액 (매수합 - 입력합)</span>
            <span className="font-mono">{fmt(diff)}</span>
          </div>
          <div className="text-xs text-gray-500">
            ※ 분배 계산은 차액을 일반(주일연보)에 더해 일반/십일조 비율 산정에 반영합니다.
          </div>
          {diff > 0 && (
            <div className="pt-2 border-t mt-2 flex items-center justify-between gap-2">
              <div className="text-xs text-gray-600 flex-1">
                💡 차액 <strong className="text-emerald-700">{fmt(diff)}</strong> 원을
                상단 주일연보에 반영하면 합계가 매수합과 일치합니다. 저장 시 함께 보존되며,
                "연보 다시 불러오기" 누르면 원상태로 되돌아갑니다.
              </div>
              <button
                type="button"
                onClick={() => {
                  setCategories((prev) => ({
                    ...prev,
                    amtSunday: prev.amtSunday + diff,
                  }));
                  setAllocation(null);
                }}
                disabled={loading}
                className="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
              >
                주일연보에 반영
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 분배 결과 */}
      <section className="rounded-lg border bg-white shadow-sm">
        <header className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span>4. 일반/십일조 분배 (참고용)</span>
            <span className="text-xs font-normal">
              <span className="text-emerald-700">일반 {fmt(generalTarget)}</span>
              <span className="mx-1.5 text-gray-400">/</span>
              <span className="text-amber-700">십일조 {fmt(titheTarget)}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={preview}
            disabled={loading || cashTotal === 0}
            className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            분배 계산
          </button>
        </header>
        {!allocation ? (
          <div className="p-6 text-center text-sm text-gray-500">
            매수 입력 후 "분배 계산" 버튼을 눌러주세요.
          </div>
        ) : (
          <>
            {!allocation.exact && (
              <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b">
                ⚠ 매수가 단위로 안 떨어져 일부 잔여가 있습니다 — 담당자가 수표/세부 조정 필요.
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="border-b text-xs text-gray-500">
                <tr>
                  <th rowSpan={2} className="px-3 py-2 text-left font-medium border-r">
                    종류
                  </th>
                  <th colSpan={2} className="px-3 py-1 text-center font-medium border-r bg-gray-100">
                    전체
                  </th>
                  <th colSpan={2} className="px-3 py-1 text-center font-medium border-r bg-emerald-50">
                    일반
                  </th>
                  <th colSpan={2} className="px-3 py-1 text-center font-medium bg-amber-50">
                    십일조
                  </th>
                </tr>
                <tr>
                  <th className="px-3 py-1 text-right font-medium">매수</th>
                  <th className="px-3 py-1 text-right font-medium border-r">금액</th>
                  <th className="px-3 py-1 text-right font-medium">매수</th>
                  <th className="px-3 py-1 text-right font-medium border-r">금액</th>
                  <th className="px-3 py-1 text-right font-medium">매수</th>
                  <th className="px-3 py-1 text-right font-medium">금액</th>
                </tr>
              </thead>
              <tbody>
                {DENOM_ROWS.map((row) => {
                  const totCnt = counts[row.key];
                  const totAmt = row.unit ? totCnt * row.unit : totCnt;
                  const gv = general?.[row.key as keyof AllocationGroup] ?? 0;
                  const tv = tithe?.[row.key as keyof AllocationGroup] ?? 0;
                  const gAmt = row.unit ? gv * row.unit : gv;
                  const tAmt = row.unit ? tv * row.unit : tv;
                  const isCheck = row.unit === null;
                  return (
                    <tr key={row.key} className="border-b last:border-b-0">
                      <td className="px-3 py-2 border-r">{row.label}</td>
                      <td className="px-3 py-2 text-right">{row.unit ? totCnt : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono border-r">{fmt(totAmt)}</td>
                      <td className="px-2 py-1 text-right">
                        {isCheck ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={gv === 0 ? "" : gv.toLocaleString()}
                            onChange={(e) => updateAllocCount("general", row.key as keyof AllocationGroup, e.target.value)}
                            className="w-16 rounded border border-gray-200 px-1 py-0.5 text-right text-sm focus:border-emerald-500 focus:outline-none"
                          />
                        )}
                      </td>
                      <td className="px-2 py-1 text-right border-r">
                        {isCheck ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={gv === 0 ? "" : gv.toLocaleString()}
                            onChange={(e) => updateAllocCount("general", "check", e.target.value)}
                            className="w-24 rounded border border-gray-200 px-1 py-0.5 text-right text-sm font-mono focus:border-emerald-500 focus:outline-none"
                          />
                        ) : (
                          <span className="font-mono">{fmt(gAmt)}</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {isCheck ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={tv === 0 ? "" : tv.toLocaleString()}
                            onChange={(e) => updateAllocCount("tithe", row.key as keyof AllocationGroup, e.target.value)}
                            className="w-16 rounded border border-gray-200 px-1 py-0.5 text-right text-sm focus:border-amber-500 focus:outline-none"
                          />
                        )}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {isCheck ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={tv === 0 ? "" : tv.toLocaleString()}
                            onChange={(e) => updateAllocCount("tithe", "check", e.target.value)}
                            className="w-24 rounded border border-gray-200 px-1 py-0.5 text-right text-sm font-mono focus:border-amber-500 focus:outline-none"
                          />
                        ) : (
                          <span className="font-mono">{fmt(tAmt)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {general && tithe && (
                  <>
                    <tr className="border-t bg-gray-50 font-bold">
                      <td className="px-3 py-2 border-r">합계</td>
                      <td className="px-3 py-2 text-right">
                        {fmt(
                          counts.w50000 + counts.w10000 + counts.w5000 + counts.w1000,
                        )}
                      </td>
                      <td className="px-3 py-2 text-right border-r">{fmt(cashTotal)}</td>
                      <td className="px-3 py-2 text-right">{fmt(sumCount(general))}</td>
                      <td className="px-3 py-2 text-right text-emerald-700 border-r">
                        {fmt(sumGroup(general))}
                      </td>
                      <td className="px-3 py-2 text-right">{fmt(sumCount(tithe))}</td>
                      <td className="px-3 py-2 text-right text-amber-700">
                        {fmt(sumGroup(tithe))}
                      </td>
                    </tr>
                    {(allocation.residual.general !== 0 || allocation.residual.tithe !== 0) && (
                      <tr className="border-t bg-orange-50 font-semibold text-orange-800">
                        <td className="px-3 py-2 border-r">
                          잔여 (담당자 처리)
                          <div className="text-[10px] font-normal text-orange-600">
                            매수·수표로 정확히 분배 안 된 부분 — 별도 계산 필요
                          </div>
                        </td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 border-r"></td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right font-mono border-r">
                          {fmt(allocation.residual.general)}
                        </td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right font-mono">
                          {fmt(allocation.residual.tithe)}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </>
        )}
      </section>

      {/* 저장 */}
      <div className="flex justify-end gap-2 sticky bottom-2 bg-white border rounded-lg shadow-md p-3">
        <span className="text-xs text-gray-500 self-center mr-auto">
          저장 후에도 언제든 다시 수정할 수 있습니다 (잠금 없음).
        </span>
        <button
          type="button"
          onClick={save}
          disabled={loading}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          저장
        </button>
      </div>

      {voucherOpen && (
        <PostVoucherModal
          date={date}
          seasonAmount={categories.amtSeason}
          totals={{
            tithe: categories.amtTithe,
            // 차액 양수면 주일연보에 더해진 금액으로 미리 표시 (서버도 동일하게 처리)
            sunday: categories.amtSunday + (diff > 0 ? diff : 0),
            thanks: categories.amtThanks,
            special: categories.amtSpecial,
            oil: categories.amtOil,
            season: categories.amtSeason,
            sundaySchool,
          }}
          diffApplied={diff > 0 ? diff : 0}
          sundaySchool={sundaySchool}
          onClose={() => setVoucherOpen(false)}
          onSuccess={() => {}}
        />
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

function sumCount(g: AllocationGroup): number {
  // 매수 합계는 1000원 이상 지폐만 (수표는 매수 없음, 동전은 일반에 몰리므로 분배 표시에서 제외)
  return g.w50000 + g.w10000 + g.w5000 + g.w1000;
}
