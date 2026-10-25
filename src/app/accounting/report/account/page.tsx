"use client";

import { useEffect, useState, useCallback } from "react";
import HelpButton from "@/components/HelpButton";
import LastInputBar from "@/components/accounting/LastInputBar";

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
  totalAmount: number; // 조회기간 합계
  cumAmount: number; // 누계 (1월 1일 ~ 종료일)
  byMonth: Record<string, number>;
}

interface AccountReport {
  months: string[];
  items: AccountSummary[];
  incomeTotal: number;
  expenseTotal: number;
  priorIncome: number;
  priorExpense: number;
  cumIncome: number; // 연누계 (종료일 연도 1월 1일 ~ 종료일)
  cumExpense: number;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function yearStartStr() {
  return `${new Date().getFullYear()}-01-01`;
}

export default function AccountReportPage() {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [dateFrom, setDateFrom] = useState(yearStartStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [typeFilter, setTypeFilter] = useState("all"); // all, D, C
  const [report, setReport] = useState<AccountReport | null>(null);
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
        reportType: "account",
        unitId: unitId || "all",
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/accounting/report?${params}`);
      if (!res.ok) throw new Error("데이터를 불러오지 못했습니다.");
      const data = await res.json();

      type Item = {
        accountId: number;
        code: string;
        name: string;
        type: string;
        amount: number;
        cumAmount?: number;
        byMonth?: Record<string, number>;
      };
      const items: AccountSummary[] = (data.items || []).map((i: Item) => ({
        accountId: i.accountId,
        accountCode: i.code,
        accountName: i.name,
        type: i.type,
        totalAmount: i.amount,
        cumAmount: i.cumAmount ?? i.amount,
        byMonth: i.byMonth || {},
      }));
      setReport({
        months: data.months || [],
        items,
        incomeTotal: data.totalIncome ?? 0,
        expenseTotal: data.totalExpense ?? 0,
        priorIncome: data.priorIncome ?? 0,
        priorExpense: data.priorExpense ?? 0,
        cumIncome: data.cumIncome ?? (data.totalIncome ?? 0) + (data.priorIncome ?? 0),
        cumExpense: data.cumExpense ?? (data.totalExpense ?? 0) + (data.priorExpense ?? 0),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "조회 실패");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [unitId, dateFrom, dateTo]);

  useEffect(() => {
    fetchReport();
  }, [unitId, dateFrom, dateTo, fetchReport]);

  const months = report?.months ?? [];
  const sections = (["D", "C"] as const).filter((t) => typeFilter === "all" || typeFilter === t);
  const sumMonth = (type: string, ym: string) =>
    (report?.items || []).filter((i) => i.type === type).reduce((s, i) => s + (i.byMonth[ym] ?? 0), 0);
  const colCount = 2 + months.length + 2;
  const unitLabel = (unitId ? units.find((u) => String(u.id) === unitId)?.name : "전체") || "전체";

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        계정별 현황 <HelpButton slug="accounting-report-account" />
      </h1>

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
        <p className="mt-2 text-xs text-gray-400">
          월별 금액 · 조회기간 합계 · 누계(종료일이 속한 해 1월 1일 ~ 종료일, 연누계)를 함께 표시합니다.
        </p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
      {loading && <div className="flex items-center justify-center py-12 text-gray-400">불러오는 중...</div>}

      {report && !loading && (
        <LastInputBar scope="ledger" dateFrom={dateFrom} dateTo={dateTo} unitId={unitId} className="mb-2 print:hidden" />
      )}
      {report && !loading && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <div className="hidden print:block text-center py-4">
            <h2 className="text-lg font-bold">{unitLabel} - 계정별 현황</h2>
            <p className="text-sm text-gray-500">
              {dateFrom} ~ {dateTo}
            </p>
          </div>

          <table className="w-full text-sm" style={{ minWidth: 420 + months.length * 96 }}>
            <thead>
              <tr className="bg-teal-50 border-b border-gray-200 text-teal-800">
                <th className="px-3 py-2.5 text-left font-medium w-16">코드</th>
                <th className="px-3 py-2.5 text-left font-medium">계정명</th>
                {months.map((ym) => (
                  <th key={ym} className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                    {Number(ym.slice(5, 7))}월
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-medium bg-teal-100/60">기간 합계</th>
                <th className="px-3 py-2.5 text-right font-medium bg-amber-50">누계</th>
              </tr>
            </thead>
            <tbody>
              {report.items.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-8 text-center text-gray-400">
                    해당 기간에 데이터가 없습니다.
                  </td>
                </tr>
              )}
              {report.items.length > 0 &&
                sections.map((t) => {
                  const rows = report.items.filter((i) => i.type === t);
                  const color = t === "D" ? "text-blue-700" : "text-red-600";
                  const total = t === "D" ? report.incomeTotal : report.expenseTotal;
                  const cum = t === "D" ? report.cumIncome : report.cumExpense;
                  return [
                    <tr key={`h${t}`} className={t === "D" ? "bg-blue-50" : "bg-red-50"}>
                      <td colSpan={colCount} className={`px-3 py-2 font-bold ${color}`}>
                        [{t === "D" ? "수입" : "지출"}]
                      </td>
                    </tr>,
                    ...rows.map((item) => (
                      <tr key={item.accountId} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-500 text-xs">{item.accountCode}</td>
                        <td className={`px-3 py-2 ${color}`}>{item.accountName}</td>
                        {months.map((ym) => (
                          <td key={ym} className="px-3 py-2 text-right font-mono">
                            {item.byMonth[ym] ? fmt(item.byMonth[ym]) : <span className="text-gray-300">-</span>}
                          </td>
                        ))}
                        <td className={`px-3 py-2 text-right font-mono font-semibold bg-teal-50/40 ${color}`}>
                          {fmt(item.totalAmount)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono bg-amber-50/50">{fmt(item.cumAmount)}</td>
                      </tr>
                    )),
                    <tr key={`s${t}`} className={`border-t-2 font-bold ${t === "D" ? "bg-blue-50 border-blue-200" : "bg-red-50 border-red-200"}`}>
                      <td className="px-3 py-2" />
                      <td className={`px-3 py-2 ${color}`}>{t === "D" ? "수입" : "지출"} 월계</td>
                      {months.map((ym) => (
                        <td key={ym} className={`px-3 py-2 text-right font-mono ${color}`}>
                          {fmt(sumMonth(t, ym))}
                        </td>
                      ))}
                      <td className={`px-3 py-2 text-right font-mono ${color}`}>{fmt(total)}</td>
                      <td className="px-3 py-2 text-right font-mono bg-amber-50">{fmt(cum)}</td>
                    </tr>,
                  ];
                })}
              {report.items.length > 0 && typeFilter === "all" && (
                <tr className="border-t-2 border-gray-300 bg-emerald-50 font-bold">
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-emerald-800">차액 (수입 − 지출)</td>
                  {months.map((ym) => (
                    <td key={ym} className="px-3 py-2.5 text-right font-mono text-emerald-800">
                      {fmt(sumMonth("D", ym) - sumMonth("C", ym))}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-800">
                    {fmt(report.incomeTotal - report.expenseTotal)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-800 bg-amber-50">
                    {fmt(report.cumIncome - report.cumExpense)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
