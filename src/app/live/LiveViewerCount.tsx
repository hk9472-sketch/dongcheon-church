"use client";

import { useEffect, useState } from "react";

interface Stats {
  currentService: { code: string; label: string; inProgress: boolean; currentCount: number };
  youtube: { enabled: boolean; concurrent: number; cumulative: number };
  combined: { currentNow: number; cumulativeToday: number };
}

export default function LiveViewerCount() {
  const [data, setData] = useState<Stats | null>(null);

  useEffect(() => {
    const fetchOnce = () => {
      fetch("/api/live/stats")
        .then((r) => r.json())
        .then((d) => setData(d))
        .catch(() => {});
    };
    fetchOnce();
    const t = setInterval(fetchOnce, 30_000);
    return () => clearInterval(t);
  }, []);

  if (!data) return null;
  const { inProgress, label, currentCount } = data.currentService;
  const yt = data.youtube;
  const total = data.combined.cumulativeToday;
  const now = data.combined.currentNow;

  return (
    <span
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${
        inProgress ? "bg-emerald-50 border-emerald-200" : "bg-blue-50 border-blue-200"
      }`}
      title={
        inProgress
          ? `${label} — 웹 ${currentCount}명${yt.enabled ? ` + 유튜브 ${yt.concurrent}명` : ""}, 총시청 ${total}명`
          : `현재 ${now}명, 총시청 ${total}명`
      }
    >
      <svg
        className={`w-4 h-4 ${inProgress ? "text-emerald-600" : "text-blue-500"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
        />
      </svg>
      <span className={`text-xs font-bold ${inProgress ? "text-emerald-700" : "text-blue-700"}`}>
        현재 {now}명
        <span className="text-gray-500 font-normal"> / </span>
        총시청 {total}명
      </span>
    </span>
  );
}
