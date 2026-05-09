"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * /live, /live-worship 페이지 진입 시 3초 dwell 후 /api/live/track 호출.
 * 같은 세션에서 동일 path 재방문 시 중복 호출 안 함.
 * 봇/짧은 hit 은 서버·클라이언트 양쪽에서 거름.
 */
const DWELL_MS = 3000;
const sentInThisSession = new Set<string>();

export default function LiveServiceTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!/^\/(live|live-worship)/.test(pathname)) return;
    if (sentInThisSession.has(pathname)) return;
    sentInThisSession.add(pathname);

    const t = setTimeout(() => {
      fetch("/api/live/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname }),
      }).catch(() => {});
    }, DWELL_MS);

    return () => clearTimeout(t);
  }, [pathname]);

  return null;
}
