"use client";

import { useState } from "react";

export default function CounterRecalcButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function run() {
    if (!confirm("게시글·댓글 수 drift를 전부 재계산합니다. 계속할까요?")) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/recalc-counters", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "재계산 실패");
      } else {
        setMsg(data.message || "재계산 완료");
      }
    } catch {
      setMsg("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={busy}
        className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50"
      >
        {busy ? "재계산 중…" : "카운터 재계산"}
      </button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </div>
  );
}
