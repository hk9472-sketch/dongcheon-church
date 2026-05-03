"use client";

import { useEffect, useState, useCallback } from "react";

interface Row {
  memberId: number;
  memberNo: number;
  name: string;
  monthlyDues: number;
  byInstallment: Record<number, number>;
  total: number;
  expectedAnnual: number;
  unpaidInstallments: number[];
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

interface Props {
  category: "전도회" | "건축";
}

export default function MemberReport({ category }: Props) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<Row[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [totalExpected, setTotalExpected] = useState(0);
  const [filter, setFilter] = useState("");
  const [hideZero, setHideZero] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        category,
        mode: "member",
        year: String(year),
      });
      const res = await fetch(`/api/accounting/dues/report?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setRows(data.rows || []);
      setGrandTotal(data.grandTotal || 0);
      setTotalExpected(data.totalExpected || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [category, year]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    if (hideZero && r.monthlyDues === 0 && r.total === 0) return false;
    if (!filter.trim()) return true;
    const f = filter.trim();
    return r.name.includes(f) || String(r.memberNo).includes(f);
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">{category} 회원별 연간 현황</h1>
        <p className="text-xs text-gray-500 mt-1">
          회원별 월정액 · 연간 월정합계(월정액×12) · 현재 입금액.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">기준년도</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10) || thisYear)}
            min={2000}
            max={2100}
            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">검색</label>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="이름·번호"
            className="w-40 rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={hideZero}
            onChange={(e) => setHideZero(e.target.checked)}
          />
          월정·입금 모두 0 인 회원 숨기기
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-700 disabled:opacity-50"
        >
          조회
        </button>
        <div className="ml-auto text-xs text-gray-600">
          연간 월정합계 <strong>{fmt(totalExpected)}</strong> · 입금합계{" "}
          <strong className="text-blue-700">{fmt(grandTotal)}</strong>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-20">번호</th>
              <th className="px-3 py-2 text-left font-medium">이름</th>
              <th className="px-3 py-2 text-right font-medium w-32">월정액</th>
              <th className="px-3 py-2 text-right font-medium w-36">연간 월정합계</th>
              <th className="px-3 py-2 text-right font-medium w-32">입금합계</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  결과 없음
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.memberId} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-gray-500">{r.memberNo}</td>
                <td className="px-3 py-2 text-gray-800">{r.name}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-700">
                  {r.monthlyDues > 0 ? fmt(r.monthlyDues) : "-"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-700">
                  {r.expectedAnnual > 0 ? fmt(r.expectedAnnual) : "-"}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-blue-700">
                  {fmt(r.total)}
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-gray-100 font-semibold">
                <td colSpan={2} className="px-3 py-2 text-right">
                  합계
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-800">
                  {fmt(filtered.reduce((s, r) => s + r.monthlyDues, 0))}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-800">
                  {fmt(filtered.reduce((s, r) => s + r.expectedAnnual, 0))}
                </td>
                <td className="px-3 py-2 text-right font-mono text-blue-800 bg-blue-50">
                  {fmt(filtered.reduce((s, r) => s + r.total, 0))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
