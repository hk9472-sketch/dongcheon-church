"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface ActiveItem {
  sessionId: string;
  userId: number | null;
  userName: string | null;
  lastPingAt: number;
}

interface ActiveData {
  counts: { total: number; member: number; guest: number };
  list: ActiveItem[];
}

interface Position { left: number; top: number; }

const POLL_MS = 5000;
const COLLAPSE_KEY = "dc_active_widget_collapsed";
const POSITION_KEY = "dc_active_widget_pos";
const WIDGET_WIDTH = 240;

function clampPosition(p: Position): Position {
  if (typeof window === "undefined") return p;
  const maxLeft = Math.max(0, window.innerWidth - WIDGET_WIDTH);
  const maxTop = Math.max(0, window.innerHeight - 100);
  return {
    left: Math.min(Math.max(0, p.left), maxLeft),
    top: Math.min(Math.max(0, p.top), maxTop),
  };
}

function getInitialPosition(): Position {
  if (typeof window === "undefined") return { left: 0, top: 120 };
  try {
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) {
      const p = JSON.parse(saved);
      if (typeof p?.left === "number" && typeof p?.top === "number") {
        return clampPosition(p);
      }
    }
  } catch {}
  // 기본 = 우상단
  return clampPosition({ left: window.innerWidth - WIDGET_WIDTH - 12, top: 120 });
}

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
  const [position, setPosition] = useState<Position>({ left: 0, top: 120 });
  const positionRef = useRef(position);
  positionRef.current = position;
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

  // 첫 mount 시 viewport 기준 초기 위치 + 권한 확인
  useEffect(() => {
    setPosition(getInitialPosition());
  }, []);

  // 권한 확인 — isAdmin === 1 인 경우만 위젯 표시
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsSuperAdmin(d?.user?.isAdmin === 1))
      .catch(() => setIsSuperAdmin(false));
  }, []);

  // 5초 폴링
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

  // 외부(푸터 "현재" 클릭) 에서 펼치도록 요청
  useEffect(() => {
    const onOpen = () => {
      setCollapsed(false);
      try {
        localStorage.setItem(COLLAPSE_KEY, "0");
      } catch {}
    };
    window.addEventListener("dc:open-active-widget", onOpen);
    return () => window.removeEventListener("dc:open-active-widget", onOpen);
  }, []);

  // 드래그 — mousemove / mouseup 전역 listen. 한 번만 register.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPosition(
        clampPosition({
          left: e.clientX - dragRef.current.offsetX,
          top: e.clientY - dragRef.current.offsetY,
        }),
      );
    };
    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        try {
          localStorage.setItem(POSITION_KEY, JSON.stringify(positionRef.current));
        } catch {}
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // viewport 리사이즈 시 위치 재 clamp
  useEffect(() => {
    const onResize = () => setPosition((p) => clampPosition(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (isSuperAdmin !== true) return null;

  // ✕ 클릭 = 완전 종료 (collapsed=true → return null).
  // 다시 활성화는 푸터 "현재" 클릭 (dc:open-active-widget 이벤트) 만.
  const closeWidget = () => {
    setCollapsed(true);
    try {
      localStorage.setItem(COLLAPSE_KEY, "1");
    } catch {}
  };

  const onDragStart = (e: React.MouseEvent<HTMLElement>) => {
    dragRef.current = {
      offsetX: e.clientX - positionRef.current.left,
      offsetY: e.clientY - positionRef.current.top,
    };
    e.preventDefault();
  };

  const counts = data?.counts ?? { total: 0, member: 0, guest: 0 };
  const list = data?.list ?? [];
  const members = list.filter((r) => r.userId);

  const baseStyle = { left: position.left, top: position.top };

  // 완전 종료 상태 — 위젯 렌더링 자체 안 함. 푸터 "현재" 클릭으로만 재활성.
  if (collapsed) return null;

  return (
    <div
      className="fixed z-40 w-60 max-h-[70vh] flex flex-col bg-white border border-gray-300 rounded-lg shadow-lg select-none"
      style={baseStyle}
    >
      {/* 헤더 — 드래그 핸들 */}
      <div
        onMouseDown={onDragStart}
        className="flex items-center justify-between px-3 py-2 bg-indigo-600 text-white rounded-t-lg cursor-move"
        title="드래그로 이동"
      >
        <div className="text-xs font-bold flex items-center gap-1.5">
          <span>👥</span>
          <span>현재 접속 {counts.total}명</span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); closeWidget(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-indigo-700 text-xs cursor-pointer"
          title="닫기 — 푸터 '현재' 클릭으로 다시 열기"
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
              <li key={r.sessionId} className="px-3 py-1.5 hover:bg-gray-50 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <strong className="text-gray-800 truncate" title={r.userName || ""}>
                  {r.userName || `회원#${r.userId}`}
                </strong>
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

      <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-400 rounded-b-lg flex items-center justify-between">
        <span>5초 갱신 · 60초 무응답 제외</span>
        <Link
          href="/admin/visit-logs?recent=15"
          className="text-indigo-600 hover:text-indigo-800 hover:underline"
        >
          전체보기 →
        </Link>
      </div>
    </div>
  );
}
