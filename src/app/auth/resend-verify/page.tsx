"use client";

import { useState } from "react";
import Link from "next/link";

export default function ResendVerifyPage() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [fixMode, setFixMode] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/resend-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          password,
          newEmail: fixMode && newEmail ? newEmail : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(data.message || "인증 메일을 재발송했습니다.");
      } else {
        setErr(data.message || "재발송에 실패했습니다.");
      }
    } catch {
      setErr("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 bg-gray-50 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-800">인증 메일 재발송</h1>
          <p className="text-xs text-gray-500 mt-1">
            메일이 오지 않았거나 이메일 주소가 잘못 입력된 경우 아래에서 재발송하세요.
          </p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">아이디</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={fixMode}
              onChange={(e) => setFixMode(e.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            이메일 주소를 수정하고 재발송
          </label>

          {fixMode && (
            <div>
              <label className="block text-xs text-gray-600 mb-1">새 이메일</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required={fixMode}
                placeholder="new@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {msg && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{msg}</p>}
          {err && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "발송 중..." : fixMode ? "이메일 수정하고 재발송" : "재발송"}
          </button>

          <div className="text-center pt-2">
            <Link href="/auth/login" className="text-xs text-gray-500 hover:text-blue-700">
              로그인으로 돌아가기
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
