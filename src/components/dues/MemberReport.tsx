"use client";

import { useEffect, useState, useCallback } from "react";

interface DepositLite {
  date: string;
  amount: number;
}

interface Row {
  memberId: number;
  memberNo: number;
  name: string;
  monthlyDues: number;
  byInstallment: Record<number, number>;
  byInstallmentDetails: Record<number, DepositLite[]>;
  total: number;
  expectedAnnual: number;
  unpaidInstallments: number[];
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const fmtDate = (s: string) => {
  // YYYY-MM-DD → M/D
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}`;
};

interface Props {
  category: "전도회" | "건축";
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

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
          회원별 1~12월 입금 금액과 일자를 매트릭스로 표시. 같은 달에 여러 입금이면 합산 + 일자 나열.
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
        <table className="w-full text-xs">
          <thead className="border-b bg-gray-50 text-gray-600 sticky top-0">
            <tr>
              <th className="px-2 py-2 text-left font-medium w-14">번호</th>
              <th className="px-2 py-2 text-left font-medium w-24">이름</th>
              {MONTHS.map((m) => (
                <th key={m} className="px-2 py-2 text-right font-medium w-24">
                  {m}월
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium w-24 bg-blue-50">합계</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={15} className="px-3 py-6 text-center text-gray-400">
                  결과 없음
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.memberId} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-2 py-1.5 font-mono text-gray-500">{r.memberNo}</td>
                <td className="px-2 py-1.5 text-gray-800">{r.name}</td>
                {MONTHS.map((m) => {
                  const details = r.byInstallmentDetails[m] || [];
                  const sum = r.byInstallment[m] ?? 0;
                  if (details.length === 0) {
                    return (
                      <td key={m} className="px-2 py-1.5 text-right text-gray-300">
                        -
                      </td>
                    );
                  }
                  return (
                    <td
                      key={m}
                      className="px-2 py-1.5 text-right font-mono leading-tight"
                      title={details.map((d) => `${d.date} ${fmt(d.amount)}`).join("\n")}
                    >
                      <div className="text-gray-800">{fmt(sum)}</div>
                      <div className="text-[10px] text-gray-500">
                        {details.map((d) => fmtDate(d.date)).join(", ")}
                      </div>
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right font-mono font-semibold text-blue-700 bg-blue-50">
                  {fmt(r.total)}
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-gray-100 font-semibold">
                <td colSpan={2} className="px-2 py-2 text-right">
                  합계
                </td>
                {MONTHS.map((m) => {
                  let sum = 0;
                  for (const r of filtered) sum += r.byInstallment[m] ?? 0;
                  return (
                    <td
                      key={m}
                      className={`px-2 py-2 text-right font-mono ${
                        sum > 0 ? "text-gray-800" : "text-gray-400"
                      }`}
                    >
                      {sum > 0 ? fmt(sum) : "-"}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-right font-mono text-blue-800 bg-blue-100">
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
