"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface Stats {
  online: number;
  total: number;
  today: number;
  yesterday: number;
}

export default function VisitorCounter() {
  const [stats, setStats] = useState<Stats | null>(null);
  const pathname = usePathname();
  const firstRef = useRef(true);

  // 페이지 이동마다 stats 재조회 — 서버에 5초 in-memory cache 가 있어
  // 동일 TTL 내 여러 페이지 이동이 와도 실제 DB 쿼리는 최대 1회.
  // 첫 mount 때만 POST 로 본인 카운트 등록 + 응답으로 본인 포함된 stats 수신.
  useEffect(() => {
    const apply = (d: unknown) => {
      if (d && typeof (d as Stats).total === "number") setStats(d as Stats);
    };

    if (firstRef.current) {
      firstRef.current = false;
      fetch("/api/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: pathname,
          referer: document.referrer || null,
          userAgent: navigator.userAgent,
        }),
      })
        .then((r) => r.json())
        .then(apply)
        .catch(() => {});
    } else {
      fetch("/api/visitor")
        .then((r) => r.json())
        .then(apply)
        .catch(() => {});
    }
  }, [pathname]);

  // 한 페이지에 오래 머무는 사용자도 30초마다 갱신.
  useEffect(() => {
    const t = setInterval(() => {
      fetch("/api/visitor")
        .then((r) => r.json())
        .then((d) => {
          if (d && typeof d.total === "number") setStats(d);
        })
        .catch(() => {});
    }, 30_000);
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
