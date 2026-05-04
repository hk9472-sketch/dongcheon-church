"use client";

import { useEffect, useState } from "react";

/**
 * 내계집회(실시간 예배) 설정 — /admin/settings 의 "기타" 탭에 임베드.
 * 헤더의 빨간 [내계집회] 버튼 표시 여부 + 송출 URL 관리.
 */
export default function LiveWorshipSetting() {
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [initial, setInitial] = useState({ enabled: false, url: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/live-worship")
      .then((r) => r.json())
      .then((d) => {
        const en = !!d?.enabled;
        const u = d?.url || "";
        setEnabled(en);
        setUrl(u);
        setInitial({ enabled: en, url: u });
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/live-worship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data.error || "저장 실패" });
      } else {
        const en = !!data.enabled;
        const u = data.url || "";
        setEnabled(en);
        setUrl(u);
        setInitial({ enabled: en, url: u });
        setMsg({ type: "ok", text: "저장되었습니다." });
        setTimeout(() => setMsg(null), 3000);
      }
    } catch {
      setMsg({ type: "err", text: "네트워크 오류" });
    } finally {
      setSaving(false);
    }
  }

  const dirty = enabled !== initial.enabled || url.trim() !== initial.url;

  return (
    <div className="bg-white rounded-lg border-2 border-red-200 p-5 space-y-3">
      <div>
        <p className="text-xs text-gray-500">
          헤더의 빨간 <strong className="text-red-600">[내계집회]</strong> 버튼 표시 여부와 송출
          유튜브 URL 을 설정합니다. 보이기로 두면 모든 방문자에게 노출되며,
          버튼을 누르면 <code className="bg-gray-100 px-1 rounded">/live-worship</code> 페이지에서
          영상이 자동 재생됩니다. URL 은 자주 바뀔 수 있으므로 매번 여기서 갱신하세요.
        </p>
      </div>

      <label className="flex items-center gap-2 select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={loading}
          className="w-4 h-4 accent-red-600"
        />
        <span className="text-sm text-gray-700">
          헤더에 <strong className="text-red-600">[내계집회]</strong> 버튼 표시
        </span>
      </label>

      <div>
        <label className="block text-xs text-gray-500 mb-1">유튜브 URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=XXXXXXXXXXX"
          disabled={loading}
          className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:bg-gray-100"
        />
        <p className="text-[11px] text-gray-400 mt-1">
          watch / youtu.be / live / embed 어떤 형식이든 video ID 를 자동 추출합니다.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !dirty || loading}
          className="px-4 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {dirty && !loading && (
          <span className="text-xs text-amber-700">변경사항이 있습니다.</span>
        )}
        {msg && (
          <span
            className={`text-xs ${msg.type === "ok" ? "text-emerald-700" : "text-red-600"}`}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
