"use client";

import { useEffect } from "react";

/**
 * 새 창 로그인 완료 페이지.
 * 행정실 화면에서 세션 만료 시 '새 창에서 로그인' → 로그인 후 여기로 이동.
 * 원래 창(opener)에 완료를 알리고 이 창은 닫는다 — 원래 창의 입력 내용은 그대로 유지.
 */
export default function LoginDonePage() {
  useEffect(() => {
    try {
      window.opener?.postMessage({ type: "dc-login-done" }, window.location.origin);
    } catch {
      /* opener 없음 */
    }
    const t = setTimeout(() => window.close(), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center text-gray-600">
      <p className="text-lg font-semibold text-gray-800">로그인되었습니다.</p>
      <p className="text-sm">이 창을 닫고 원래 화면으로 돌아가 저장을 다시 눌러 주세요.</p>
      <button onClick={() => window.close()} className="mt-2 rounded bg-teal-600 px-4 py-2 text-sm text-white">
        창 닫기
      </button>
    </div>
  );
}
