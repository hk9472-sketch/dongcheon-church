"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const SERVICE_LABELS: Record<string, string> = {
  dawn: "새벽기도",
  eve: "밤예배",
  sun_child_am: "주교오전",
  sun_adult_am: "장년반 오전",
  sun_adult_pm: "장년반 오후",
  sun_child_pm: "주교오후",
  other: "기타",
};

const SERVICE_TIMES: Record<string, string> = {
  dawn: "월~토 03:00~05:00",
  eve: "수,금 18:00~20:20",
  sun_child_am: "일 08:00~09:00",
  sun_adult_am: "일 09:30~11:20",
  sun_adult_pm: "일 13:30~15:20",
  sun_child_pm: "일 16:10~17:00",
  other: "기타 시간",
};

interface RecentDay {
  date: string;
  perService: Record<string, number>;
  total: number;
}

interface StatsData {
  currentService: { code: string; label: string; inProgress: boolean; currentCount: number };
  nextService: { code: string; label: string; start: string } | null;
  today: RecentDay;
  recent: RecentDay[];
  youtube?: { enabled: boolean; concurrent: number; cumulative: number };
  combined?: { currentNow: number; cumulativeToday: number };
}

export default function PublicLiveStatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const todayStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const fourteenAgoStr = new Date(Date.now() + 9 * 3600 * 1000 - 13 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [statFrom, setStatFrom] = useState(fourteenAgoStr);
  const [statTo, setStatTo] = useState(todayStr);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    params.set("from", statFrom);
    params.set("to", statTo);
    fetch(`/api/live/stats?${params}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {});
  }, [statFrom, statTo]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto py-8 text-center text-gray-400">
        불러오는 중...
      </div>
    );
  }

  const { currentService, nextService, today, recent } = data;
  const orderedCodes = ["dawn", "eve", "sun_child_am", "sun_adult_am", "sun_adult_pm", "sun_child_pm"];

  // 서비스별 누적 (전체 기간) — 합산
  const serviceTotals: Record<string, number> = {};
  for (const day of recent) {
    for (const [code, cnt] of Object.entries(day.perService)) {
      serviceTotals[code] = (serviceTotals[code] || 0) + cnt;
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-block w-1 h-7 bg-emerald-500 rounded-full" />
          <h1 className="text-xl font-bold text-gray-800">실시간 예배 참석 통계</h1>
        </div>
        <Link
          href="/live"
          className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
        >
          ← 실시간 예배로
        </Link>
      </div>

      {/* 현재 진행 카드 — 웹 + YouTube 합산 */}
      <div
        className={`rounded-lg p-5 border-2 ${
          currentService.inProgress
            ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50"
            : "border-gray-200 bg-gray-50"
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">현재 상태</p>
            <p className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              {currentService.inProgress && (
                <span className="inline-block w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              )}
              {currentService.inProgress ? `${currentService.label} 진행 중` : "예배 시간 외"}
            </p>
            {nextService && !currentService.inProgress && (
              <p className="text-xs text-gray-500 mt-1.5">
                다음 예배: <strong>{nextService.label}</strong> ({new Date(nextService.start).toLocaleString("ko-KR")})
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="flex items-end gap-4">
              <div>
                <p className="text-xs text-gray-500">현재</p>
                <p className="text-4xl font-bold text-emerald-700 font-mono leading-none">{currentService.currentCount}<span className="text-base ml-1">명</span></p>
                {data.youtube?.enabled && (
                  <p className="text-sm font-semibold text-red-600 mt-1">
                    유튜브: <span className="font-mono">{data.youtube.concurrent}</span>
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500">총시청</p>
                <p className="text-3xl font-bold text-blue-700 font-mono leading-none">{data.combined?.cumulativeToday ?? 0}</p>
                {data.youtube?.enabled && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    YT 누적 {data.youtube.cumulative}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 오늘 서비스별 카드 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-bold text-gray-700">오늘 서비스별 접속 ({today.date})</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-4">
          {orderedCodes.map((code) => (
            <div key={code} className="rounded border border-gray-200 px-3 py-2.5 text-center bg-gray-50">
              <p className="text-[11px] text-gray-500">{SERVICE_LABELS[code]}</p>
              <p className="text-[10px] text-gray-400 leading-tight">{SERVICE_TIMES[code]}</p>
              <p className="text-2xl font-bold text-emerald-700 font-mono mt-1">
                {today.perService[code] || 0}
              </p>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 text-center">
          <span className="text-xs text-blue-700">
            오늘 합계 <strong className="text-base font-mono">{today.total}</strong>명
          </span>
        </div>
      </div>

      {/* 일자별 매트릭스 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-gray-700">일자별 통계</h2>
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={statFrom}
              onChange={(e) => setStatFrom(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1"
            />
            <span className="text-gray-400">~</span>
            <input
              type="date"
              value={statTo}
              onChange={(e) => setStatTo(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1"
            />
            <button
              type="button"
              onClick={() => {
                const t = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
                const f = new Date(Date.now() + 9 * 3600 * 1000 - 13 * 24 * 3600 * 1000).toISOString().slice(0, 10);
                setStatFrom(f);
                setStatTo(t);
              }}
              className="px-2 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
            >
              최근 14일
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">일자</th>
                {orderedCodes.map((k) => (
                  <th key={k} className="px-3 py-2 text-right font-medium">{SERVICE_LABELS[k]}</th>
                ))}
                <th className="px-3 py-2 text-right font-bold text-emerald-700">합계</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((d) => (
                <tr key={d.date} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-mono text-gray-700">{d.date}</td>
                  {orderedCodes.map((k) => (
                    <td key={k} className="px-3 py-1.5 text-right text-gray-600 font-mono">
                      {d.perService[k] || ""}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-bold text-emerald-700 font-mono">
                    {d.total || ""}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={orderedCodes.length + 2} className="py-12 text-center text-gray-400">데이터 없음</td></tr>
              )}
            </tbody>
            {recent.length > 0 && (
              <tfoot>
                <tr className="bg-blue-50 font-semibold">
                  <td className="px-3 py-2 text-right text-gray-700">기간 합계</td>
                  {orderedCodes.map((k) => (
                    <td key={k} className="px-3 py-2 text-right font-mono text-blue-700">
                      {serviceTotals[k] || 0}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-bold font-mono text-blue-700">
                    {Object.values(serviceTotals).reduce((s, n) => s + n, 0)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center leading-relaxed">
        ※ 카운트는 페이지에 3초 이상 머문 IP 기준 (서비스 시간 동안 동일 IP 1회). <br />
        실시간 예배 페이지를 시청한 모든 분이 자동으로 집계됩니다.
      </p>
    </div>
  );
}
