"use client";

import { useEffect, useState } from "react";

/**
 * 미디어 기본 URL 설정 — /admin/settings 페이지에 임베드되는 단일 필드 섹션.
 * 글쓰기 에디터의 "미디어 URL 삽입" 모달이 이 값을 읽어 prefix 로 사용.
 */
export default function MediaBaseUrlSetting() {
  const [url, setUrl] = useState("");
  const [initial, setInitial] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/media-base-url")
      .then((r) => r.json())
      .then((d) => {
        const v = d?.url || "";
        setUrl(v);
        setInitial(v);
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/media-base-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data.error || "저장 실패" });
      } else {
        setInitial(data.url || "");
        setUrl(data.url || "");
        setMsg({ type: "ok", text: "저장되었습니다." });
        setTimeout(() => setMsg(null), 3000);
      }
    } catch {
      setMsg({ type: "err", text: "네트워크 오류" });
    } finally {
      setSaving(false);
    }
  }

  const dirty = url.trim() !== initial;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
      <div>
        <h3 className="text-base font-bold text-gray-800">미디어 기본 URL</h3>
        <p className="text-xs text-gray-500 mt-1">
          글쓰기 에디터의 "미디어 URL 삽입" 에서 prefix 로 사용됩니다. 예:{" "}
          <code className="bg-gray-100 px-1 rounded">http://111.111.11.11/111/</code> 로 설정하면
          사용자는 <code className="bg-gray-100 px-1 rounded">weekly/20260420.mp4</code> 만 입력해도
          전체 URL 이 자동 조합됩니다.
        </p>
      </div>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="http://media.example.com/uploads/"
        disabled={loading}
        className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-100"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !dirty || loading}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {dirty && !loading && (
          <span className="text-xs text-amber-700">변경사항이 있습니다.</span>
        )}
        {msg && (
          <span
            className={`text-xs ${
              msg.type === "ok" ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
