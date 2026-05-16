"use client";

import { useEffect, useRef, useState } from "react";
import ChatDialog, { ChatPeer, SelfIdentity } from "./ChatDialog";

interface UnreadMsg {
  id: number;
  fromUserId: number | null;
  fromGuest: string | null;
  fromName: string;
  content: string;
  createdAt: string;
}

const SESSION_KEY = "dc_active_session_id";
const POPUP_DISMISSED_KEY = "dc_chat_popup_dismissed";  // id 목록 (JSON array)

function getGuestId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function getDismissed(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(POPUP_DISMISSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch {}
  return new Set();
}

function addDismissed(ids: number[]) {
  try {
    const cur = getDismissed();
    for (const id of ids) cur.add(id);
    // 최근 200개만 유지
    const arr = Array.from(cur).slice(-200);
    localStorage.setItem(POPUP_DISMISSED_KEY, JSON.stringify(arr));
  } catch {}
}

/**
 * 메시지 수신 폴링 + 미열람 팝업 + 대화창 관리.
 * 페이지 layout 에 마운트되어 어디서든 동작.
 *
 * window event:
 *   - dc:chat-open  detail: { peer: ChatPeer }   → 대화창 열기
 */
export default function ChatContainer() {
  const [self, setSelf] = useState<SelfIdentity | null>(null);
  const [peer, setPeer] = useState<ChatPeer | null>(null);
  const [unread, setUnread] = useState<UnreadMsg[]>([]);
  const dismissedRef = useRef<Set<number>>(new Set());

  // 자기 정체성 — 로그인 사용자면 userId, 아니면 guestId
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d?.user?.id) {
          setSelf({ userId: d.user.id, guestId: null });
        } else {
          setSelf({ userId: null, guestId: getGuestId() });
        }
      })
      .catch(() => setSelf({ userId: null, guestId: getGuestId() }));
  }, []);

  // 수신 폴링
  useEffect(() => {
    if (!self) return;
    if (!self.userId && !self.guestId) return;

    const load = () => {
      const q = self.guestId ? `?guestId=${encodeURIComponent(self.guestId)}` : "";
      fetch(`/api/chat${q}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.unread) setUnread(d.unread);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [self]);

  // 첫 mount 시 dismissed 목록 로드
  useEffect(() => {
    dismissedRef.current = getDismissed();
  }, []);

  // 대화창 open 이벤트 listen
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { peer: ChatPeer } | undefined;
      if (detail?.peer) setPeer(detail.peer);
    };
    window.addEventListener("dc:chat-open", onOpen as EventListener);
    return () => window.removeEventListener("dc:chat-open", onOpen as EventListener);
  }, []);

  const openFromUnread = (m: UnreadMsg) => {
    const p: ChatPeer = m.fromUserId
      ? { kind: "user", id: String(m.fromUserId), displayName: m.fromName }
      : { kind: "guest", id: m.fromGuest || "", displayName: m.fromName };
    setPeer(p);
    // 팝업 dismiss
    const idsFromPeer = unread
      .filter((u) =>
        m.fromUserId
          ? u.fromUserId === m.fromUserId
          : u.fromGuest === m.fromGuest,
      )
      .map((u) => u.id);
    addDismissed(idsFromPeer);
    dismissedRef.current = getDismissed();
    setUnread((cur) => cur.filter((u) => !idsFromPeer.includes(u.id)));
  };

  const dismissAll = () => {
    addDismissed(unread.map((u) => u.id));
    dismissedRef.current = getDismissed();
    setUnread([]);
  };

  // 화면에 표시할 팝업 = unread 중 dismissed 아닌 것
  const visiblePopups = unread.filter((u) => !dismissedRef.current.has(u.id));

  return (
    <>
      {/* 수신 팝업 — 좌측 하단 stack */}
      {visiblePopups.length > 0 && (
        <div className="fixed bottom-4 left-4 z-50 w-72 space-y-2">
          <div className="flex items-center justify-between bg-rose-600 text-white px-3 py-1.5 rounded-t-lg text-xs font-bold">
            <span>📩 새 메시지 {visiblePopups.length}건</span>
            <button
              type="button"
              onClick={dismissAll}
              className="hover:bg-rose-700 px-1 rounded"
              title="모두 닫기"
            >
              ✕
            </button>
          </div>
          <div className="bg-white border border-gray-300 rounded-b-lg shadow-xl max-h-[40vh] overflow-y-auto">
            {visiblePopups.slice(0, 8).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => openFromUnread(m)}
                className="w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-rose-50 transition-colors"
              >
                <div className="text-xs font-bold text-gray-800 truncate">
                  {m.fromName}
                </div>
                <div className="text-[11px] text-gray-600 truncate">{m.content}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(m.createdAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                    hour12: false,
                  })}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 대화창 */}
      {peer && self && (
        <ChatDialog
          peer={peer}
          self={self}
          onClose={() => setPeer(null)}
        />
      )}
    </>
  );
}
