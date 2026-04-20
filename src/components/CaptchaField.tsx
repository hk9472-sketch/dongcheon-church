"use client";

import { useEffect, useState, useCallback } from "react";

interface CaptchaFieldProps {
  onAnswer: (answer: string, token: string) => void;
  /** compact: 레이블·안내 문구 제거하고 한 줄로. 폼 inline 배치용. */
  compact?: boolean;
}

export default function CaptchaField({ onAnswer, compact }: CaptchaFieldProps) {
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
      setQuestion("오류");
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

  if (compact) {
    // 새로고침 버튼 뒤에 mr-4(16px) 여백을 둬 인접한 '취소'·'등록하기' 등 버튼과의
    // 실수 클릭을 방지. 숫자박스-입력칸 간격은 적당히 조밀하게 유지.
    return (
      <div className="inline-flex items-center gap-2 mr-4" title="왼쪽 숫자를 그대로 입력">
        <span
          className={`px-3 py-1.5 text-sm font-mono font-bold bg-gray-100 border border-gray-300 rounded min-w-[72px] text-center select-none leading-none ${
            loading ? "text-gray-400" : "text-gray-800"
          }`}
        >
          {loading ? "..." : question}
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={answer}
          onChange={handleChange}
          placeholder="숫자"
          className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-center"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={fetchCaptcha}
          className="px-5 h-9 flex items-center justify-center text-base border border-gray-300 rounded hover:bg-gray-50 text-gray-500"
          title="새 문제"
          aria-label="CAPTCHA 새로고침"
        >
          ↻
        </button>
      </div>
    );
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
