"use client";

import { useEffect, useState, useCallback } from "react";
import HelpButton from "@/components/HelpButton";

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

interface MonthlyData {
  month: number;
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

export default function SettlementPage() {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<"monthly" | "annual">("monthly");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [monthlyData, setMonthlyData] = useState<MonthlyData | null>(null);
  const [annualData, setAnnualData] = useState<MonthlyData[]>([]);
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

  const fetchMonthly = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        reportType: "monthly",
        unitId,
        year: String(year),
        month: String(selectedMonth),
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

      setMonthlyData({
        month: selectedMonth,
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
      setMonthlyData(null);
    } finally {
      setLoading(false);
    }
  }, [unitId, year, selectedMonth]);

  const fetchAnnual = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError("");
    try {
      const results: MonthlyData[] = [];
      for (let m = 1; m <= 12; m++) {
        const params = new URLSearchParams({
          reportType: "monthly",
          unitId,
          year: String(year),
          month: String(m),
        });
        const res = await fetch(`/api/accounting/report?${params}`);
        if (res.ok) {
          const data = await res.json();
          const allItems = data.items || [];
          const incomeTotal = data.totalIncome ?? 0;
          const expenseTotal = data.totalExpense ?? 0;
          const carryOver = data.carryOver ?? 0;
          results.push({
            month: m,
            carryOver,
            incomeItems: allItems.filter((i: any) => i.type === "D").map((i: any) => ({
              accountId: i.accountId, accountCode: i.code, accountName: i.name, amount: i.amount,
            })),
            expenseItems: allItems.filter((i: any) => i.type === "C").map((i: any) => ({
              accountId: i.accountId, accountCode: i.code, accountName: i.name, amount: i.amount,
            })),
            incomeTotal,
            expenseTotal,
            monthBalance: incomeTotal - expenseTotal,
            nextCarryOver: carryOver + incomeTotal - expenseTotal,
          });
        }
      }
      setAnnualData(results);
    } catch (err: any) {
      setError(err.message);
      setAnnualData([]);
    } finally {
      setLoading(false);
    }
  }, [unitId, year]);

  useEffect(() => {
    if (!unitId) return;
    if (viewMode === "monthly") fetchMonthly();
    else fetchAnnual();
  }, [unitId, year, selectedMonth, viewMode, fetchMonthly, fetchAnnual]);

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const unitName = units.find((u) => String(u.id) === unitId)?.name || "";

  // Annual totals
  const annualIncomeTotal = annualData.reduce((s, d) => s + d.incomeTotal, 0);
  const annualExpenseTotal = annualData.reduce((s, d) => s + d.expenseTotal, 0);

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">결산현황 <HelpButton slug="accounting-settlement" /></h1>

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
          {viewMode === "monthly" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">월</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                {months.map((m) => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setViewMode("monthly")}
              className={`px-4 py-2 text-sm transition-colors ${
                viewMode === "monthly"
                  ? "bg-teal-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              월별 결산
            </button>
            <button
              onClick={() => setViewMode("annual")}
              className={`px-4 py-2 text-sm transition-colors border-l border-gray-300 ${
                viewMode === "annual"
                  ? "bg-teal-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              연간 결산
            </button>
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

      {/* 월별 결산 */}
      {viewMode === "monthly" && monthlyData && !loading && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-emerald-50 border-b border-gray-200 text-center">
            <h2 className="text-lg font-bold text-emerald-800">
              {unitName} {year}년 {selectedMonth}월 결산서
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
              {/* 전기이월 → 수입금액 */}
              <tr className="border-b border-gray-200 bg-gray-50">
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 font-bold text-gray-700">전기이월</td>
                <td className="px-4 py-3 text-right font-bold">{fmt(monthlyData.carryOver)}</td>
                <td className="px-4 py-3"></td>
              </tr>

              {/* 수입 */}
              <tr className="border-b border-gray-100 bg-blue-50/50">
                <td className="px-4 py-2 font-bold text-blue-700" colSpan={4}>[수입 내역]</td>
              </tr>
              {monthlyData.incomeItems.map((item) => (
                <tr key={item.accountId} className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-400 text-xs">{item.accountCode}</td>
                  <td className="px-4 py-2 text-blue-700">{item.accountName}</td>
                  <td className="px-4 py-2 text-right text-blue-700">{fmt(item.amount)}</td>
                  <td className="px-4 py-2"></td>
                </tr>
              ))}
              {monthlyData.incomeItems.length === 0 && (
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-2 text-center text-gray-400" colSpan={4}>수입 내역 없음</td>
                </tr>
              )}
              <tr className="border-b border-gray-200 bg-blue-50 font-bold">
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-blue-800">수입합계</td>
                <td className="px-4 py-3 text-right text-blue-800">{fmt(monthlyData.incomeTotal)}</td>
                <td className="px-4 py-3"></td>
              </tr>

              {/* 지출 */}
              <tr className="border-b border-gray-100 bg-red-50/50">
                <td className="px-4 py-2 font-bold text-red-700" colSpan={4}>[지출 내역]</td>
              </tr>
              {monthlyData.expenseItems.map((item) => (
                <tr key={item.accountId} className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-400 text-xs">{item.accountCode}</td>
                  <td className="px-4 py-2 text-red-600">{item.accountName}</td>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2 text-right text-red-600">{fmt(item.amount)}</td>
                </tr>
              ))}
              {monthlyData.expenseItems.length === 0 && (
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-2 text-center text-gray-400" colSpan={4}>지출 내역 없음</td>
                </tr>
              )}
              <tr className="border-b border-gray-200 bg-red-50 font-bold">
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-red-800">지출합계</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-right text-red-800">{fmt(monthlyData.expenseTotal)}</td>
              </tr>

              {/* 당월잔액 → 수입금액 */}
              <tr className="border-b border-gray-200 bg-gray-50">
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 font-bold">잔액 (수입 - 지출)</td>
                <td className="px-4 py-3 text-right font-bold">{fmt(monthlyData.monthBalance)}</td>
                <td className="px-4 py-3"></td>
              </tr>

              {/* 차기이월 → 수입금액 */}
              <tr className="bg-emerald-100">
                <td className="px-4 py-4"></td>
                <td className="px-4 py-4 font-bold text-emerald-800 text-base">차기이월</td>
                <td className="px-4 py-4 text-right font-bold text-emerald-800 text-base">
                  {fmt(monthlyData.nextCarryOver)}
                </td>
                <td className="px-4 py-4"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* 연간 결산 */}
      {viewMode === "annual" && !loading && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-emerald-50 border-b border-gray-200 text-center">
            <h2 className="text-lg font-bold text-emerald-800">
              {unitName} {year}년 연간 결산표
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-teal-50 border-b border-gray-200">
                  <th className="px-3 py-3 text-center font-medium text-teal-800 w-16">월</th>
                  <th className="px-3 py-3 text-right font-medium text-teal-800">전기이월</th>
                  <th className="px-3 py-3 text-right font-medium text-teal-800">수입</th>
                  <th className="px-3 py-3 text-right font-medium text-teal-800">지출</th>
                  <th className="px-3 py-3 text-right font-medium text-teal-800">잔액</th>
                  <th className="px-3 py-3 text-right font-medium text-teal-800">차기이월</th>
                </tr>
              </thead>
              <tbody>
                {annualData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  annualData.map((d) => (
                    <tr key={d.month} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-center font-medium">{d.month}월</td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{fmt(d.carryOver)}</td>
                      <td className="px-3 py-2.5 text-right text-blue-700">{fmt(d.incomeTotal)}</td>
                      <td className="px-3 py-2.5 text-right text-red-600">{fmt(d.expenseTotal)}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(d.monthBalance)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-emerald-700">{fmt(d.nextCarryOver)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {annualData.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-emerald-50 font-bold">
                    <td className="px-3 py-3 text-center text-emerald-800">합계</td>
                    <td className="px-3 py-3 text-right text-gray-600">
                      {annualData.length > 0 ? fmt(annualData[0].carryOver) : "-"}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-700">{fmt(annualIncomeTotal)}</td>
                    <td className="px-3 py-3 text-right text-red-600">{fmt(annualExpenseTotal)}</td>
                    <td className="px-3 py-3 text-right">{fmt(annualIncomeTotal - annualExpenseTotal)}</td>
                    <td className="px-3 py-3 text-right text-emerald-800">
                      {annualData.length > 0 ? fmt(annualData[annualData.length - 1].nextCarryOver) : "-"}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
