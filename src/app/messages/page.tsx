"use client";

import { useEffect, useState } from "react";

interface Thread {
  peerKey: string;
  peerName: string;
  lastContent: string;
  lastAt: string;
  unread: number;
  isBroadcast: boolean;
}

const SESSION_KEY = "dc_active_session_id";

function getGuestId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export default function MessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const gid = getGuestId();
    const q = gid ? `?guestId=${encodeURIComponent(gid)}` : "";
    fetch(`/api/chat/threads${q}`)
      .then((r) => r.json())
      .then((d) => setThreads(d.threads || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openThread = (t: Thread) => {
    const m = t.peerKey.match(/^([ugb]):(.*)$/);
    if (!m) return;
    const peer = {
      kind: m[1] === "u" ? "user" : m[1] === "g" ? "guest" : "broadcast",
      id: m[2],
      displayName: t.peerName,
    };
    window.dispatchEvent(new CustomEvent("dc:chat-open", { detail: { peer } }));
  };

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="inline-block w-1 h-7 bg-indigo-700 rounded-full" />
        <h1 className="text-xl font-bold text-gray-800">메시지함</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading && (
          <div className="p-8 text-center text-gray-400 text-sm">불러오는 중...</div>
        )}
        {!loading && threads.length === 0 && (
          <div className="p-12 text-center text-gray-400 text-sm">
            아직 대화한 사람이 없습니다.
          </div>
        )}
        <ul className="divide-y divide-gray-100">
          {threads.map((t) => (
            <li key={t.peerKey}>
              <button
                type="button"
                onClick={() => openThread(t)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
                  t.isBroadcast ? "bg-amber-50/40" : ""
                }`}
              >
                <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white"
                  style={{
                    background: t.isBroadcast
                      ? "#d97706"
                      : `hsl(${(t.peerName.charCodeAt(0) * 137) % 360}, 60%, 55%)`,
                  }}
                >
                  {t.isBroadcast ? "📢" : t.peerName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <strong className="text-gray-800 truncate">{t.peerName}</strong>
                    {t.unread > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] bg-rose-600 text-white rounded-full">
                        {t.unread}
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-gray-400 shrink-0">
                      {new Date(t.lastAt).toLocaleString("ko-KR", {
                        timeZone: "Asia/Seoul",
                        hour12: false,
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 truncate mt-0.5">
                    {t.lastContent || "(빈 메시지)"}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] text-gray-500">
        대화를 클릭하면 우하단에 대화창이 열립니다.
      </p>
    </div>
  );
}
