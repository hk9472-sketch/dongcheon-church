"use client";

import { useEffect, useState } from "react";

interface Stats {
  online: number;
  total: number;
  today: number;
  yesterday: number;
}

export default function VisitorCounter() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    // 진입 즉시 본인 카운트 등록 + 그 응답으로 stats 표시 (본인 포함).
    // POST 응답에 stats 가 같이 포함돼 있어 한 번에 처리됨.
    // VisitorTracker 의 3초 dwell 봇 필터와는 별개로, 봇 UA 는 서버에서 거름.
    const update = (init?: RequestInit) =>
      fetch("/api/visitor", init)
        .then((r) => r.json())
        .then((d) => {
          if (d && typeof d.total === "number") setStats(d);
        })
        .catch(() => {});

    update({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: window.location.pathname,
        referer: document.referrer || null,
        userAgent: navigator.userAgent,
      }),
    });

    // 30초마다 stats 갱신 (다른 방문자 변화 반영)
    const t = setInterval(() => update(), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!stats) return null;

  return (
    <div className="flex items-center gap-3 text-xs text-blue-200/80">
      <span>총계:<strong className="text-white ml-0.5">{(stats.total ?? 0).toLocaleString()}</strong></span>
      <span>현재:<strong className="text-green-300 ml-0.5">{(stats.online ?? 0).toLocaleString()}</strong></span>
      <span>오늘:<strong className="text-white ml-0.5">{(stats.today ?? 0).toLocaleString()}</strong></span>
      <span>어제:<strong className="text-white ml-0.5">{(stats.yesterday ?? 0).toLocaleString()}</strong></span>
    </div>
  );
}
