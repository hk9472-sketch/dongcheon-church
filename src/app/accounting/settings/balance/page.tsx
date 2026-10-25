"use client";

import { useEffect, useState, useCallback } from "react";
import HelpButton from "@/components/HelpButton";

interface AccUnit {
  id: number;
  code: string;
  name: string;
}

interface FundRow {
  fundId: number;
  name: string;
  kind: string;
  isDefault: boolean;
  isActive: boolean;
  amount: number;
}

interface BalanceInfo {
  unitId: number;
  year: number;
  amount: number;
  exists: boolean;
  funds: FundRow[];
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const parseAmount = (value: string): number => Number(value.replace(/[^0-9-]/g, "")) || 0;

/** 입력 중 콤마 표시 — "-" 단독 입력은 유지 */
function formatInput(v: string): string {
  const raw = v.replace(/[^0-9-]/g, "");
  if (raw === "" || raw === "-") return raw;
  const n = Number(raw);
  return isNaN(n) ? "" : n.toLocaleString("ko-KR");
}

export default function AccBalancePage() {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [fundInputs, setFundInputs] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i + 1);

  useEffect(() => {
    fetch("/api/accounting/units")
      .then((r) => r.json())
      .then((d) => {
        const all = Array.isArray(d) ? d : d.units || [];
        const activeUnits = all.filter((u: AccUnit & { isActive: boolean }) => u.isActive);
        setUnits(activeUnits);
        if (activeUnits.length > 0) setSelectedUnitId((prev) => prev ?? activeUnits[0].id);
      })
      .catch(() => setError("회계단위를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  const fetchBalance = useCallback(async () => {
    if (!selectedUnitId) return;
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/accounting/balance?unitId=${selectedUnitId}&year=${selectedYear}`);
      const data: BalanceInfo = await res.json();
      if (!res.ok) throw new Error((data as unknown as { error?: string }).error || "조회 실패");
      setBalance(data);
      setAmount(data.exists ? fmt(data.amount) : "");
      const inputs: Record<number, string> = {};
      for (const f of data.funds || []) inputs[f.fundId] = f.amount ? fmt(f.amount) : "";
      setFundInputs(inputs);
    } catch {
      setError("이월잔액을 불러올 수 없습니다.");
    }
  }, [selectedUnitId, selectedYear]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const funds = balance?.funds ?? [];
  const useFunds = funds.length > 0;
  const fundTotal = funds.reduce((s, f) => s + parseAmount(fundInputs[f.fundId] || ""), 0);

  const handleSave = async () => {
    if (!selectedUnitId) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const body = useFunds
        ? {
            unitId: selectedUnitId,
            year: selectedYear,
            funds: funds.map((f) => ({ fundId: f.fundId, amount: parseAmount(fundInputs[f.fundId] || "") })),
          }
        : { unitId: selectedUnitId, year: selectedYear, amount: parseAmount(amount) };
      const res = await fetch("/api/accounting/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "저장에 실패했습니다.");
      }
      setSuccess("이월잔액이 저장되었습니다.");
      await fetchBalance();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-gray-400">불러오는 중...</div>;
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        이월잔액 설정 <HelpButton slug="accounting-balance" />
      </h1>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{success}</div>}

      <div className="max-w-xl">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs text-gray-500 mb-1">회계단위</label>
              <select
                value={selectedUnitId || ""}
                onChange={(e) => setSelectedUnitId(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                {units.length === 0 && <option value="">회계단위 없음</option>}
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({unit.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">회계년도</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}년
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-6 p-4 bg-teal-50 rounded-lg border border-teal-100">
            <div className="text-xs text-teal-600 mb-1">현재 이월잔액 (전년도 → {selectedYear}년 연초)</div>
            <div className="text-2xl font-bold text-teal-800">
              {balance?.exists ? `${fmt(balance.amount)}원` : "미설정"}
            </div>
          </div>

          {useFunds ? (
            <div className="mb-4">
              <div className="text-xs text-gray-500 mb-2">통장별 연초 잔액 (합계가 회계단위 이월잔액이 됩니다)</div>
              <table className="w-full text-sm">
                <tbody>
                  {funds.map((f) => (
                    <tr key={f.fundId} className="border-b border-gray-100">
                      <td className="py-2 pr-2">
                        {f.name}
                        <span className="ml-1 text-xs text-gray-400">
                          {f.kind}
                          {f.isDefault ? " · 기본" : ""}
                          {!f.isActive ? " · 중지" : ""}
                        </span>
                      </td>
                      <td className="py-2 w-44">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={fundInputs[f.fundId] ?? ""}
                          onChange={(e) =>
                            setFundInputs((p) => ({ ...p, [f.fundId]: formatInput(e.target.value) }))
                          }
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2">합계</td>
                    <td className="py-2 text-right pr-3">{fmt(fundTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">이월잔액 (원)</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(formatInput(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="0"
              />
              <p className="mt-1 text-xs text-gray-400">
                등록된 통장이 없어 회계단위 합계로만 입력합니다. (설정 → 통장관리에서 통장 등록 가능)
              </p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !selectedUnitId}
            className="w-full px-4 py-2.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
