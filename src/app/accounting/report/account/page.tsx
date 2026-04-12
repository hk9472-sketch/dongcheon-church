"use client";

import { useEffect, useState, useCallback } from "react";

interface AccUnit {
  id: number;
  code: string;
  name: string;
}

interface AccountSummary {
  accountId: number;
  accountCode: string;
  accountName: string;
  type: string; // D=수입, C=지출
  totalAmount: number;
}

interface AccountReport {
  items: AccountSummary[];
  incomeTotal: number;
  expenseTotal: number;
  net: number;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function AccountReportPage() {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [dateFrom, setDateFrom] = useState(monthStartStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [typeFilter, setTypeFilter] = useState("all"); // all, D, C
  const [report, setReport] = useState<AccountReport | null>(null);
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
        reportType: "account",
        unitId,
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/accounting/report?${params}`);
      if (!res.ok) throw new Error("데이터를 불러오지 못했습니다.");
      const data = await res.json();

      // API 응답 필드명을 프론트엔드 형식으로 변환
      const items = (data.items || []).map((i: any) => ({
        accountId: i.accountId,
        accountCode: i.code,
        accountName: i.name,
        type: i.type,
        totalAmount: i.amount,
      }));
      setReport({
        items,
        incomeTotal: data.totalIncome ?? 0,
        expenseTotal: data.totalExpense ?? 0,
        net: (data.totalIncome ?? 0) - (data.totalExpense ?? 0),
      });
    } catch (err: any) {
      setError(err.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [unitId, dateFrom, dateTo]);

  useEffect(() => {
    if (unitId) fetchReport();
  }, [unitId, dateFrom, dateTo, fetchReport]);

  const filteredItems = report?.items.filter((item) => {
    if (typeFilter === "all") return true;
    return item.type === typeFilter;
  }) || [];

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-6">계정별 현황</h1>

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
            <label className="block text-xs text-gray-500 mb-1">시작일</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">종료일</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">구분</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="all">전체</option>
              <option value="D">수입</option>
              <option value="C">지출</option>
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
          {/* 인쇄용 제목 */}
          <div className="hidden print:block text-center py-4">
            <h2 className="text-lg font-bold">
              {units.find((u) => String(u.id) === unitId)?.name} - 계정별 현황
            </h2>
            <p className="text-sm text-gray-500">{dateFrom} ~ {dateTo}</p>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-teal-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-teal-800 w-20">코드</th>
                <th className="px-4 py-3 text-left font-medium text-teal-800">계정명</th>
                <th className="px-4 py-3 text-right font-medium text-teal-800 w-32">수입금액</th>
                <th className="px-4 py-3 text-right font-medium text-teal-800 w-32">지출금액</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    해당 기간에 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.accountId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-gray-500">{item.accountCode}</td>
                    <td className={`px-4 py-2.5 ${item.type === "D" ? "text-blue-700" : "text-red-600"}`}>
                      {item.accountName}
                    </td>
                    <td className="px-4 py-2.5 text-right text-blue-700 font-medium">
                      {item.type === "D" ? fmt(item.totalAmount) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right text-red-600 font-medium">
                      {item.type === "C" ? fmt(item.totalAmount) : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredItems.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200 bg-blue-50">
                  <td className="px-4 py-2.5"></td>
                  <td className="px-4 py-2.5 font-medium text-blue-800">수입 소계</td>
                  <td className="px-4 py-2.5 text-right font-bold text-blue-700">
                    {fmt(typeFilter === "D"
                      ? filteredItems.reduce((s, i) => s + i.totalAmount, 0)
                      : report.incomeTotal)}
                  </td>
                  <td className="px-4 py-2.5"></td>
                </tr>
                <tr className="border-t border-gray-200 bg-red-50">
                  <td className="px-4 py-2.5"></td>
                  <td className="px-4 py-2.5 font-medium text-red-800">지출 소계</td>
                  <td className="px-4 py-2.5"></td>
                  <td className="px-4 py-2.5 text-right font-bold text-red-600">
                    {fmt(typeFilter === "C"
                      ? filteredItems.reduce((s, i) => s + i.totalAmount, 0)
                      : report.expenseTotal)}
                  </td>
                </tr>
                {typeFilter === "all" && (
                  <tr className="border-t-2 border-gray-300 bg-emerald-50">
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 font-bold text-emerald-800">순수익 (수입 - 지출)</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-800">{fmt(report.net)}</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                )}
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
