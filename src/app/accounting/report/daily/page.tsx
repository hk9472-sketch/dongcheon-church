"use client";

import { Fragment, useEffect, useState, useCallback } from "react";

interface AccUnit {
  id: number;
  code: string;
  name: string;
}

interface VoucherDetail {
  voucherId: number;
  voucherNo: string;
  type: string; // D or C
  accountName: string;
  description: string;
  counterpart: string;
  amount: number;
}

interface DailyRow {
  date: string;
  incomeTotal: number;
  expenseTotal: number;
  balance: number;
  details: VoucherDetail[];
}

interface DailyReport {
  carryOver: number;
  days: DailyRow[];
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

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} (${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]})`;
}

export default function DailyReportPage() {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [dateFrom, setDateFrom] = useState(monthStartStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

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
        reportType: "daily",
        unitId,
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/accounting/report?${params}`);
      if (!res.ok) throw new Error("데이터를 불러오지 못했습니다.");
      const data = await res.json();

      // API 응답을 프론트엔드 형식으로 변환
      const carryOver = data.carryOver ?? 0;
      let runningBalance = carryOver;
      const days = (data.days || []).map((d: any) => {
        const incomeTotal = d.income ?? d.incomeTotal ?? 0;
        const expenseTotal = d.expense ?? d.expenseTotal ?? 0;
        runningBalance += incomeTotal - expenseTotal;
        return {
          date: d.date,
          incomeTotal,
          expenseTotal,
          balance: runningBalance,
          details: d.details || [],
        };
      });
      setReport({ carryOver, days });
      setExpandedDates(new Set());
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

  const toggleDate = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-6">일자별 현황</h1>

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
              {units.find((u) => String(u.id) === unitId)?.name} - 일자별 현황
            </h2>
            <p className="text-sm text-gray-500">{dateFrom} ~ {dateTo}</p>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-teal-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-teal-800">날짜</th>
                <th className="px-4 py-3 text-right font-medium text-teal-800">수입</th>
                <th className="px-4 py-3 text-right font-medium text-teal-800">지출</th>
                <th className="px-4 py-3 text-right font-medium text-teal-800">잔액</th>
              </tr>
            </thead>
            <tbody>
              {/* 전기이월 */}
              <tr className="border-b border-gray-200 bg-gray-50 font-medium">
                <td className="px-4 py-2.5">전기이월</td>
                <td className="px-4 py-2.5" colSpan={2}></td>
                <td className="px-4 py-2.5 text-right">{fmt(report.carryOver)}</td>
              </tr>

              {report.days.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    해당 기간에 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                report.days.map((day) => {
                  const expanded = expandedDates.has(day.date);
                  return (
                    <Fragment key={day.date}>
                      <tr
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer print:cursor-default"
                        onClick={() => toggleDate(day.date)}
                      >
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1">
                            <svg
                              className={`w-3.5 h-3.5 text-gray-400 transition-transform print:hidden ${expanded ? "rotate-90" : ""}`}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            {formatDate(day.date)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-blue-700">
                          {day.incomeTotal > 0 ? fmt(day.incomeTotal) : "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-red-600">
                          {day.expenseTotal > 0 ? fmt(day.expenseTotal) : "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">{fmt(day.balance)}</td>
                      </tr>
                      {/* 상세 (확장 시) */}
                      {expanded && day.details.map((detail, idx) => (
                        <tr key={`${day.date}-${idx}`} className="border-b border-gray-50 bg-gray-50/50">
                          <td className="pl-10 pr-4 py-1.5 text-xs text-gray-500">
                            <span className="font-mono">{detail.voucherNo}</span>
                            <span className={`ml-2 ${detail.type === "D" ? "text-blue-600" : "text-red-500"}`}>
                              {detail.accountName}
                            </span>
                            {detail.description && (
                              <span className="text-gray-400 ml-1">- {detail.description}</span>
                            )}
                            {detail.counterpart && (
                              <span className="text-gray-400 ml-1">({detail.counterpart})</span>
                            )}
                          </td>
                          <td className="px-4 py-1.5 text-xs text-right text-blue-600">
                            {detail.type === "D" ? fmt(detail.amount) : ""}
                          </td>
                          <td className="px-4 py-1.5 text-xs text-right text-red-500">
                            {detail.type === "C" ? fmt(detail.amount) : ""}
                          </td>
                          <td className="px-4 py-1.5"></td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

