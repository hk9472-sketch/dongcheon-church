"use client";

import { useState, useEffect } from "react";

export default function LiveAttendanceForm() {
  const [names, setNames] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function addRow() {
    if (names.length >= 20) return;
    setNames([...names, ""]);
  }

  function removeRow(index: number) {
    if (names.length <= 1) return;
    setNames(names.filter((_, i) => i !== index));
  }

  function handleChange(index: number, value: string) {
    const next = [...names];
    next[index] = value;
    setNames(next);
  }

  async function handleSubmit() {
    const valid = names.map((n) => n.trim()).filter((n) => n.length > 0);
    if (valid.length === 0) {
      setMessage({ type: "error", text: "이름을 입력해 주세요." });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/live/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: valid }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: data.message });
        setNames([""]);
        // 참여현황 목록 갱신 트리거
        window.dispatchEvent(new Event("live-attendance-updated"));
      } else {
        setMessage({ type: "error", text: data.message || "등록에 실패했습니다." });
      }
    } catch {
      setMessage({ type: "error", text: "서버 연결에 실패했습니다." });
    } finally {
      setSubmitting(false);
    }
  }

  // 현재 시간 표시 (1초마다 갱신)
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 현지 시간
  const localDate = now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  const localTime = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // 한국 시간
  const kstDate = now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul" });
  const kstTime = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Seoul" });

  // 현지와 한국의 날짜+시간이 다르면 외국으로 판단
  const isAbroad = localDate !== kstDate || localTime !== kstTime;

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-green-800">실시간 예배 참여</h3>
        <div className="text-right">
          <div className="text-[11px] text-green-600 font-mono">{localDate} {localTime}</div>
          {isAbroad && (
            <div className="text-[10px] text-blue-500 font-mono">(한국 {kstDate} {kstTime})</div>
          )}
        </div>
      </div>
      <p className="text-xs text-green-600 mb-3">시청하시는 분의 이름이나 구역 및 인원수를 입력해 주세요.</p>

      <div className="space-y-2 mb-3">
        {names.map((name, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => handleChange(i, e.target.value)}
              placeholder="참여"
              maxLength={100}
              className="flex-1 px-3 py-1.5 text-sm border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 bg-white"
            />
            {names.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded transition-colors"
                title="삭제"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          disabled={names.length >= 20}
          className="px-3 py-1.5 text-xs font-medium text-green-700 border border-green-300 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
        >
          + 추가
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="px-4 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {submitting ? "등록 중..." : "참여 등록"}
        </button>
      </div>

      {message && (
        <div className={`mt-2 px-3 py-2 rounded text-xs ${
          message.type === "success"
            ? "bg-green-100 text-green-800 border border-green-300"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
