"use client";

import { useEffect, useState, useCallback } from "react";

const SERVICE_LABELS: Record<string, string> = {
  dawn: "새벽기도",
  eve: "밤예배",
  sun_child_am: "주교오전",
  sun_adult_am: "장년반 오전",
  sun_adult_pm: "장년반 오후",
  sun_child_pm: "주교오후",
  other: "기타",
};

interface RecentDay {
  date: string;
  perService: Record<string, number>;
  total: number;
}

interface LogRow {
  id: number;
  ip: string;
  path: string;
  serviceCode: string;
  serviceLabel: string;
  serviceDate: string;
  createdAt: string;
  userAgent: string | null;
  userId: number | null;
}

export default function LiveStatsPage() {
  const [recent, setRecent] = useState<RecentDay[]>([]);
  const [today, setToday] = useState<RecentDay | null>(null);
  const [current, setCurrent] = useState<{ label: string; inProgress: boolean; currentCount: number } | null>(null);
  const [days, setDays] = useState(14);

  // 로그 조회 상태
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [service, setService] = useState("");
  const [page, setPage] = useState(1);
  const [logRows, setLogRows] = useState<LogRow[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(() => {
    fetch(`/api/live/stats?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        setRecent(d.recent || []);
        setToday(d.today);
        setCurrent(d.currentService);
      });
  }, [days]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const loadLog = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (service) params.set("service", service);
      const res = await fetch(`/api/admin/live/log?${params}`);
      const d = await res.json();
      if (res.ok) {
        setLogRows(d.rows || []);
        setLogTotal(d.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [from, to, service, page]);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  const totalPages = Math.max(1, Math.ceil(logTotal / 100));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">실시간 예배 통계</h1>
        <p className="text-sm text-gray-500 mt-1">/live, /live-worship 페이지 자동 방문 카운트 — 서비스 시간별 분류.</p>
      </div>

      {/* 현재 진행 */}
      {current && (
        <div className={`rounded-lg p-4 border-2 ${current.inProgress ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50"}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">현재 상태</p>
              <p className="text-lg font-bold text-gray-800">
                {current.inProgress ? `${current.label} 진행 중` : "예배 시간 외"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{current.inProgress ? "현재까지 누적" : "최근 5분 접속"}</p>
              <p className="text-3xl font-bold text-emerald-700">{current.currentCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* 일자×서비스 매트릭스 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">최근 일자별 통계</h2>
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))} className="text-xs border border-gray-300 rounded px-2 py-1">
            <option value={7}>최근 7일</option>
            <option value={14}>최근 14일</option>
            <option value={30}>최근 30일</option>
            <option value={60}>최근 60일</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">일자</th>
                {Object.keys(SERVICE_LABELS).filter((k) => k !== "other").map((k) => (
                  <th key={k} className="px-3 py-2 text-right font-medium">{SERVICE_LABELS[k]}</th>
                ))}
                <th className="px-3 py-2 text-right font-medium">기타</th>
                <th className="px-3 py-2 text-right font-bold text-blue-700">합계</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((d) => (
                <tr key={d.date} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-mono text-gray-700">{d.date}</td>
                  {Object.keys(SERVICE_LABELS).filter((k) => k !== "other").map((k) => (
                    <td key={k} className="px-3 py-1.5 text-right text-gray-600 font-mono">
                      {d.perService[k] || ""}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right text-gray-400 font-mono">{d.perService.other || ""}</td>
                  <td className="px-3 py-1.5 text-right font-bold text-blue-700 font-mono">{d.total || ""}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={9} className="py-12 text-center text-gray-400">데이터 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 기간 로그 조회 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-bold text-gray-700">기간 방문 로그</h2>
        </div>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">시작일</label>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="border border-gray-300 rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">종료일</label>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="border border-gray-300 rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">서비스</label>
            <select value={service} onChange={(e) => { setService(e.target.value); setPage(1); }} className="border border-gray-300 rounded px-2 py-1 text-sm">
              <option value="">전체</option>
              {Object.entries(SERVICE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto text-sm text-gray-500">
            총 <strong className="text-blue-700">{logTotal}</strong>건
          </div>
        </div>
        <div className="overflow-x-auto max-h-[60vh]">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">시각</th>
                <th className="px-3 py-2 text-left font-medium">서비스</th>
                <th className="px-3 py-2 text-left font-medium">IP</th>
                <th className="px-3 py-2 text-left font-medium">path</th>
                <th className="px-3 py-2 text-left font-medium">UA</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="py-8 text-center text-gray-400">불러오는 중...</td></tr>}
              {!loading && logRows.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-gray-400">데이터 없음</td></tr>}
              {logRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-mono text-gray-700">{r.createdAt.replace("T", " ").slice(0, 19)}</td>
                  <td className="px-3 py-1.5 text-gray-700">{r.serviceLabel}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-600">{r.ip}</td>
                  <td className="px-3 py-1.5 text-gray-500">{r.path}</td>
                  <td className="px-3 py-1.5 text-gray-400 truncate max-w-[300px]" title={r.userAgent || ""}>{r.userAgent?.slice(0, 60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-4 py-2 border-t border-gray-200 flex items-center gap-2 text-xs">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-30">이전</button>
            <span>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-30">다음</button>
          </div>
        )}
      </div>
    </div>
  );
}
