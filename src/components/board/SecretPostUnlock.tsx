"use client";

import { useState } from "react";

interface SecretPostUnlockProps {
  postId: number;
}

export default function SecretPostUnlock({ postId }: SecretPostUnlockProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("비밀번호를 입력하세요.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/board/verify-post-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        // 성공: 쿠키가 설정되었으므로 페이지 재로드로 차단 해제된 화면 표시
        window.location.reload();
        return;
      }
      setError(data.message || "비밀번호가 일치하지 않습니다.");
    } catch {
      setError("요청 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-sm mx-auto">
      <p className="text-xs text-gray-500 mb-2">
        비밀글의 열람용 비밀번호를 알고 있다면 입력하여 열람할 수 있습니다.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="flex-1 px-3 py-2 text-sm border border-gray-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoComplete="off"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "확인중..." : "열람"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}
