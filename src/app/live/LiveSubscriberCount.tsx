"use client";

import { useEffect, useState } from "react";
import { useLiveStatus } from "./LiveBadge";

/** 유튜브 채널 구독자 수 — 서버가 1시간 캐시한 값을 한 번 받아, 방송 중일 때만 표시 */
export default function LiveSubscriberCount() {
  const [count, setCount] = useState<number | null>(null);
  const live = useLiveStatus() === "live";

  useEffect(() => {
    let alive = true;
    fetch("/api/live/subscribers")
      .then((r) => r.json())
      .then((d) => {
        if (alive && typeof d?.count === "number") setCount(d.count);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (count === null || !live) return null;
  return (
    <span className="text-sm text-gray-600">
      구독자 <strong className="text-gray-800">{count.toLocaleString("ko-KR")}</strong>명
    </span>
  );
}
