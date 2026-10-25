"use client";

import { useEffect, useState, useCallback } from "react";
import HelpButton from "@/components/HelpButton";
import LastInputBar from "@/components/accounting/LastInputBar";

interface AccUnit {
  id: number;
  code: string;
  name: string;
}

interface AccountRow {
  accountId: number;
  accountCode: string;
  accountName: string;
  amount: number; // 당월
  cumAmount: number; // 누계 (1월 ~ 당월)
}

interface MonthlyReport {
  carryOver: number; // 전월이월 (당월 1일 기준)
  yearCarry: number; // 연초이월
  incomeItems: AccountRow[];
  expenseItems: AccountRow[];
  incomeTotal: number;
  expenseTotal: number;
  cumIncome: number;
  cumExpense: number;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export default function MonthlyReportPage() {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/accounting/units")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.units || d || []).filter((u: { isActive: boolean }) => u.isActive);
        setUnits(list);
        // 기본값 = "전체" (unitId="" 유지). 첫 단위로 자동 선택하지 않음.
      });
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        reportType: "monthly",
        unitId: unitId || "all",
        year: String(year),
        month: String(month),
      });
      const res = await fetch(`/api/accounting/report?${params}`);
      if (!res.ok) throw new Error("데이터를 불러오지 못했습니다.");
      const data = await res.json();

      type Item = { accountId: number; code: string; name: string; type: string; amount: number; cumAmount?: number };
      const toRow = (i: Item): AccountRow => ({
        accountId: i.accountId,
        accountCode: i.code,
        accountName: i.name,
        amount: i.amount,
        cumAmount: i.cumAmount ?? i.amount,
      });
      const items: Item[] = data.items || [];
      const incomeTotal = data.totalIncome ?? 0;
      const expenseTotal = data.totalExpense ?? 0;
      const cumIncome = data.cumIncome ?? incomeTotal;
      const cumExpense = data.cumExpense ?? expenseTotal;
      const carryOver = data.carryOver ?? 0;

      setReport({
        carryOver,
        // 연초이월은 이월잔액 원장값 (전월이월과 독립 — 차월이월 두 값 비교로 검증)
        yearCarry: data.yearCarry ?? carryOver - (cumIncome - incomeTotal) + (cumExpense - expenseTotal),
        incomeItems: items.filter((i) => i.type === "D").map(toRow),
        expenseItems: items.filter((i) => i.type === "C").map(toRow),
        incomeTotal,
        expenseTotal,
        cumIncome,
        cumExpense,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "조회 실패");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [unitId, year, month]);

  useEffect(() => {
    fetchReport();
  }, [unitId, year, month, fetchReport]);

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const unitLabel = (unitId ? units.find((u) => String(u.id) === unitId)?.name : "전체") || "전체";

  const th = "px-4 py-3 text-right font-medium text-teal-800 w-36";
  const td = "px-4 py-2 text-right font-mono";

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        월별 수입지출 보고서 <HelpButton slug="accounting-report-monthly" />
      </h1>

      {/* 필터 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">회계단위</label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">전체</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">년도</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">월</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors"
          >
            인쇄
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
      {loading && <div className="flex items-center justify-center py-12 text-gray-400">불러오는 중...</div>}

      {report && !loading && (
        <LastInputBar
          scope="ledger"
          dateFrom={`${year}-01-01`}
          dateTo={`${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`}
          unitId={unitId}
          className="mb-2 print:hidden"
        />
      )}
      {report && !loading && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <div className="hidden print:block text-center py-4">
            <h2 className="text-lg font-bold">
              {unitLabel} - {year}년 {month}월 수입지출 보고서
            </h2>
          </div>

          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-teal-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-teal-800 w-20">코드</th>
                <th className="px-4 py-3 text-left font-medium text-teal-800">구분</th>
                <th className={th}>당월 ({month}월)</th>
                <th className={th}>누계 (1~{month}월)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 bg-gray-50 font-medium">
                <td className="px-4 py-3" />
                <td className="px-4 py-3">이월금</td>
                <td className={td}>
                  {fmt(report.carryOver)}
                  <div className="text-[11px] font-sans text-gray-400">전월이월</div>
                </td>
                <td className={td}>
                  {fmt(report.yearCarry)}
                  <div className="text-[11px] font-sans text-gray-400">연초이월</div>
                </td>
              </tr>

              <tr className="border-b border-gray-200 bg-blue-50">
                <td className="px-4 py-2.5 font-bold text-blue-700" colSpan={4}>
                  [수입]
                </td>
              </tr>
              {report.incomeItems.map((item) => (
                <tr key={item.accountId} className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-500">{item.accountCode}</td>
                  <td className="px-4 py-2 text-blue-700">{item.accountName}</td>
                  <td className={`${td} text-blue-700`}>{item.amount ? fmt(item.amount) : "-"}</td>
                  <td className={`${td} text-blue-900`}>{fmt(item.cumAmount)}</td>
                </tr>
              ))}
              {report.incomeItems.length === 0 && (
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-400 text-center" colSpan={4}>
                    수입 내역 없음
                  </td>
                </tr>
              )}
              <tr className="border-b border-gray-200 bg-blue-50 font-semibold">
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5">수입 합계</td>
                <td className={`${td} text-blue-700`}>{fmt(report.incomeTotal)}</td>
                <td className={`${td} text-blue-900`}>{fmt(report.cumIncome)}</td>
              </tr>

              <tr className="border-b border-gray-200 bg-red-50">
                <td className="px-4 py-2.5 font-bold text-red-700" colSpan={4}>
                  [지출]
                </td>
              </tr>
              {report.expenseItems.map((item) => (
                <tr key={item.accountId} className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-500">{item.accountCode}</td>
                  <td className="px-4 py-2 text-red-600">{item.accountName}</td>
                  <td className={`${td} text-red-600`}>{item.amount ? fmt(item.amount) : "-"}</td>
                  <td className={`${td} text-red-800`}>{fmt(item.cumAmount)}</td>
                </tr>
              ))}
              {report.expenseItems.length === 0 && (
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-400 text-center" colSpan={4}>
                    지출 내역 없음
                  </td>
                </tr>
              )}
              <tr className="border-b border-gray-200 bg-red-50 font-semibold">
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5">지출 합계</td>
                <td className={`${td} text-red-600`}>{fmt(report.expenseTotal)}</td>
                <td className={`${td} text-red-800`}>{fmt(report.cumExpense)}</td>
              </tr>

              <tr className="border-b border-gray-200 bg-gray-50 font-medium">
                <td className="px-4 py-3" />
                <td className="px-4 py-3">차액 (수입 − 지출)</td>
                <td className={td}>{fmt(report.incomeTotal - report.expenseTotal)}</td>
                <td className={td}>{fmt(report.cumIncome - report.cumExpense)}</td>
              </tr>
              <tr className="bg-emerald-50">
                <td className="px-4 py-3" />
                <td className="px-4 py-3 font-bold text-emerald-800">
                  차월이월 <span className="text-xs font-normal text-emerald-600">(두 값이 같아야 정상)</span>
                </td>
                <td className={`${td} font-bold text-emerald-800`}>
                  {fmt(report.carryOver + report.incomeTotal - report.expenseTotal)}
                </td>
                <td className={`${td} font-bold text-emerald-800`}>
                  {fmt(report.yearCarry + report.cumIncome - report.cumExpense)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
