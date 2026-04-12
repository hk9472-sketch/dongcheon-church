"use client";

import { useEffect, useState, useCallback } from "react";

interface AccUnit {
  id: number;
  code: string;
  name: string;
}

interface ClosingRow {
  month: number;
  totalIncome: number;
  totalExpense: number;
  carryOver: number;
  isClosed: boolean;
  closedAt: string | null;
  closedBy: string | null;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default function ClosingPage() {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<ClosingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/accounting/units")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.units || d || []).filter((u: any) => u.isActive);
        setUnits(list);
        if (list.length > 0 && !unitId) setUnitId(String(list[0].id));
      });
  }, []);

  const fetchClosings = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError("");
    try {
      // 마감 기록 조회
      const closingRes = await fetch(`/api/accounting/closing?${new URLSearchParams({ unitId, year: String(year) })}`);
      if (!closingRes.ok) throw new Error("데이터를 불러오지 못했습니다.");
      const closingData = await closingRes.json();
      const raw: any[] = Array.isArray(closingData) ? closingData : closingData.months || [];
      const closingMap = new Map(raw.map((r: any) => [r.month, r]));

      // 12개월 보고서 데이터로 실제 수입/지출 가져오기
      const allMonths: ClosingRow[] = [];
      for (let m = 1; m <= 12; m++) {
        const c = closingMap.get(m);
        if (c && c.closedAt) {
          // 마감된 월: 마감 기록의 금액 사용
          allMonths.push({
            month: m, totalIncome: c.totalIncome, totalExpense: c.totalExpense,
            carryOver: c.carryOver, isClosed: true, closedAt: c.closedAt, closedBy: c.closedBy,
          });
        } else {
          // 미마감 월: 월별 보고서에서 실제 금액 조회
          try {
            const rptRes = await fetch(`/api/accounting/report?${new URLSearchParams({
              reportType: "monthly", unitId, year: String(year), month: String(m),
            })}`);
            if (rptRes.ok) {
              const rpt = await rptRes.json();
              allMonths.push({
                month: m, totalIncome: rpt.totalIncome ?? 0, totalExpense: rpt.totalExpense ?? 0,
                carryOver: rpt.carryOver ?? 0, isClosed: false, closedAt: null, closedBy: null,
              });
            } else {
              allMonths.push({ month: m, totalIncome: 0, totalExpense: 0, carryOver: 0, isClosed: false, closedAt: null, closedBy: null });
            }
          } catch {
            allMonths.push({ month: m, totalIncome: 0, totalExpense: 0, carryOver: 0, isClosed: false, closedAt: null, closedBy: null });
          }
        }
      }
      setRows(allMonths);
    } catch (err: any) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [unitId, year]);

  useEffect(() => {
    if (unitId) fetchClosings();
  }, [unitId, year, fetchClosings]);

  const handleClose = async (month: number) => {
    if (!confirm(`${year}년 ${month}월을 마감하시겠습니까?\n마감 후에는 해당 월의 전표를 수정할 수 없습니다.`)) return;

    setActionLoading(month);
    try {
      const res = await fetch("/api/accounting/closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: Number(unitId), year, month }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "마감에 실패했습니다.");
      }
      await fetchClosings();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReopen = async (month: number) => {
    if (!confirm(`${year}년 ${month}월 마감을 해제하시겠습니까?\n관리자만 가능합니다.`)) return;

    setActionLoading(month);
    try {
      const delParams = new URLSearchParams({ unitId, year: String(year), month: String(month) });
      const res = await fetch(`/api/accounting/closing?${delParams}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "해제에 실패했습니다.");
      }
      await fetchClosings();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-6">마감 관리</h1>

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
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">불러오는 중...</div>
      )}

      {!loading && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-teal-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-center font-medium text-teal-800 w-16">월</th>
                  <th className="px-4 py-3 text-right font-medium text-teal-800">이월잔액</th>
                  <th className="px-4 py-3 text-right font-medium text-teal-800">수입합계</th>
                  <th className="px-4 py-3 text-right font-medium text-teal-800">지출합계</th>
                  <th className="px-4 py-3 text-right font-medium text-teal-800">마감잔액</th>
                  <th className="px-4 py-3 text-center font-medium text-teal-800">마감상태</th>
                  <th className="px-4 py-3 text-center font-medium text-teal-800">마감일</th>
                  <th className="px-4 py-3 text-center font-medium text-teal-800">마감자</th>
                  <th className="px-4 py-3 text-center font-medium text-teal-800 print:hidden">관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.month}
                      className={`border-b border-gray-100 ${
                        row.isClosed ? "bg-gray-50" : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-3 text-center font-medium">{row.month}월</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(row.carryOver)}</td>
                      <td className="px-4 py-3 text-right text-blue-700">
                        {row.totalIncome > 0 ? fmt(row.totalIncome) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600">
                        {row.totalExpense > 0 ? fmt(row.totalExpense) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700">
                        {fmt(row.carryOver + row.totalIncome - row.totalExpense)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.isClosed ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                            마감완료
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                            미마감
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">
                        {row.closedAt
                          ? new Date(row.closedAt).toLocaleDateString("ko-KR")
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">
                        {row.closedBy || "-"}
                      </td>
                      <td className="px-4 py-3 text-center print:hidden">
                        {row.isClosed ? (
                          <button
                            onClick={() => handleReopen(row.month)}
                            disabled={actionLoading === row.month}
                            className="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors border border-red-200"
                          >
                            {actionLoading === row.month ? "처리중..." : "해제"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleClose(row.month)}
                            disabled={actionLoading === row.month}
                            className="px-3 py-1.5 bg-teal-50 text-teal-700 text-xs rounded-lg hover:bg-teal-100 disabled:opacity-50 transition-colors border border-teal-200"
                          >
                            {actionLoading === row.month ? "처리중..." : "마감"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 범례 */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 print:hidden">
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></span>
                마감완료: 전표 수정 불가
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></span>
                미마감: 전표 수정 가능
              </span>
              <span>마감 해제는 관리자만 가능합니다.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
