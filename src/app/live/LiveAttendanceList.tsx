"use client";

import { useEffect, useState, useCallback } from "react";

interface AttendanceRecord {
  id: number;
  name: string;
  createdAt: string;
}

export default function LiveAttendanceList() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCouncil, setIsCouncil] = useState(false);

  const fetchRecords = useCallback(async () => {
    try {
      // 권찰회 API로 오늘 참여 목록 조회 (권한 있는 경우만)
      const res = await fetch("/api/council/live-attendance");
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        setIsCouncil(true);
      } else {
        // 권한 없으면 간단한 카운트만 표시
        setIsCouncil(false);
      }
    } catch {
      setIsCouncil(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
    const interval = setInterval(fetchRecords, 60_000); // 1분마다 갱신
    // 등록 이벤트 수신 시 즉시 갱신
    const onUpdated = () => fetchRecords();
    window.addEventListener("live-attendance-updated", onUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener("live-attendance-updated", onUpdated);
    };
  }, [fetchRecords]);

  if (loading) {
    return (
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <h3 className="text-sm font-bold text-purple-800 mb-2">참여 등록 현황</h3>
        <p className="text-xs text-purple-400">불러오는 중...</p>
      </div>
    );
  }

  // 권한 없으면 표시하지 않음
  if (!isCouncil) return null;

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-purple-800">참여 등록 현황</h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={fetchRecords}
            className="text-[10px] text-purple-500 hover:text-purple-700 hover:bg-purple-100 px-1.5 py-0.5 rounded transition-colors"
            title="새로고침"
          >
            ↻ 새로고침
          </button>
          <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
            {records.length}명
          </span>
        </div>
      </div>
      {records.length === 0 ? (
        <p className="text-xs text-purple-400">등록된 참여자가 없습니다.</p>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-purple-200">
                <th className="text-left py-1 text-purple-600 font-medium">이름</th>
                <th className="text-right py-1 text-purple-600 font-medium">등록시간</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-purple-100 last:border-b-0">
                  <td className="py-1 text-purple-800">{r.name}</td>
                  <td className="py-1 text-right text-purple-500">
                    {new Date(r.createdAt).toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
