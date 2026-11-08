"use client";

import { useSyncExternalStore } from "react";

/**
 * 실시간 방송 상태 — LiveYoutubePlayer 가 window.__dcLiveStatus + 'dc-live-status' 이벤트로 알려 준다.
 *   LIVE 표시 · 구독자 수는 실제로 방송이 잡혔을 때(live)만 보인다 (확인 중 · 방송 대기에는 숨김).
 */
declare global {
  interface Window {
    __dcLiveStatus?: "checking" | "live" | "offline";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("dc-live-status", cb);
  return () => window.removeEventListener("dc-live-status", cb);
}

export function useLiveStatus(): "checking" | "live" | "offline" {
  return useSyncExternalStore(
    subscribe,
    () => window.__dcLiveStatus ?? "checking",
    () => "checking" as const,
  );
}

export default function LiveBadge() {
  if (useLiveStatus() !== "live") return null;
  return (
    <span className="flex items-center gap-1.5 px-3 py-1 bg-red-50 border border-red-200 rounded-full">
      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      <span className="text-xs font-bold text-red-600">LIVE</span>
    </span>
  );
}
