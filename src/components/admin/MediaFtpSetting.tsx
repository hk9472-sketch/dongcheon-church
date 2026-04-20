"use client";

import { useEffect, useState } from "react";

/**
 * 미디어 FTP 서버 설정 — /admin/settings 페이지에 임베드.
 * 설정되면 /api/board/media-upload 가 로컬 저장 대신 FTP 로 업로드하고
 * media_base_url 과 조합한 공개 URL 을 반환한다.
 * 설정 해제 시 로컬 저장 모드로 복귀.
 */
export default function MediaFtpSetting() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("21");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [remoteRoot, setRemoteRoot] = useState("/");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/media-ftp");
      if (res.ok) {
        const d = await res.json();
        setHost(d.host || "");
        setPort(d.port || "21");
        setUser(d.user || "");
        setHasPassword(!!d.hasPassword);
        setRemoteRoot(d.remoteRoot || "/");
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/media-ftp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, user, password, remoteRoot }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data.error || "저장 실패" });
      } else {
        setPassword("");
        await load();
        setMsg({ type: "ok", text: "저장되었습니다." });
        setTimeout(() => setMsg(null), 3000);
      }
    } catch {
      setMsg({ type: "err", text: "네트워크 오류" });
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    if (!confirm("FTP 설정을 모두 삭제합니다. 이후 미디어 업로드는 로컬에 저장됩니다. 계속할까요?")) return;
    setSaving(true);
    try {
      await fetch("/api/settings/media-ftp", { method: "DELETE" });
      setHost(""); setPort("21"); setUser(""); setPassword(""); setHasPassword(false); setRemoteRoot("/");
      setMsg({ type: "ok", text: "삭제되었습니다." });
    } finally {
      setSaving(false);
    }
  }

  const configured = !!host && !!user && (hasPassword || !!password);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
      <div>
        <h3 className="text-base font-bold text-gray-800">미디어 FTP 서버 (선택)</h3>
        <p className="text-xs text-gray-500 mt-1">
          설정하면 동영상/음성 업로드가 로컬 디스크 대신 외부 FTP 서버로 전송되고, 사용자는 외부
          공개 URL 로 재생합니다. 로컬 서버 디스크·대역폭 절약에 유리.
          <br />
          <strong>필수 조건</strong>: 위의 "미디어 기본 URL" 이 FTP 업로드 파일이 웹에서 보이는
          공개 경로로 설정돼 있어야 합니다.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-500">호스트</span>
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="soklee88.ipdisk.co.kr"
            disabled={loading}
            className="w-full mt-0.5 px-3 py-2 text-sm border border-gray-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-100"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-500">포트</span>
          <input
            type="text"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="21"
            disabled={loading}
            className="w-full mt-0.5 px-3 py-2 text-sm border border-gray-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-100"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-500">사용자</span>
          <input
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="admin"
            disabled={loading}
            className="w-full mt-0.5 px-3 py-2 text-sm border border-gray-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-100"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-500">
            비밀번호 {hasPassword && <span className="text-emerald-600 text-[10px]">(저장됨 — 비우면 유지)</span>}
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={hasPassword ? "••••••" : "비밀번호"}
            disabled={loading}
            className="w-full mt-0.5 px-3 py-2 text-sm border border-gray-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-100"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-gray-500">원격 루트 경로</span>
          <input
            type="text"
            value={remoteRoot}
            onChange={(e) => setRemoteRoot(e.target.value)}
            placeholder="/uploads"
            disabled={loading}
            className="w-full mt-0.5 px-3 py-2 text-sm border border-gray-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-100"
          />
          <span className="text-[10px] text-gray-400">
            업로드 경로 = 원격 루트 + /{`{boardSlug}`}/{`{YYYYMMDD}`}/{`{파일명}`}
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving || loading}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {configured && (
          <button
            onClick={clearAll}
            disabled={saving || loading}
            className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
          >
            설정 삭제 (로컬 저장으로 복귀)
          </button>
        )}
        {msg && (
          <span className={`text-xs ${msg.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
