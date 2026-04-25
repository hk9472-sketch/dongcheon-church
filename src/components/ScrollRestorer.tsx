"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Next.js App Router 기본 scroll 복원이 모바일에서 동적 콘텐츠 로딩 타이밍과
// 어긋나 메인 페이지로 돌아왔을 때 top 으로 강제 이동되는 문제 해결.
//
// 동작:
//   - 페이지 진입 시 sessionStorage 에 저장된 위치 복원
//   - scroll 추적 (debounce 200ms) → 떠나기 전 위치 저장
//   - cleanup 시점 (path 변경 직전) 마지막 위치 한 번 더 저장
//
// 키 형식: scroll:<pathname>?<search>
export default function ScrollRestorer() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 브라우저의 자동 복원은 끔 (우리가 직접 처리)
    const prev = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    const key = `scroll:${pathname}`;

    // 진입 시 복원 — 콘텐츠 그려진 후 다음 프레임
    const saved = sessionStorage.getItem(key);
    if (saved) {
      const y = parseInt(saved, 10);
      if (!isNaN(y)) {
        // 두 번 실행 — 첫 프레임은 콘텐츠 height 부족할 수 있음
        requestAnimationFrame(() => {
          window.scrollTo(0, y);
          requestAnimationFrame(() => window.scrollTo(0, y));
        });
      }
    }

    // scroll 추적 (debounce)
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        sessionStorage.setItem(key, String(window.scrollY));
      }, 200);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (timer) clearTimeout(timer);
      // 떠나기 직전 마지막 위치 저장 (closure 의 pathname 사용)
      sessionStorage.setItem(key, String(window.scrollY));
      window.history.scrollRestoration = prev;
    };
  }, [pathname]);

  return null;
}
