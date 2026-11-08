"use client";

import { useEffect, useState } from "react";

/** 유튜브 채널 구독자 수 — 서버가 1시간 캐시한 값을 한 번 받아 표시 (없으면 아무것도 안 보임) */
export default function LiveSubscriberCount() {
  const [count, setCount] = useState<number | null>(null);

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

  if (count === null) return null;
  return (
    <span className="text-sm text-gray-600">
      구독자 <strong className="text-gray-800">{count.toLocaleString("ko-KR")}</strong>명
    </span>
  );
}
