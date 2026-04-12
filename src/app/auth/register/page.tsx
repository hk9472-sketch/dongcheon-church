"use client";

import Link from "next/link";
import { useState } from "react";
import CaptchaField from "@/components/CaptchaField";

export default function RegisterPage() {
  const [form, setForm] = useState({
    userId: "",
    password: "",
    passwordConfirm: "",
    name: "",
    email: "",
    phone: "",
  });
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleCaptcha(answer: string, token: string) {
    setCaptchaAnswer(answer);
    setCaptchaToken(token);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, captchaAnswer, captchaToken }),
      });

      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json();
        setError(data.message || "회원가입에 실패했습니다.");
      }
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 bg-gray-50 border-b border-gray-200">
            <h1 className="text-lg font-bold text-gray-800">회원가입 완료</h1>
          </div>
          <div className="p-6 text-center space-y-4">
            <p className="text-5xl">📧</p>
            <p className="text-base font-semibold text-gray-800">가입 신청이 완료되었습니다!</p>
            <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800 text-left">
              <p className="font-medium mb-1">이메일 인증이 필요합니다</p>
              <p>
                <strong>{form.email}</strong>로 인증 링크를 발송했습니다.
                메일함을 확인하여 인증을 완료해 주세요.
              </p>
              <p className="mt-1 text-xs text-blue-600">
                * 인증 링크는 24시간 유효합니다.
                * 스팸 메일함도 확인해 보세요.
              </p>
            </div>
            <Link
              href="/auth/login"
              className="inline-block mt-2 px-6 py-2.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors"
            >
              로그인하기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 bg-gray-50 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-800">회원가입</h1>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              아이디 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="userId"
              value={form.userId}
              onChange={handleChange}
              required
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_]+"
              autoComplete="username"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="영문, 숫자, 밑줄 (3~20자)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              비밀번호 <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={4}
              autoComplete="new-password"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="4자 이상"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              비밀번호 확인 <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              name="passwordConfirm"
              value={form.passwordConfirm}
              onChange={handleChange}
              required
              autoComplete="new-password"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="비밀번호를 다시 입력하세요"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              maxLength={20}
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이메일 <span className="text-red-500">*</span>
              <span className="ml-1 text-xs text-gray-400 font-normal">(인증 링크 발송)</span>
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="실제 사용하시는 이메일을 입력하세요"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="010-1234-5678"
            />
          </div>

          <CaptchaField onAnswer={handleCaptcha} />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50"
          >
            {loading ? "가입 처리 중..." : "회원가입"}
          </button>

          <div className="text-center pt-2">
            <span className="text-sm text-gray-500">이미 계정이 있으신가요? </span>
            <Link href="/auth/login" className="text-sm text-blue-600 hover:underline">
              로그인
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
