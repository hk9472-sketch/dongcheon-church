"use client";

import { useEffect, useState, useCallback } from "react";

interface AccUnit {
  id: number;
  code: string;
  name: string;
}

interface AccountRow {
  accountId: number;
  accountCode: string;
  accountName: string;
  amount: number;
}

interface MonthlyReport {
  carryOver: number;
  incomeItems: AccountRow[];
  expenseItems: AccountRow[];
  incomeTotal: number;
  expenseTotal: number;
  monthBalance: number;
  nextCarryOver: number;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR") + "원";
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
        const list = (d.units || d || []).filter((u: any) => u.isActive);
        setUnits(list);
        if (list.length > 0 && !unitId) setUnitId(String(list[0].id));
      });
  }, []);

  const fetchReport = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        reportType: "monthly",
        unitId,
        year: String(year),
        month: String(month),
      });
      const res = await fetch(`/api/accounting/report?${params}`);
      if (!res.ok) throw new Error("데이터를 불러오지 못했습니다.");
      const data = await res.json();

      // API 응답을 프론트엔드 형식으로 변환
      const items = data.items || [];
      const incomeItems = items.filter((i: any) => i.type === "D").map((i: any) => ({
        accountId: i.accountId, accountCode: i.code, accountName: i.name, amount: i.amount,
      }));
      const expenseItems = items.filter((i: any) => i.type === "C").map((i: any) => ({
        accountId: i.accountId, accountCode: i.code, accountName: i.name, amount: i.amount,
      }));
      const incomeTotal = data.totalIncome ?? 0;
      const expenseTotal = data.totalExpense ?? 0;
      const carryOver = data.carryOver ?? 0;

      setReport({
        carryOver,
        incomeItems,
        expenseItems,
        incomeTotal,
        expenseTotal,
        monthBalance: incomeTotal - expenseTotal,
        nextCarryOver: carryOver + incomeTotal - expenseTotal,
      });
    } catch (err: any) {
      setError(err.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [unitId, year, month]);

  useEffect(() => {
    if (unitId) fetchReport();
  }, [unitId, year, month, fetchReport]);

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-6">월별 수입지출 보고서</h1>

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
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
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
                <option key={y} value={y}>{y}년</option>
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
                <option key={m} value={m}>{m}월</option>
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

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">불러오는 중...</div>
      )}

      {/* 보고서 */}
      {report && !loading && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* 제목 (인쇄용) */}
          <div className="hidden print:block text-center py-4">
            <h2 className="text-lg font-bold">
              {units.find((u) => String(u.id) === unitId)?.name} - {year}년 {month}월 수입지출 보고서
            </h2>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-teal-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-teal-800 w-20">코드</th>
                <th className="px-4 py-3 text-left font-medium text-teal-800">구분</th>
                <th className="px-4 py-3 text-right font-medium text-teal-800 w-32">수입금액</th>
                <th className="px-4 py-3 text-right font-medium text-teal-800 w-32">지출금액</th>
              </tr>
            </thead>
            <tbody>
              {/* 전기이월 → 수입금액 칸 */}
              <tr className="border-b border-gray-200 bg-gray-50 font-medium">
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3">전기이월</td>
                <td className="px-4 py-3 text-right">{fmt(report.carryOver)}</td>
                <td className="px-4 py-3"></td>
              </tr>

              {/* 수입 */}
              <tr className="border-b border-gray-200 bg-blue-50">
                <td className="px-4 py-2.5 font-bold text-blue-700" colSpan={4}>[수입]</td>
              </tr>
              {report.incomeItems.map((item) => (
                <tr key={item.accountId} className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-500">{item.accountCode}</td>
                  <td className="px-4 py-2 text-blue-700">{item.accountName}</td>
                  <td className="px-4 py-2 text-right text-blue-700">{fmt(item.amount)}</td>
                  <td className="px-4 py-2"></td>
                </tr>
              ))}
              {report.incomeItems.length === 0 && (
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-400 text-center" colSpan={4}>수입 내역 없음</td>
                </tr>
              )}
              <tr className="border-b border-gray-200 bg-blue-50 font-medium">
                <td className="px-4 py-2.5"></td>
                <td className="px-4 py-2.5">수입 합계</td>
                <td className="px-4 py-2.5 text-right text-blue-700">{fmt(report.incomeTotal)}</td>
                <td className="px-4 py-2.5"></td>
              </tr>

              {/* 지출 */}
              <tr className="border-b border-gray-200 bg-red-50">
                <td className="px-4 py-2.5 font-bold text-red-700" colSpan={4}>[지출]</td>
              </tr>
              {report.expenseItems.map((item) => (
                <tr key={item.accountId} className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-500">{item.accountCode}</td>
                  <td className="px-4 py-2 text-red-600">{item.accountName}</td>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2 text-right text-red-600">{fmt(item.amount)}</td>
                </tr>
              ))}
              {report.expenseItems.length === 0 && (
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-400 text-center" colSpan={4}>지출 내역 없음</td>
                </tr>
              )}
              <tr className="border-b border-gray-200 bg-red-50 font-medium">
                <td className="px-4 py-2.5"></td>
                <td className="px-4 py-2.5">지출 합계</td>
                <td className="px-4 py-2.5"></td>
                <td className="px-4 py-2.5 text-right text-red-600">{fmt(report.expenseTotal)}</td>
              </tr>

              {/* 당월잔액 → 수입금액 칸 */}
              <tr className="border-b border-gray-200 bg-gray-50">
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 font-medium">당월잔액 (수입 - 지출)</td>
                <td className="px-4 py-3 text-right font-medium">{fmt(report.monthBalance)}</td>
                <td className="px-4 py-3"></td>
              </tr>
              {/* 차월이월 → 수입금액 칸 */}
              <tr className="bg-emerald-50">
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 font-bold text-emerald-800">차월이월</td>
                <td className="px-4 py-3 text-right font-bold text-emerald-800">
                  {fmt(report.nextCarryOver)}
                </td>
                <td className="px-4 py-3"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
