"use client";

import { useEffect, useState, useCallback } from "react";

interface Deposit {
  id: number;
  date: string;
  memberId: number;
  amount: number;
  installment: number;
  description: string | null;
  member: {
    id: number;
    memberNo: number;
    name: string;
  } | null;
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
function formatDate(s: string): string {
  return s.slice(0, 10);
}

interface Props {
  category: "전도회" | "건축";
}

export default function PeriodReport({ category }: Props) {
  const [dateFrom, setDateFrom] = useState(yearStartStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [items, setItems] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 정렬 키 (사용자가 헤더 클릭으로 변경 가능)
  const [sortKey, setSortKey] = useState<"memberNo" | "name" | "date" | "installment" | "amount">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        category,
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/accounting/dues/deposits?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [category, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const sorted = [...items].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "memberNo":
        return ((a.member?.memberNo ?? 0) - (b.member?.memberNo ?? 0)) * dir;
      case "name":
        return (a.member?.name || "").localeCompare(b.member?.name || "") * dir;
      case "date":
        return a.date.localeCompare(b.date) * dir;
      case "installment":
        return (a.installment - b.installment) * dir;
      case "amount":
        return (a.amount - b.amount) * dir;
    }
  });

  const totalAmount = items.reduce((s, d) => s + d.amount, 0);
  const sortArrow = (k: typeof sortKey) =>
    sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">{category} 기간별 입금 현황</h1>
        <p className="text-xs text-gray-500 mt-1">
          기간 내 입금을 건별로 나열 (번호 · 이름 · 일자 · 월 · 금액). 헤더를 클릭하면 정렬 기준 변경.
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
          입금건수 <strong>{items.length}</strong> · 합계{" "}
          <strong className="text-blue-700">{fmt(totalAmount)}</strong>원
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-600 sticky top-0">
            <tr>
              <th
                className="px-2 py-2 text-left font-medium w-20 cursor-pointer hover:bg-gray-100"
                onClick={() => toggleSort("memberNo")}
              >
                번호{sortArrow("memberNo")}
              </th>
              <th
                className="px-2 py-2 text-left font-medium w-28 cursor-pointer hover:bg-gray-100"
                onClick={() => toggleSort("name")}
              >
                이름{sortArrow("name")}
              </th>
              <th
                className="px-2 py-2 text-left font-medium w-28 cursor-pointer hover:bg-gray-100"
                onClick={() => toggleSort("date")}
              >
                일자{sortArrow("date")}
              </th>
              <th
                className="px-2 py-2 text-center font-medium w-16 cursor-pointer hover:bg-gray-100"
                onClick={() => toggleSort("installment")}
              >
                월{sortArrow("installment")}
              </th>
              <th
                className="px-2 py-2 text-right font-medium w-28 cursor-pointer hover:bg-gray-100"
                onClick={() => toggleSort("amount")}
              >
                금액{sortArrow("amount")}
              </th>
              <th className="px-2 py-2 text-left font-medium">비고</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                  조회된 입금 없음
                </td>
              </tr>
            )}
            {sorted.map((d) => (
              <tr key={d.id} className="border-b last:border-b-0 hover:bg-blue-50/30">
                <td className="px-2 py-1.5 font-mono text-gray-500">
                  {d.member?.memberNo ?? "-"}
                </td>
                <td className="px-2 py-1.5 text-gray-800 font-medium">
                  {d.member?.name ?? "(미등록)"}
                </td>
                <td className="px-2 py-1.5 text-gray-600 font-mono">
                  {formatDate(d.date)}
                </td>
                <td className="px-2 py-1.5 text-center text-gray-700">{d.installment}월</td>
                <td className="px-2 py-1.5 text-right font-mono text-blue-700">
                  {fmt(d.amount)}
                </td>
                <td className="px-2 py-1.5 text-xs text-gray-500">
                  {d.description || ""}
                </td>
              </tr>
            ))}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-gray-100 font-semibold sticky bottom-0">
                <td colSpan={4} className="px-2 py-2 text-right">
                  합계 ({items.length}건)
                </td>
                <td className="px-2 py-2 text-right font-mono text-blue-800 bg-blue-50">
                  {fmt(totalAmount)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
