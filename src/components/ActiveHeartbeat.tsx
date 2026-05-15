"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * 30초 간격으로 /api/active/ping 호출.
 * 로그인/비로그인 모두 — 서버에서 dc_session 쿠키로 user 자동 식별.
 * sessionId 는 localStorage 에 UUID 로 영속.
 *
 * 봇이나 정적 자원 path 는 ping 안 보냄.
 */
const PING_INTERVAL_MS = 30_000;
const SESSION_KEY = "dc_active_session_id";

const SKIP_PATTERNS = [/^\/api\//, /^\/_next\//, /\.(css|js|png|jpg|svg|ico|woff2?)$/i];

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export default function ActiveHeartbeat() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (SKIP_PATTERNS.some((re) => re.test(pathname))) return;

    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;

    const send = () => {
      fetch("/api/active/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, path: pathRef.current }),
        keepalive: true,
      }).catch(() => {});
    };

    send(); // 즉시 1회
    const t = setInterval(send, PING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [pathname]);

  return null;
}
