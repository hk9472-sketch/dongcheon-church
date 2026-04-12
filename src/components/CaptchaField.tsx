"use client";

import { useEffect, useState, useCallback } from "react";

interface CaptchaFieldProps {
  onAnswer: (answer: string, token: string) => void;
}

export default function CaptchaField({ onAnswer }: CaptchaFieldProps) {
  const [question, setQuestion] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchCaptcha = useCallback(async () => {
    setLoading(true);
    setAnswer("");
    try {
      const res = await fetch("/api/captcha");
      const data = await res.json();
      setQuestion(data.question);
      setToken(data.token);
    } catch {
      setQuestion("오류 - 새로고침 클릭");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setAnswer(val);
    onAnswer(val, token);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        자동 입력 방지
      </label>
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-3 px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-lg">
          {loading ? (
            <span className="text-sm text-gray-400">로딩 중...</span>
          ) : (
            <span className="text-base font-mono font-bold text-gray-800 select-none">
              {question}
            </span>
          )}
        </div>
        <input
          type="text"
          inputMode="numeric"
          value={answer}
          onChange={handleChange}
          placeholder="숫자 입력"
          className="w-20 px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={fetchCaptcha}
          className="px-3 py-2.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-500"
          title="새 문제"
        >
          새로고침
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-400">왼쪽에 보이는 숫자를 그대로 입력하세요.</p>
    </div>
  );
}
