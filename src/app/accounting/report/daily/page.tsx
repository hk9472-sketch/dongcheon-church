"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import HelpButton from "@/components/HelpButton";
import LastInputBar from "@/components/accounting/LastInputBar";
import { auditInline, auditTitle } from "@/components/accounting/AuditStamp";

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
  createdBy?: string;
  createdAt?: string;
  modifiedBy?: string | null;
  modifiedAt?: string | null;
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
  priorIncome: number; // 연초 ~ 조회 시작 전 수입 (누계 기준)
  priorExpense: number;
  days: DailyRow[];
}

/** 수기장부식 월계·누계 — 각 월 마지막 일자 뒤에 표시 */
interface MonthTotal {
  ym: string;
  income: number;
  expense: number;
  cumIncome: number;
  cumExpense: number;
  balance: number;
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
        // 기본값 = "전체" (unitId="" 유지). 첫 단위로 자동 선택하지 않음.
      });
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        reportType: "daily",
        unitId: unitId || "all",
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
      setReport({ carryOver, priorIncome: data.priorIncome ?? 0, priorExpense: data.priorExpense ?? 0, days });
      setExpandedDates(new Set());
    } catch (err: any) {
      setError(err.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [unitId, dateFrom, dateTo]);

  useEffect(() => {
    fetchReport();
  }, [unitId, dateFrom, dateTo, fetchReport]);

  // 월계·누계 (누계 = 1월 1일부터)
  const monthTotals = new Map<string, MonthTotal>(); // 그 달 마지막 일자 → 합계
  if (report) {
    let cumIncome = report.priorIncome;
    let cumExpense = report.priorExpense;
    let mIncome = 0;
    let mExpense = 0;
    report.days.forEach((day, i) => {
      const ym = day.date.slice(0, 7);
      // 연누계 — 조회기간이 해를 넘기면 1월 1일부터 다시 누적
      if (i > 0 && report.days[i - 1].date.slice(0, 4) !== day.date.slice(0, 4)) {
        cumIncome = 0;
        cumExpense = 0;
      }
      mIncome += day.incomeTotal;
      mExpense += day.expenseTotal;
      cumIncome += day.incomeTotal;
      cumExpense += day.expenseTotal;
      const next = report.days[i + 1];
      if (!next || next.date.slice(0, 7) !== ym) {
        monthTotals.set(day.date, { ym, income: mIncome, expense: mExpense, cumIncome, cumExpense, balance: day.balance });
        mIncome = 0;
        mExpense = 0;
      }
    });
  }
  const periodIncome = report?.days.reduce((s, d) => s + d.incomeTotal, 0) ?? 0;
  const periodExpense = report?.days.reduce((s, d) => s + d.expenseTotal, 0) ?? 0;

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
      <h1 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">일자별 현황 <HelpButton slug="accounting-report-daily" /></h1>

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

      {report && !loading && (
        <LastInputBar scope="ledger" dateFrom={dateFrom} dateTo={dateTo} unitId={unitId} className="mb-2 print:hidden" />
      )}

      {/* 보고서 */}
      {report && !loading && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* 인쇄용 제목 */}
          <div className="hidden print:block text-center py-4">
            <h2 className="text-lg font-bold">
              {(unitId ? units.find((u) => String(u.id) === unitId)?.name : "전체") || "전체"} - 일자별 현황
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
                            <span className="ml-2 text-[11px] text-gray-400" title={auditTitle(detail)}>
                              [{auditInline(detail)}]
                            </span>
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
                      {monthTotals.has(day.date) && (() => {
                        const t = monthTotals.get(day.date)!;
                        return (
                          <>
                            <tr className="bg-amber-50 border-t-2 border-amber-200 font-semibold">
                              <td className="px-4 py-2 text-amber-900">{Number(t.ym.slice(5, 7))}월 월계</td>
                              <td className="px-4 py-2 text-right text-blue-700">{fmt(t.income)}</td>
                              <td className="px-4 py-2 text-right text-red-600">{fmt(t.expense)}</td>
                              <td className="px-4 py-2 text-right text-gray-500 text-xs">차액 {fmt(t.income - t.expense)}</td>
                            </tr>
                            <tr className="bg-amber-100/60 border-b-2 border-amber-300 font-semibold">
                              <td className="px-4 py-2 text-amber-900">
                                누계 <span className="text-xs font-normal">(1월~{Number(t.ym.slice(5, 7))}월)</span>
                              </td>
                              <td className="px-4 py-2 text-right text-blue-800">{fmt(t.cumIncome)}</td>
                              <td className="px-4 py-2 text-right text-red-700">{fmt(t.cumExpense)}</td>
                              <td className="px-4 py-2 text-right">{fmt(t.balance)}</td>
                            </tr>
                          </>
                        );
                      })()}
                    </Fragment>
                  );
                })
              )}
            </tbody>
            {report.days.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-400 bg-teal-50 font-bold">
                  <td className="px-4 py-3 text-teal-900">조회기간 합계</td>
                  <td className="px-4 py-3 text-right text-blue-700">{fmt(periodIncome)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{fmt(periodExpense)}</td>
                  <td className="px-4 py-3 text-right">{fmt(report.carryOver + periodIncome - periodExpense)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

