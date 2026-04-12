"use client";

import { useEffect, useState, useCallback } from "react";

interface AccUnit {
  id: number;
  code: string;
  name: string;
}

interface BalanceInfo {
  id: number | null;
  unitId: number;
  year: number;
  amount: number;
  updatedAt: string | null;
}

export default function AccBalancePage() {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i + 1);

  // 회계단위 로드
  useEffect(() => {
    fetch("/api/accounting/units")
      .then((r) => r.json())
      .then((d) => {
        const all = Array.isArray(d) ? d : d.units || [];
        const activeUnits = all.filter((u: AccUnit & { isActive: boolean }) => u.isActive);
        setUnits(activeUnits);
        if (activeUnits.length > 0 && !selectedUnitId) {
          setSelectedUnitId(activeUnits[0].id);
        }
      })
      .catch(() => setError("회계단위를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  // 이월잔액 로드
  const fetchBalance = useCallback(async () => {
    if (!selectedUnitId) return;
    setError("");
    setSuccess("");

    try {
      const res = await fetch(
        `/api/accounting/balance?unitId=${selectedUnitId}&year=${selectedYear}`
      );
      const data = await res.json();
      if (data.balance) {
        setBalance(data.balance);
        setAmount(data.balance.amount.toLocaleString("ko-KR"));
      } else {
        setBalance(null);
        setAmount("");
      }
    } catch {
      setError("이월잔액을 불러올 수 없습니다.");
    }
  }, [selectedUnitId, selectedYear]);

  useEffect(() => {
    if (selectedUnitId) {
      fetchBalance();
    }
  }, [selectedUnitId, selectedYear, fetchBalance]);

  const parseAmount = (value: string): number => {
    return Number(value.replace(/[^0-9-]/g, "")) || 0;
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9-]/g, "");
    if (raw === "" || raw === "-") {
      setAmount(raw);
      return;
    }
    const num = Number(raw);
    if (!isNaN(num)) {
      setAmount(num.toLocaleString("ko-KR"));
    }
  };

  const handleSave = async () => {
    if (!selectedUnitId) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/accounting/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: selectedUnitId,
          year: selectedYear,
          amount: parseAmount(amount),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "저장에 실패했습니다.");
      }

      setSuccess("이월잔액이 저장되었습니다.");
      await fetchBalance();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        불러오는 중...
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-6">이월잔액 설정</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{success}</div>
      )}

      <div className="max-w-lg">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {/* 선택 영역 */}
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

          {/* 현재 잔액 표시 */}
          <div className="mb-6 p-4 bg-teal-50 rounded-lg border border-teal-100">
            <div className="text-xs text-teal-600 mb-1">현재 이월잔액</div>
            <div className="text-2xl font-bold text-teal-800">
              {balance
                ? `${balance.amount.toLocaleString("ko-KR")}원`
                : "미설정"}
            </div>
            {balance?.updatedAt && (
              <div className="text-xs text-teal-500 mt-1">
                최종 수정: {new Date(balance.updatedAt).toLocaleString("ko-KR")}
              </div>
            )}
          </div>

          {/* 입력 */}
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">이월잔액 (원)</label>
            <input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              placeholder="0"
            />
            <p className="mt-1 text-xs text-gray-400">
              전년도 이월잔액을 입력합니다. 음수 입력 가능합니다.
            </p>
          </div>

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
