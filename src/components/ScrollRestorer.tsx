"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Next.js App Router 의 server component 가 메인 페이지로 돌아올 때
// 콘텐츠를 점진적으로 fetch/render 하기 때문에, 복원 시점에 페이지 height
// 가 부족해 scrollTo 가 끝까지 못 가는 문제.
//
// 해결: 저장된 위치까지 페이지 height 가 충분해질 때까지 retry.
// 최대 60회 (~1초) 시도 후 포기.
//
// scrollRestoration = "manual" 은 설정하지 않음 — 브라우저 기본 auto 동작도
// 함께 활용 (이중 안전망).
export default function ScrollRestorer() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const key = `scroll:${pathname}`;
    const saved = sessionStorage.getItem(key);

    if (saved) {
      const targetY = parseInt(saved, 10);
      if (!isNaN(targetY) && targetY > 0) {
        let attempts = 0;
        const MAX = 60;
        let cancelled = false;

        const tryRestore = () => {
          if (cancelled || attempts >= MAX) return;
          attempts++;

          const docHeight = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight
          );
          const maxScroll = docHeight - window.innerHeight;

          if (maxScroll >= targetY - 10) {
            // height 충분 — 복원
            window.scrollTo(0, targetY);
            // 다음 프레임에 한 번 더 (이미지 lazy load 등으로 후속 shift 가능)
            requestAnimationFrame(() => {
              if (!cancelled) window.scrollTo(0, targetY);
            });
            return;
          }

          // 아직 부족 — 다음 프레임 재시도
          requestAnimationFrame(tryRestore);
        };

        // 첫 시도는 다음 프레임부터
        requestAnimationFrame(tryRestore);

        // 사용자가 직접 스크롤하면 retry 중단 (방해 방지)
        const stopRetry = () => {
          cancelled = true;
        };
        window.addEventListener("wheel", stopRetry, { passive: true, once: true });
        window.addEventListener("touchstart", stopRetry, { passive: true, once: true });
        window.addEventListener("keydown", stopRetry, { once: true });
      }
    }

    // 현재 위치 추적 (debounce 200ms)
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
      // 떠나기 직전 마지막 위치 저장 (closure 의 pathname/key 사용)
      sessionStorage.setItem(key, String(window.scrollY));
    };
  }, [pathname]);

  return null;
}
