"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/";
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 이관 레거시 회원 비밀번호 설정 단계
  const [isMigrationStep, setIsMigrationStep] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isMigrationStep) {
        // 이관 회원 비밀번호 설정 + 로그인
        const res = await fetch("/api/auth/migration-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, password, confirmPassword }),
        });

        if (res.ok) {
          window.location.href = redirectUrl;
        } else {
          const data = await res.json();
          setError(data.message || "비밀번호 설정에 실패했습니다.");
        }
      } else {
        // 일반 로그인
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, password }),
        });

        if (res.ok) {
          window.location.href = redirectUrl;
        } else {
          const data = await res.json();
          if (data.isMigrationUser) {
            // 이관된 레거시 회원 → 비밀번호 설정 단계로 전환
            setIsMigrationStep(true);
            setConfirmPassword("");
            setError("");
          } else {
            setError(data.message || "로그인에 실패했습니다.");
          }
        }
      }
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleCancelMigration() {
    setIsMigrationStep(false);
    setConfirmPassword("");
    setError("");
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
              readOnly={isMigrationStep}
              autoComplete="username"
              className={`w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                isMigrationStep ? "bg-gray-50 text-gray-500 cursor-default" : ""
              }`}
              placeholder="아이디를 입력하세요"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isMigrationStep ? "새 비밀번호" : "비밀번호"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (isMigrationStep) setConfirmPassword("");
              }}
              required
              autoComplete={isMigrationStep ? "new-password" : "current-password"}
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={isMigrationStep ? "사용하실 비밀번호를 입력하세요" : "비밀번호를 입력하세요"}
            />
          </div>

          {isMigrationStep && (
            <>
              <div className="px-4 py-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded">
                <p className="font-medium mb-1">이관된 계정 — 비밀번호 설정 필요</p>
                <p className="text-xs text-amber-700">
                  기존 비밀번호를 확인할 수 없는 이관된 계정입니다.
                  위에 입력하신 비밀번호를 새 비밀번호로 설정합니다.
                  동일한 비밀번호를 아래에 한 번 더 입력해 주세요.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="비밀번호를 한 번 더 입력하세요"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50"
          >
            {loading
              ? "처리 중..."
              : isMigrationStep
              ? "비밀번호 설정 후 로그인"
              : "로그인"}
          </button>

          {isMigrationStep && (
            <div className="text-center">
              <button
                type="button"
                onClick={handleCancelMigration}
                className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
              >
                취소 (처음으로 돌아가기)
              </button>
            </div>
          )}

          {!isMigrationStep && (
            <div className="text-center">
              <Link href="/auth/reset-password" className="text-sm text-gray-500 hover:text-blue-600 hover:underline">
                비밀번호를 잊으셨나요?
              </Link>
            </div>
          )}

          {!isMigrationStep && (
            <div className="text-center pt-2">
              <span className="text-sm text-gray-500">계정이 없으신가요? </span>
              <Link href="/auth/register" className="text-sm text-blue-600 hover:underline">
                회원가입
              </Link>
            </div>
          )}
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
