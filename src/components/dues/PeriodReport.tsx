"use client";

import { useEffect, useState, useCallback } from "react";

interface Item {
  memberId: number;
  memberNo: number;
  name: string;
  byInstallment: Record<number, number>;
  total: number;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const todayStr = () => {
  const d = new Date();
  const k = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return k.toISOString().slice(0, 10);
};
const yearStartStr = () => {
  const y = new Date().getFullYear();
  return `${y}-01-01`;
};

interface Props {
  category: "전도회" | "건축";
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function PeriodReport({ category }: Props) {
  const [dateFrom, setDateFrom] = useState(yearStartStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [items, setItems] = useState<Item[]>([]);
  const [installmentTotals, setInstallmentTotals] = useState<Record<number, number>>({});
  const [grandTotal, setGrandTotal] = useState(0);
  const [depositCount, setDepositCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        category,
        mode: "period",
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/accounting/dues/report?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setItems(data.items || []);
      setInstallmentTotals(data.installmentTotals || {});
      setGrandTotal(data.grandTotal || 0);
      setDepositCount(data.depositCount || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [category, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">{category} 기간별 입금 현황</h1>
        <p className="text-xs text-gray-500 mt-1">
          기간 내 입금을 회원별·회차(1월~12월)별로 집계.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">시작일</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">종료일</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-700 disabled:opacity-50"
        >
          조회
        </button>
        <div className="ml-auto text-xs text-gray-600">
          입금건수 <strong>{depositCount}</strong> · 합계{" "}
          <strong className="text-blue-700">{fmt(grandTotal)}</strong>원
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="border-b bg-gray-50 text-gray-600 sticky top-0">
            <tr>
              <th className="px-2 py-2 text-left font-medium w-16">번호</th>
              <th className="px-2 py-2 text-left font-medium">이름</th>
              {MONTHS.map((m) => (
                <th key={m} className="px-2 py-2 text-right font-medium w-20">
                  {m}월
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium w-24 bg-blue-50">합계</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={15} className="px-3 py-6 text-center text-gray-400">
                  조회된 입금 없음
                </td>
              </tr>
            )}
            {items.map((it) => (
              <tr key={it.memberId} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-2 py-1.5 font-mono text-gray-500">{it.memberNo}</td>
                <td className="px-2 py-1.5 text-gray-800">{it.name}</td>
                {MONTHS.map((m) => {
                  const v = it.byInstallment[m] ?? 0;
                  return (
                    <td
                      key={m}
                      className={`px-2 py-1.5 text-right font-mono ${
                        v > 0 ? "text-gray-700" : "text-gray-300"
                      }`}
                    >
                      {v > 0 ? fmt(v) : "-"}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right font-mono font-semibold text-blue-700 bg-blue-50">
                  {fmt(it.total)}
                </td>
              </tr>
            ))}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-gray-100 font-semibold sticky bottom-0">
                <td colSpan={2} className="px-2 py-2 text-right">
                  회차별 합계
                </td>
                {MONTHS.map((m) => {
                  const v = installmentTotals[m] ?? 0;
                  return (
                    <td
                      key={m}
                      className={`px-2 py-2 text-right font-mono ${
                        v > 0 ? "text-gray-800" : "text-gray-400"
                      }`}
                    >
                      {v > 0 ? fmt(v) : "-"}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-right font-mono text-blue-800 bg-blue-100">
                  {fmt(grandTotal)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
