"use client";

import { useEffect, useRef } from "react";

/**
 * 게시글 조회수 증가 트리거.
 * 서버 렌더에서 증가시키지 않고, 렌더 후 클라이언트에서 Route Handler 를 호출하여
 * 24시간 중복 방지 쿠키를 확실히 기록한다.
 *
 * React StrictMode 의 이중 렌더링을 대비해 ref 로 1회만 호출.
 */
export default function HitCounter({ postId }: { postId: number }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    fetch("/api/board/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId }),
      credentials: "same-origin",
    }).catch(() => {
      // 조회수 실패는 사용자 경험에 영향 주지 않도록 무시
    });
  }, [postId]);

  return null;
}
