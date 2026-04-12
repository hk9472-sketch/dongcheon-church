"use client";

import { useState } from "react";

interface Props {
  onSuccess: () => void;
}

export default function ReauthForm({ onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json();
        setError(data.error || "비밀번호가 올바르지 않습니다.");
      }
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center py-24">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 w-80">
        <h2 className="text-lg font-bold text-gray-800 mb-2 text-center">비밀번호 확인</h2>
        <p className="text-sm text-gray-500 mb-4 text-center">
          보안을 위해 비밀번호를 다시 입력해주세요.
        </p>
        {error && (
          <div className="text-sm text-red-600 mb-3 text-center bg-red-50 rounded px-3 py-2">
            {error}
          </div>
        )}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm mb-3 focus:outline-none focus:border-indigo-500"
          placeholder="비밀번호"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "확인 중..." : "확인"}
        </button>
      </form>
    </div>
  );
}
