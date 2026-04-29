"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * VisitorTracker - 방문자 추적 컴포넌트
 *
 * 페이지 이동 시 /api/visitor 로 POST 요청을 보내 방문 기록을 저장합니다.
 * - 같은 세션에서 동일 경로 새로고침 시 중복 전송하지 않음
 * - 서버 측에서도 같은 IP는 하루 1회만 카운트
 * 렌더링되는 UI 요소는 없습니다.
 */
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

    // 방문 기록 전송 (fire-and-forget)
    fetch("/api/visitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: pathname,
        referer: document.referrer || null,
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {
      // 방문자 추적 실패는 무시 (사용자 경험에 영향 없음)
    });
  }, [pathname]);

  return null;
}
