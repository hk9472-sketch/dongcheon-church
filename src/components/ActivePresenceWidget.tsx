"use client";

import { useEffect, useState } from "react";

interface ActiveItem {
  sessionId: string;
  userId: number | null;
  userName: string | null;
  ip: string | null;
  path: string | null;
  lastPingAt: number;
}

interface ActiveData {
  counts: { total: number; member: number; guest: number };
  list: ActiveItem[];
}

const POLL_MS = 5000;
const COLLAPSE_KEY = "dc_active_widget_collapsed";

export default function ActivePresenceWidget() {
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [data, setData] = useState<ActiveData | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  // 권한 확인 — isAdmin === 1 인 경우만 위젯 표시
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsSuperAdmin(d?.user?.isAdmin === 1))
      .catch(() => setIsSuperAdmin(false));
  }, []);

  // 5초 폴링 — 권한 없으면 호출 안 함
  useEffect(() => {
    if (!isSuperAdmin) return;
    const load = () => {
      fetch("/api/active")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setData(d);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [isSuperAdmin]);

  if (isSuperAdmin !== true) return null;

  const toggle = () => {
    setCollapsed((p) => {
      const next = !p;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  const counts = data?.counts ?? { total: 0, member: 0, guest: 0 };
  const list = data?.list ?? [];
  const members = list.filter((r) => r.userId);

  // 접힘 상태 — 작은 아이콘만
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="fixed right-3 top-[120px] z-40 w-10 h-10 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 flex items-center justify-center text-xs font-bold"
        title="현재 접속자 보기"
      >
        {counts.total}
      </button>
    );
  }

  return (
    <div className="fixed right-3 top-[120px] z-40 w-60 max-h-[70vh] flex flex-col bg-white border border-gray-300 rounded-lg shadow-lg">
      <div className="flex items-center justify-between px-3 py-2 bg-indigo-600 text-white rounded-t-lg">
        <div className="text-xs font-bold flex items-center gap-1.5">
          <span>👥</span>
          <span>현재 접속 {counts.total}명</span>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-indigo-700 text-xs"
          title="접기"
        >
          ✕
        </button>
      </div>
      <div className="overflow-y-auto flex-1 text-xs">
        {members.length === 0 && counts.guest === 0 && (
          <div className="px-3 py-6 text-center text-gray-400">접속자 없음</div>
        )}
        {members.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {members.map((r) => (
              <li key={r.sessionId} className="px-3 py-1.5 hover:bg-gray-50">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <strong className="text-gray-800 truncate" title={r.userName || ""}>
                    {r.userName || `회원#${r.userId}`}
                  </strong>
                </div>
                <div className="text-[10px] text-gray-500 ml-3 truncate" title={r.path || ""}>
                  {r.path || "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
        {counts.guest > 0 && (
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-gray-600 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            <span>방문자(비회원) <strong>{counts.guest}</strong>명</span>
          </div>
        )}
      </div>
      <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-400 rounded-b-lg">
        5초마다 갱신 · 60초 무응답 시 제외
      </div>
    </div>
  );
}
