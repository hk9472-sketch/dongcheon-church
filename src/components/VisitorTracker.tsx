"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * VisitorTracker - 방문자 추적 + 체류시간(heartbeat) 측정
 *
 * - mount 후 3초 머무르면 /api/visitor POST (방문 기록)
 * - 그 후 20초마다 /api/visitor/hb 호출하여 dwellSec 누적
 * - 페이지 이동/탭 닫기 시 sendBeacon 으로 마지막 보정
 *
 * sessionId 는 브라우저 단위 (localStorage). userId 와 함께 단단한 dedup 키.
 */
const DWELL_MS = 3000;        // 첫 POST 까지 대기
const HB_INTERVAL_MS = 20000; // heartbeat 간격
const SESSION_KEY = "dc_session_visitor_id.v1";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let v = localStorage.getItem(SESSION_KEY);
    if (!v) {
      v = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, v);
    }
    return v;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export default function VisitorTracker() {
  const pathname = usePathname();
  const sentPaths = useRef<Set<string>>(new Set());

  useEffect(() => {
    // 정적 리소스나 API 경로 등은 추적하지 않음
    const skipPatterns = [
      /^\/api\//,
      /^\/_next\//,
      /^\/favicon/,
      /^\/uploads\//,
      // 봇 공격 path — 우리 앱에 없는 경로 → 100% 봇 (방문자 카운트 뻥튀기 방지)
      /\.(php|asp|aspx|jsp|cgi|pl|sh|env|git|sql|bak)(\/|\?|$)/i,
      /^\/wp-/i,
      /^\/xmlrpc/i,
      /^\/phpmyadmin/i,
      /^\/\.env/i,
      /^\/\.git/i,
      /^\/admin\/setup/i,
      /^\/cgi-bin/i,
    ];

    const skipExtensions = [
      ".css",
      ".js",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".ico",
      ".svg",
      ".woff",
      ".woff2",
    ];

    if (skipPatterns.some((pattern) => pattern.test(pathname))) {
      return;
    }

    if (skipExtensions.some((ext) => pathname.endsWith(ext))) {
      return;
    }

    // 같은 브라우저 세션에서 동일 경로 재방문 시 중복 전송 방지
    if (sentPaths.current.has(pathname)) {
      return;
    }
    sentPaths.current.add(pathname);

    const sessionId = getOrCreateSessionId();
    let posted = false;
    let hbTimer: ReturnType<typeof setInterval> | null = null;

    // 페이지 진입 후 DWELL_MS 동안 머문 경우에만 방문 기록 전송.
    const timer = setTimeout(() => {
      posted = true;
      fetch("/api/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: pathname,
          referer: document.referrer || null,
          userAgent: navigator.userAgent,
          sessionId,
        }),
      }).catch(() => {});

      // 20초마다 hb. 첫 사이클은 20초 후.
      hbTimer = setInterval(() => {
        fetch("/api/visitor/hb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, path: pathname }),
          keepalive: true,
        }).catch(() => {});
      }, HB_INTERVAL_MS);
    }, DWELL_MS);

    // 페이지 이동/탭 닫기 시 final hb (sendBeacon)
    const sendFinal = () => {
      if (!posted) return;
      try {
        const data = JSON.stringify({ sessionId, path: pathname, final: true });
        const blob = new Blob([data], { type: "application/json" });
        navigator.sendBeacon?.("/api/visitor/hb", blob);
      } catch {
        // ignore
      }
    };
    window.addEventListener("pagehide", sendFinal);

    return () => {
      clearTimeout(timer);
      if (hbTimer) clearInterval(hbTimer);
      window.removeEventListener("pagehide", sendFinal);
      sendFinal();
    };
  }, [pathname]);

  return null;
}
