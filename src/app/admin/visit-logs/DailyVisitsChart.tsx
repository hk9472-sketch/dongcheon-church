"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

interface Point {
  day: string; // YYYY-MM-DD (KST)
  visitors: number;
}

const RANGES = [
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
  { label: "180일", days: 180 },
];

/**
 * 일일 고유 방문자 시계열 (봇 제거됨). visitor_counts 기반.
 * 방문 로그 페이지 상단에 표시.
 */
export default function DailyVisitsChart() {
  const [days, setDays] = useState(30);
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/visit-logs/daily?days=${days}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPoints(Array.isArray(d.points) ? d.points : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const data = useMemo(
    () => points.map((p) => ({ ...p, label: p.day.slice(5).replace("-", "/") })),
    [points],
  );

  const stats = useMemo(() => {
    if (points.length === 0) return { avg: 0, max: 0, sum: 0 };
    const sum = points.reduce((s, p) => s + p.visitors, 0);
    const max = points.reduce((m, p) => Math.max(m, p.visitors), 0);
    return { avg: Math.round(sum / points.length), max, sum };
  }, [points]);

  // X축 라벨 솎기 (최대 ~15개만)
  const tickInterval = Math.max(0, Math.ceil(data.length / 15) - 1);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 flex-wrap">
        <span className="inline-block w-1 h-5 bg-emerald-600 rounded-full" />
        <h2 className="text-sm font-bold text-gray-800">일일 방문자 추이</h2>
        <span className="text-[11px] text-gray-400">고유 방문자 · 봇 제외</span>
        <div className="ml-auto flex items-center gap-3">
          {points.length > 0 && (
            <span className="text-[11px] text-gray-500">
              일평균 <strong className="text-emerald-700">{stats.avg.toLocaleString()}</strong>
              {" · "}최대 <strong className="text-emerald-700">{stats.max.toLocaleString()}</strong>
            </span>
          )}
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setDays(r.days)}
                className={`px-2 py-1 text-xs rounded border transition-colors ${
                  days === r.days
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-2">
        {loading && points.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-400">차트 로딩 중...</div>
        ) : data.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-400">데이터 없음</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={32} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => [`${value}명`, "방문자"]}
                labelFormatter={(label) => `${label} (KST)`}
                contentStyle={{ fontSize: "11px" }}
              />
              <Bar dataKey="visitors" fill="#10b981" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
