"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

interface ActiveItem {
  sessionId: string;
  userId: number | null;
  userName: string | null;
  displayName: string;
  isGuest: boolean;
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
const DOCK_KEY = "dc_active_widget_docked";
const WIDGET_WIDTH = 240;
const DOCK_TOP = 72;   // 우상단 고정 시 top(px) — 사이트 헤더 바로 아래
const DOCK_RIGHT = 12; // 우상단 고정 시 right(px)

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
  // 로그인 회원이면 위젯 표시. 관리자(isAdmin <= 2) 여부는 전체공지/선별발송 버튼 노출용.
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [data, setData] = useState<ActiveData | null>(null);
  // 기본값 = 닫힘. 자동으로 안 뜨고, 푸터 "현재" 클릭으로만 열림.
  // localStorage 에 명시적 "0" 이 있으면(=사용자가 이전에 열어둔 상태) 그대로 유지,
  // 그 외엔 모두 닫힘.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(COLLAPSE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  // 표시 모드: docked(우상단 고정) ↔ floating(드래그 가능한 팝업). 기본 = 고정.
  const [docked, setDocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(DOCK_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [position, setPosition] = useState<Position>({ left: 0, top: 120 });
  const positionRef = useRef(position);
  positionRef.current = position;
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

  // 홈 우상단 도크 슬롯(#dc-presence-dock). 홈에서만 존재 → 라우트 변경 시 재탐색.
  // 고정 모드일 때 이 슬롯이 있으면 위젯을 그 안에 in-flow 로 끼워 넣어 페이지와 함께 스크롤시킨다.
  const pathname = usePathname();
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);

  // 첫 mount 시 viewport 기준 초기 위치 + 권한 확인
  useEffect(() => {
    setPosition(getInitialPosition());
  }, []);

  // 로그인 여부 + 관리자 여부 확인
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setIsLoggedIn(!!d?.user);
        setIsAdmin(d?.user && d.user.isAdmin <= 2);
      })
      .catch(() => setIsLoggedIn(false));
  }, []);

  // 5초 폴링 — 로그인 회원만 호출
  useEffect(() => {
    if (!isLoggedIn) return;
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
  }, [isLoggedIn]);

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

  // 홈 도크 슬롯 재탐색. 도크는 본문 바깥 우측 여백(gutter)에 띄우므로, 그 폭이 확보되는
  // 충분히 넓은 화면(≥1920px)에서만 도킹한다. 그보다 좁으면 gutter 가 부족해 화면을 벗어나므로
  // null → 팝업(fixed) 으로 폴백. 라우트 변경 + 브레이크포인트 교차 시 재평가.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1920px)");
    const find = () =>
      setDockEl(mq.matches ? document.getElementById("dc-presence-dock") : null);
    find();
    mq.addEventListener("change", find);
    return () => mq.removeEventListener("change", find);
  }, [pathname]);

  if (isLoggedIn !== true) return null;

  // ✕ 클릭 = 완전 종료 (collapsed=true → return null).
  // 다시 활성화는 푸터 "현재" 클릭 (dc:open-active-widget 이벤트) 만.
  const closeWidget = () => {
    setCollapsed(true);
    try {
      localStorage.setItem(COLLAPSE_KEY, "1");
    } catch {}
  };

  const onDragStart = (e: React.MouseEvent<HTMLElement>) => {
    if (docked) return; // 고정 모드에선 드래그 비활성
    dragRef.current = {
      offsetX: e.clientX - positionRef.current.left,
      offsetY: e.clientY - positionRef.current.top,
    };
    e.preventDefault();
  };

  // 고정 ↔ 팝업 토글. 고정→팝업 전환 시 현재 고정 위치에서 시작해 화면 점프 방지.
  const toggleDock = () => {
    setDocked((prev) => {
      const next = !prev;
      try { localStorage.setItem(DOCK_KEY, next ? "1" : "0"); } catch {}
      if (!next) {
        setPosition(
          clampPosition({ left: window.innerWidth - WIDGET_WIDTH - DOCK_RIGHT, top: DOCK_TOP }),
        );
      }
      return next;
    });
  };

  const counts = data?.counts ?? { total: 0, member: 0, guest: 0 };
  const list = data?.list ?? [];
  const members = list.filter((r) => r.userId);
  const guests = list.filter((r) => r.isGuest);

  // 대화창 열기 — ChatContainer 가 dc:chat-open 이벤트 listen
  const openChat = (r: ActiveItem) => {
    const peer = r.userId
      ? { kind: "user" as const, id: String(r.userId), displayName: r.displayName }
      : { kind: "guest" as const, id: r.sessionId, displayName: r.displayName };
    window.dispatchEvent(new CustomEvent("dc:chat-open", { detail: { peer } }));
  };
  const openBroadcast = () => {
    window.dispatchEvent(
      new CustomEvent("dc:chat-open", {
        detail: { peer: { kind: "broadcast", id: "", displayName: "📢 전체 공지" } },
      }),
    );
  };
  const openBulk = () => {
    window.dispatchEvent(new CustomEvent("dc:chat-bulk-open"));
  };

  // 완전 종료 상태 — 위젯 렌더링 자체 안 함. 푸터 "현재" 클릭으로만 재활성.
  if (collapsed) return null;

  const inner = (
    <>
      {/* 헤더 — 드래그 핸들 */}
      <div
        onMouseDown={onDragStart}
        className={`flex items-center justify-between px-3 py-2 bg-indigo-600 text-white rounded-t-lg ${docked ? "cursor-default" : "cursor-move"}`}
        title={docked ? "우상단 고정됨 — 📌 로 팝업 전환" : "드래그로 이동"}
      >
        <div className="text-xs font-bold flex items-center gap-1.5">
          <span>👥</span>
          <span>현재 접속 {counts.total}명</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleDock(); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-indigo-700 text-xs cursor-pointer"
            title={docked ? "팝업(드래그)으로 전환" : "우상단에 고정"}
          >
            {docked ? "📌" : "📍"}
          </button>
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
      </div>

      <div className="overflow-y-auto flex-1 text-xs">
        {members.length === 0 && guests.length === 0 && (
          <div className="px-3 py-6 text-center text-gray-400">접속자 없음</div>
        )}
        {members.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {members.map((r) => (
              <li key={r.sessionId} className="hover:bg-gray-50">
                <button
                  type="button"
                  onClick={() => openChat(r)}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-1.5"
                  title="대화창 열기"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <strong className="text-gray-800 truncate flex-1">
                    {r.displayName}
                  </strong>
                  <span className="text-[10px] text-gray-300 group-hover:text-indigo-500">💬</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {guests.length > 0 && (
          <ul className="divide-y divide-gray-100 border-t border-gray-200 bg-gray-50/50">
            {guests.map((r) => (
              <li key={r.sessionId} className="hover:bg-gray-100">
                <button
                  type="button"
                  onClick={() => openChat(r)}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-1.5 text-gray-600"
                  title="대화창 열기"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                  <span className="truncate flex-1">{r.displayName}</span>
                  <span className="text-[10px] text-gray-300">💬</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-400 rounded-b-lg space-y-1">
        {isAdmin && (
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={openBroadcast}
              className="px-2 py-1 bg-rose-50 border border-rose-200 text-rose-700 rounded hover:bg-rose-100 transition-colors text-[11px] font-semibold"
            >
              📢 전체 공지
            </button>
            <button
              type="button"
              onClick={openBulk}
              className="px-2 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded hover:bg-indigo-100 transition-colors text-[11px] font-semibold"
            >
              📋 선별 발송
            </button>
          </div>
        )}
        <div className="text-[10px] text-gray-400">5초 갱신 · 60초 무응답 제외 · 클릭으로 1:1 대화</div>
      </div>
    </>
  );

  // 고정(docked) + 홈 도크 슬롯 존재 → 위젯 영역에 in-flow 로 끼워 페이지와 함께 스크롤.
  // 그 외(팝업이거나 슬롯 없는 페이지) → fixed 오버레이로 화면 같은 위치에 고정.
  const cardCls =
    "max-h-[70vh] flex flex-col bg-white border border-gray-300 rounded-lg shadow-lg select-none";
  if (docked && dockEl) {
    return createPortal(<div className={`w-full ${cardCls}`}>{inner}</div>, dockEl);
  }
  return (
    <div
      className={`fixed z-40 w-60 ${cardCls}`}
      style={docked ? { right: DOCK_RIGHT, top: DOCK_TOP } : { left: position.left, top: position.top }}
    >
      {inner}
    </div>
  );
}
