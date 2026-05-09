"use client";

import { useEffect, useState } from "react";

/**
 * 내계집회(실시간 예배) 설정 — /admin/settings 의 "기타" 탭에 임베드.
 * 헤더 버튼 표시 여부 + 송출 URL + YouTube API 키 (시청자 수 조회용).
 */
export default function LiveWorshipSetting() {
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState(""); // 입력값 (저장 시에만 서버로 전송)
  const [apiKeySet, setApiKeySet] = useState(false); // 서버에 키가 저장돼 있는지
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
        setApiKeySet(!!d?.youtubeApiKeySet);
        setInitial({ enabled: en, url: u });
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        enabled,
        url: url.trim(),
      };
      // 입력했을 때만 서버에 키 전송
      if (apiKey !== "") body.youtubeApiKey = apiKey.trim();
      const res = await fetch("/api/settings/live-worship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data.error || "저장 실패" });
      } else {
        const en = !!data.enabled;
        const u = data.url || "";
        setEnabled(en);
        setUrl(u);
        setApiKeySet(!!data.youtubeApiKeySet);
        setInitial({ enabled: en, url: u });
        setApiKey(""); // 저장 후 입력 필드 비움 (보안)
        setMsg({ type: "ok", text: "저장되었습니다." });
        setTimeout(() => setMsg(null), 3000);
      }
    } catch {
      setMsg({ type: "err", text: "네트워크 오류" });
    } finally {
      setSaving(false);
    }
  }

  async function clearApiKey() {
    if (!confirm("YouTube API 키를 삭제할까요? 시청자 수 조회가 비활성됩니다.")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/live-worship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeApiKey: "" }),
      });
      if (res.ok) {
        setApiKeySet(false);
        setApiKey("");
        setMsg({ type: "ok", text: "API 키 삭제됨" });
      }
    } finally {
      setSaving(false);
    }
  }

  const dirty = enabled !== initial.enabled || url.trim() !== initial.url || apiKey !== "";

  return (
    <div className="bg-white rounded-lg border-2 border-red-200 p-5 space-y-3">
      <div>
        <p className="text-xs text-gray-500">
          헤더의 빨간 <strong className="text-red-600">[내계집회]</strong> 버튼 표시 여부 + 송출 URL +
          YouTube 동시 시청자 조회용 API 키 설정. URL 은 자주 바뀌므로 매번 갱신.
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
      </div>

      <div className="border-t pt-3">
        <label className="block text-xs text-gray-500 mb-1">
          YouTube Data API v3 키 {apiKeySet && <span className="text-emerald-700">(현재 저장됨 ✓)</span>}
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={apiKeySet ? "변경하려면 새 키 입력 (비우면 유지)" : "AIza..."}
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm font-mono border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:bg-gray-100"
          />
          {apiKeySet && (
            <button
              type="button"
              onClick={clearApiKey}
              disabled={saving}
              className="px-3 py-2 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
            >
              삭제
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
          Google Cloud Console → API & Services → Credentials → API key. <br />
          YouTube Data API v3 활성화 필요. 무료 quota 일 10,000 units (videos.list = 1 unit/호출).
          설정 후 30초 캐시로 폴링 — 일 ~2,880 호출 사용.
        </p>
      </div>

      <div className="flex items-center gap-3 border-t pt-3">
        <button
          onClick={save}
          disabled={saving || !dirty || loading}
          className="px-4 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {dirty && !loading && <span className="text-xs text-amber-700">변경사항이 있습니다.</span>}
        {msg && (
          <span className={`text-xs ${msg.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
