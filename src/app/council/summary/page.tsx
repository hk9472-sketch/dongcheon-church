"use client";

import { useState } from "react";
import HelpButton from "@/components/HelpButton";

type ViewMode = "group" | "division";

interface GroupRow {
  groupName: string;
  adultSam: number; adultOh: number; adultJupre: number; adultJuhu: number;
  midSam: number; midOh: number; midJupre: number; midJuhu: number;
  bibleMale: number; bibleFemale: number; prayer: number;
}

interface DivisionRow {
  division: string;
  sam: number; oh: number; jupre: number; juhu: number;
  bible: number; prayer: number;
}

interface DateRow {
  date: string;
  adultSam: number; adultOh: number; adultJupre: number; adultJuhu: number;
  midSam: number; midOh: number; midJupre: number; midJuhu: number;
  bibleMale: number; bibleFemale: number; prayer: number;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function thirtyDaysAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function downloadExcel(filename: string) {
  const tables = document.querySelectorAll("table");
  if (!tables.length) return;
  let tablesHtml = "";
  tables.forEach((t) => { tablesHtml += t.outerHTML + "<br/>"; });
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>td,th{border:1px solid #999;padding:2px 5px;text-align:center;font-size:11px;} th{background:#f0f0f0;font-weight:bold;}</style></head><body>${tablesHtml}</body></html>`;
  const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00+09:00");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
}

export default function SummaryPage() {
  const [fromDate, setFromDate] = useState(thirtyDaysAgoStr());
  const [toDate, setToDate] = useState(todayStr());
  const [viewMode, setViewMode] = useState<ViewMode>("group");
  const [groupData, setGroupData] = useState<GroupRow[]>([]);
  const [divisionData, setDivisionData] = useState<DivisionRow[]>([]);
  const [dateData, setDateData] = useState<DateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/council/overall-report?from=${fromDate}&to=${toDate}`);
      const result = await res.json();
      setGroupData(result.byGroup || []);
      setDivisionData(result.byDivision || []);
      setDateData(result.byDate || []);
      setSearched(true);
    } catch { /* */ }
    setLoading(false);
  };

  const groupCols = [
    { key: "adultSam", label: "삼일", group: "장년" },
    { key: "adultOh", label: "오일", group: "장년" },
    { key: "adultJupre", label: "주전", group: "장년" },
    { key: "adultJuhu", label: "주후", group: "장년" },
    { key: "midSam", label: "삼일", group: "중간" },
    { key: "midOh", label: "오일", group: "중간" },
    { key: "midJupre", label: "주전", group: "중간" },
    { key: "midJuhu", label: "주후", group: "중간" },
    { key: "bibleMale", label: "남반", group: "성경" },
    { key: "bibleFemale", label: "여반", group: "성경" },
    { key: "prayer", label: "기도", group: "기도" },
  ] as const;

  const divCols = [
    { key: "sam", label: "삼일" },
    { key: "oh", label: "오일" },
    { key: "jupre", label: "주전" },
    { key: "juhu", label: "주후" },
    { key: "bible", label: "성경" },
    { key: "prayer", label: "기도" },
  ] as const;

  // 날짜 수
  const dateCount = dateData.length;

  // 평균 계산
  function avg(val: number) {
    return dateCount > 0 ? (val / dateCount).toFixed(1) : "0";
  }

  const tabs: { key: ViewMode; label: string }[] = [
    { key: "group", label: "구역별 집계" },
    { key: "division", label: "반사별 집계" },
  ];

  const hasData = viewMode === "group" ? groupData.length > 0 : divisionData.length > 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h1 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">보고서 집계 <HelpButton slug="council-summary" /></h1>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">시작일</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">종료일</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm" />
          </div>
          <button onClick={handleSearch} disabled={loading}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50">
            {loading ? "조회 중..." : "조회"}
          </button>
          <button onClick={() => window.print()}
            className="px-4 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 print:hidden">
            인쇄
          </button>
          {hasData && (
            <button onClick={() => downloadExcel(`보고서집계_${viewMode}_${fromDate}_${toDate}.xls`)}
              className="px-4 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 print:hidden">
              엑셀
            </button>
          )}
        </div>
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200 px-4 flex gap-1 pt-2">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setViewMode(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              viewMode === tab.key
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto p-4">
        {!searched ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            조회 버튼을 눌러 집계를 검색하세요.
          </div>
        ) : !hasData ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            {loading ? "조회 중..." : "해당 기간에 데이터가 없습니다."}
          </div>
        ) : viewMode === "group" ? (
          /* 구역별 집계 */
          <>
            <div className="text-xs text-gray-500 mb-2">기간: {fromDate} ~ {toDate} ({dateCount}일간 데이터)</div>
            <table className="w-full text-xs border-collapse print:text-[10px]">
              <thead>
                <tr className="bg-gray-100">
                  <th rowSpan={2} className="border border-gray-300 px-2 py-1 text-center w-20">구역</th>
                  <th colSpan={4} className="border border-gray-300 px-1 py-1 text-center bg-blue-50">장년반</th>
                  <th colSpan={4} className="border border-gray-300 px-1 py-1 text-center bg-green-50">중간반</th>
                  <th colSpan={2} className="border border-gray-300 px-1 py-1 text-center bg-purple-50">성경</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 text-center bg-yellow-50 w-10">기도</th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 text-center bg-orange-50 w-12">합계</th>
                </tr>
                <tr className="bg-gray-50">
                  {groupCols.slice(0, 4).map((c) => <th key={c.key} className="border border-gray-300 px-1 py-1 text-center bg-blue-50 w-10">{c.label}</th>)}
                  {groupCols.slice(4, 8).map((c) => <th key={c.key} className="border border-gray-300 px-1 py-1 text-center bg-green-50 w-10">{c.label}</th>)}
                  {groupCols.slice(8, 10).map((c) => <th key={c.key} className="border border-gray-300 px-1 py-1 text-center bg-purple-50 w-10">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {groupData.map((row) => {
                  const rowTotal = groupCols.reduce((sum, c) => sum + ((row as unknown as Record<string, number>)[c.key] || 0), 0);
                  return (
                    <tr key={row.groupName} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-2 py-1 text-center font-medium">{row.groupName}</td>
                      {groupCols.map((c) => (
                        <td key={c.key} className="border border-gray-300 px-1 py-1 text-center">
                          {(row as unknown as Record<string, number>)[c.key] || ""}
                        </td>
                      ))}
                      <td className="border border-gray-300 px-1 py-1 text-center font-bold bg-orange-50/50">{rowTotal || ""}</td>
                    </tr>
                  );
                })}
                {/* 합계 */}
                {(() => {
                  const t: Record<string, number> = {};
                  for (const c of groupCols) t[c.key] = 0;
                  for (const r of groupData) for (const c of groupCols) t[c.key] += (r as unknown as Record<string, number>)[c.key] || 0;
                  const total = groupCols.reduce((sum, c) => sum + (t[c.key] || 0), 0);
                  return (
                    <>
                      <tr className="bg-yellow-50 font-bold">
                        <td className="border border-gray-300 px-2 py-1 text-center">합계</td>
                        {groupCols.map((c) => (
                          <td key={c.key} className="border border-gray-300 px-1 py-1 text-center">{t[c.key] || ""}</td>
                        ))}
                        <td className="border border-gray-300 px-1 py-1 text-center bg-orange-100/50">{total || ""}</td>
                      </tr>
                      {dateCount > 0 && (
                        <tr className="bg-blue-50 text-gray-600">
                          <td className="border border-gray-300 px-2 py-1 text-center text-[10px]">평균</td>
                          {groupCols.map((c) => (
                            <td key={c.key} className="border border-gray-300 px-1 py-1 text-center text-[10px]">{avg(t[c.key])}</td>
                          ))}
                          <td className="border border-gray-300 px-1 py-1 text-center text-[10px]">{avg(total)}</td>
                        </tr>
                      )}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </>
        ) : (
          /* 반사별 집계 */
          <>
            <div className="text-xs text-gray-500 mb-2">기간: {fromDate} ~ {toDate} ({dateCount}일간 데이터)</div>
            <table className="w-full text-xs border-collapse print:text-[10px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-1.5 text-center w-20">반사</th>
                  {divCols.map((c) => (
                    <th key={c.key} className="border border-gray-300 px-2 py-1.5 text-center w-16">{c.label}</th>
                  ))}
                  <th className="border border-gray-300 px-2 py-1.5 text-center bg-orange-50 w-16">합계</th>
                </tr>
              </thead>
              <tbody>
                {divisionData.map((row) => {
                  const rowTotal = divCols.reduce((sum, c) => sum + ((row as unknown as Record<string, number>)[c.key] || 0), 0);
                  return (
                    <tr key={row.division} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-2 py-1.5 text-center font-medium">{row.division}</td>
                      {divCols.map((c) => (
                        <td key={c.key} className="border border-gray-300 px-2 py-1.5 text-center">
                          {(row as unknown as Record<string, number>)[c.key] || ""}
                        </td>
                      ))}
                      <td className="border border-gray-300 px-2 py-1.5 text-center font-bold bg-orange-50/50">{rowTotal || ""}</td>
                    </tr>
                  );
                })}
                {/* 합계 + 평균 */}
                {(() => {
                  const t: Record<string, number> = {};
                  for (const c of divCols) t[c.key] = 0;
                  for (const r of divisionData) for (const c of divCols) t[c.key] += (r as unknown as Record<string, number>)[c.key] || 0;
                  const total = divCols.reduce((sum, c) => sum + (t[c.key] || 0), 0);
                  return (
                    <>
                      <tr className="bg-yellow-50 font-bold">
                        <td className="border border-gray-300 px-2 py-1.5 text-center">합계</td>
                        {divCols.map((c) => (
                          <td key={c.key} className="border border-gray-300 px-2 py-1.5 text-center">{t[c.key] || ""}</td>
                        ))}
                        <td className="border border-gray-300 px-2 py-1.5 text-center bg-orange-100/50">{total || ""}</td>
                      </tr>
                      {dateCount > 0 && (
                        <tr className="bg-blue-50 text-gray-600">
                          <td className="border border-gray-300 px-2 py-1.5 text-center text-[10px]">평균</td>
                          {divCols.map((c) => (
                            <td key={c.key} className="border border-gray-300 px-2 py-1.5 text-center text-[10px]">{avg(t[c.key])}</td>
                          ))}
                          <td className="border border-gray-300 px-2 py-1.5 text-center text-[10px]">{avg(total)}</td>
                        </tr>
                      )}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
