"use client";

import { useEffect, useState } from "react";
import HelpButton from "@/components/HelpButton";

interface AttendanceRecord {
  id: number;
  name: string;
  createdAt: string;
}

interface DateCount {
  date: string;
  count: number;
}

function toDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function CouncilLivePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [dates, setDates] = useState<DateCount[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);

  // 기간 조회 상태
  const now = new Date();
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const [fromDate, setFromDate] = useState(toDateStr(thirtyAgo));
  const [toDate, setToDate] = useState(toDateStr(now));

  function fetchDates(from: string, to: string) {
    setLoading(true);
    setSelectedDate("");
    setRecords([]);
    fetch(`/api/council/live-attendance?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data) => {
        setDates(data.dates || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function fetchRecords(date: string) {
    setLoading(true);
    fetch(`/api/council/live-attendance?date=${date}&from=${fromDate}&to=${toDate}`)
      .then((r) => r.json())
      .then((data) => {
        setRecords(data.records || []);
        if (data.dates?.length) setDates(data.dates);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchDates(fromDate, toDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch() {
    fetchDates(fromDate, toDate);
  }

  function handleDateClick(date: string) {
    setSelectedDate(date);
    fetchRecords(date);
  }

  async function handleDelete(id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    const res = await fetch(`/api/council/live-attendance?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      if (selectedDate) fetchRecords(selectedDate);
      else fetchDates(fromDate, toDate);
    }
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }

  function formatDateFull(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00+09:00");
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
  }

  const totalCount = dates.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">실시간 예배 참여 <HelpButton slug="council-live" /></h1>
        <p className="text-sm text-gray-500 mt-1">실시간 예배 시청자 참여 기록을 조회합니다.</p>
      </div>

      {/* 기간 조회 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">시작일</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">종료일</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            조회
          </button>
        </div>
      </div>

      {/* 날짜별 집계 테이블 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">
            날짜별 참여 현황
          </h3>
        </div>

        {loading && dates.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">불러오는 중...</div>
        ) : dates.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">조회 기간 내 기록이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-12">#</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">날짜</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 w-24">참여 인원</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((d, i) => (
                <tr
                  key={d.date}
                  onClick={() => handleDateClick(d.date)}
                  className={`border-b border-gray-100 cursor-pointer transition-colors ${
                    selectedDate === d.date
                      ? "bg-indigo-50 hover:bg-indigo-100"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <span className={`font-medium ${selectedDate === d.date ? "text-indigo-700" : "text-gray-800"}`}>
                      {formatDateFull(d.date)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-0.5 rounded-full text-sm font-bold ${
                      selectedDate === d.date
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-indigo-100 hover:text-indigo-700"
                    }`}>
                      {d.count}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-300">
                <td className="px-4 py-2.5"></td>
                <td className="px-4 py-2.5 text-sm font-semibold text-gray-600">합계 ({dates.length}일)</td>
                <td className="px-4 py-2.5 text-center">
                  <span className="text-sm font-bold text-gray-700">{totalCount}명</span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* 선택된 날짜의 참여자 목록 */}
      {selectedDate && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-indigo-800">
              {formatDateFull(selectedDate)} 참여자
              {records.length > 0 && (
                <span className="ml-2 text-indigo-600">({records.length}명)</span>
              )}
            </h3>
            <button
              type="button"
              onClick={() => { setSelectedDate(""); setRecords([]); }}
              className="text-xs text-indigo-500 hover:text-indigo-700"
            >
              닫기
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">참여 기록이 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-12">#</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">이름</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-24">시간</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 w-16">삭제</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-gray-800">{r.name}</td>
                    <td className="px-4 py-2 text-gray-500">{formatTime(r.createdAt)}</td>
                    <td className="px-4 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
