"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  LabelList,
} from "recharts";

interface Point {
  minute: number;
  label: string;
  web: number;
  webDelta: number;
  youtube: number | null;
  embed?: number;
}

interface Props {
  serviceInstanceId: number;
  /** 차트 위에 표시할 제목 */
  title?: string;
}

/**
 * 한 예배의 분 단위 시계열을 두 개의 라인 차트로:
 *  - web (누적, +N 라벨 표시)
 *  - youtube (분당 동시 시청자)
 */
export default function TimeSeriesChart({ serviceInstanceId, title }: Props) {
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/live/timeseries?serviceInstanceId=${serviceInstanceId}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "조회 실패");
        if (!cancelled) setPoints(data.points || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceInstanceId]);

  if (loading) {
    return (
      <div className="py-8 text-center text-xs text-gray-400">
        차트 로딩 중...
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-3 text-center text-xs text-red-600">{error}</div>
    );
  }
  if (points.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-gray-400">
        시계열 데이터 없음
      </div>
    );
  }

  // tick 간격: 데이터가 많으면 보여줄 X 라벨 솎기 (10분마다)
  const tickInterval = Math.max(1, Math.floor(points.length / 12)) - 1;

  // +N 표시 — webDelta > 0 인 분만 라벨링
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderDeltaLabel = (props: any) => {
    const x = typeof props?.x === "number" ? props.x : null;
    const y = typeof props?.y === "number" ? props.y : null;
    const idx = typeof props?.index === "number" ? props.index : null;
    if (x === null || y === null || idx === null) return null;
    const p = points[idx];
    if (!p || p.webDelta <= 0) return null;
    return (
      <text
        x={x}
        y={y - 6}
        fill="#1d4ed8"
        fontSize="10"
        textAnchor="middle"
      >
        +{p.webDelta}
      </text>
    );
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {title && (
        <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">
          {title}
        </div>
      )}

      {/* Web 누적 차트 */}
      <div className="p-2">
        <div className="text-[11px] text-gray-600 mb-1 pl-2">
          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-1.5" />
          웹 참여 (분 단위 누적, <span className="font-mono">+N</span> = 그 분의 신규 진입자)
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={points} margin={{ top: 16, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              interval={tickInterval}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any, item: any) => {
                if (name === "web") {
                  const d = (item?.payload as Point | undefined)?.webDelta ?? 0;
                  return [`${value}명 (+${d})`, "웹 누적"];
                }
                return [String(value), String(name)];
              }}
              labelFormatter={(label) => `${label} (KST)`}
              contentStyle={{ fontSize: "11px" }}
            />
            <Line
              type="monotone"
              dataKey="web"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 2 }}
              isAnimationActive={false}
            >
              <LabelList content={renderDeltaLabel} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* YouTube 차트 */}
      <div className="p-2 border-t border-gray-100">
        <div className="text-[11px] text-gray-600 mb-1 pl-2">
          <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-1.5" />
          YouTube 동시 시청자 (분당 마지막 표본 · 외부 포함)
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={points} margin={{ top: 6, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              interval={tickInterval}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [`${value}명`, "동시"]}
              labelFormatter={(label) => `${label} (KST)`}
              contentStyle={{ fontSize: "11px" }}
            />
            <Line
              type="monotone"
              dataKey="youtube"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 임베드 재생 차트 — 우리 사이트 임베드 플레이어에서 PLAYING 상태 */}
      <div className="p-2 border-t border-gray-100">
        <div className="text-[11px] text-gray-600 mb-1 pl-2">
          <span className="inline-block w-2 h-2 bg-violet-500 rounded-full mr-1.5" />
          임베드 재생 (우리 사이트 플레이어 PLAYING · sessionId dedup)
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={points} margin={{ top: 6, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              interval={tickInterval}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [`${value}명`, "재생"]}
              labelFormatter={(label) => `${label} (KST)`}
              contentStyle={{ fontSize: "11px" }}
            />
            <Line
              type="monotone"
              dataKey="embed"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ r: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
