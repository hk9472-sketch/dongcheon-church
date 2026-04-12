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
    fetch("/api/visitor")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.total === "number") setStats(d);
      })
      .catch(() => {});
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
