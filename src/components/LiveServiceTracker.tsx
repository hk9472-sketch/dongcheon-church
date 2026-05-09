"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * /live, /live-worship 페이지 진입 시 3초 dwell 후 첫 POST + 이후 30초 간격 heartbeat.
 * - 페이지 떠 있는 동안 계속 카운트에 잡히도록 (5분 윈도우 안에 항상 들어감)
 * - 페이지 떠나면 모든 타이머 정리 → 더 이상 POST X
 */
const DWELL_MS = 3000;
const HEARTBEAT_MS = 30_000;

export default function LiveServiceTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!/^\/(live|live-worship)/.test(pathname)) return;

    let stopped = false;
    const sendBeat = () => {
      if (stopped) return;
      fetch("/api/live/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname }),
      }).catch(() => {});
    };

    // 1) 첫 fire — 3초 dwell 후 (히트앤런 봇 거름)
    const initialT = setTimeout(() => {
      sendBeat();
    }, DWELL_MS);

    // 2) heartbeat — 30초 간격, 첫 fire 직후부터 시작
    const heartbeatT = setInterval(() => {
      sendBeat();
    }, HEARTBEAT_MS);

    return () => {
      stopped = true;
      clearTimeout(initialT);
      clearInterval(heartbeatT);
    };
  }, [pathname]);

  return null;
}
