"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

// 외부 사이트로의 open redirect 방지.
// 허용: 상대경로(/...) 또는 pkistdc.net 호스트 (포트 무관, http/https 둘 다).
function safeRedirect(raw: string | null): string {
  if (!raw) return "/";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const u = new URL(raw);
    if (u.hostname === "pkistdc.net" && (u.protocol === "https:" || u.protocol === "http:")) {
      return u.toString();
    }
  } catch {
    // ignore
  }
  return "/";
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectUrl = safeRedirect(searchParams.get("redirect"));
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });

      if (res.ok) {
        window.location.href = redirectUrl;
      } else {
        const data = await res.json();
        setError(data.message || "로그인에 실패했습니다.");
      }
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 bg-gray-50 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-800">로그인</h1>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">아이디</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              autoComplete="username"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="아이디를 입력하세요"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="비밀번호를 입력하세요"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50"
          >
            {loading ? "처리 중..." : "로그인"}
          </button>

          <div className="text-center">
            <Link href="/auth/reset-password" className="text-sm text-gray-500 hover:text-blue-600 hover:underline">
              비밀번호를 잊으셨나요?
            </Link>
          </div>

          <div className="text-center pt-2">
            <span className="text-sm text-gray-500">계정이 없으신가요? </span>
            <Link href="/auth/register" className="text-sm text-blue-600 hover:underline">
              회원가입
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto mt-8 text-center text-gray-400">로딩 중...</div>}>
      <LoginForm />
    </Suspense>
  );
}
