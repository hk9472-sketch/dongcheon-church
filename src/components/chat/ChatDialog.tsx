"use client";

import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  id: number;
  fromUserId: number | null;
  fromGuest: string | null;
  fromName: string;
  toUserId: number | null;
  toGuest: string | null;
  content: string;
  readAt: string | null;
  createdAt: string;
}

export interface ChatPeer {
  kind: "user" | "guest";
  id: string;        // user id (숫자 문자열) 또는 guest sessionId
  displayName: string;
}

export interface SelfIdentity {
  userId: number | null;
  guestId: string | null; // 비회원이면 자기 sessionId
}

interface Props {
  peer: ChatPeer;
  self: SelfIdentity;
  onClose: () => void;
}

const POLL_MS = 3000;

function fmtTime(s: string): string {
  const d = new Date(s);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function isFromMe(m: ChatMessage, self: SelfIdentity): boolean {
  if (self.userId && m.fromUserId === self.userId) return true;
  if (self.guestId && m.fromGuest === self.guestId) return true;
  return false;
}

export default function ChatDialog({ peer, self, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const withKey = peer.kind === "user" ? `u:${peer.id}` : `g:${peer.id}`;

  const guestParam = self.guestId ? `&guestId=${encodeURIComponent(self.guestId)}` : "";

  // 대화 이력 폴링
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`/api/chat?with=${withKey}${guestParam}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d?.messages) setMessages(d.messages);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [withKey, guestParam]);

  // 메시지 도착하면 읽음 처리
  useEffect(() => {
    if (messages.length === 0) return;
    fetch("/api/chat/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ with: withKey, guestId: self.guestId }),
    }).catch(() => {});
  }, [messages.length, withKey, self.guestId]);

  // 새 메시지 오면 스크롤 맨 아래로
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(peer.kind === "user"
            ? { toUserId: parseInt(peer.id, 10) }
            : { toGuest: peer.id }),
          content: text,
          fromGuest: self.guestId || undefined,
          fromName: self.userId ? undefined : "방문자",
        }),
      });
      if (res.ok) {
        setInput("");
        // 즉시 한 번 갱신
        fetch(`/api/chat?with=${withKey}${guestParam}`)
          .then((r) => r.json())
          .then((d) => d?.messages && setMessages(d.messages))
          .catch(() => {});
      } else {
        const err = await res.json();
        alert(err.message || "발송 실패");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-h-[70vh] flex flex-col bg-white border border-gray-300 rounded-lg shadow-xl">
      <div className="flex items-center justify-between px-3 py-2 bg-indigo-600 text-white rounded-t-lg">
        <div className="text-sm font-bold truncate" title={peer.displayName}>
          💬 {peer.displayName}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-indigo-700 text-xs"
          title="대화창 닫기"
        >
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-xs py-8">메시지가 없습니다.</div>
        )}
        {messages.map((m) => {
          const me = isFromMe(m, self);
          return (
            <div key={m.id} className={`flex ${me ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-lg px-3 py-1.5 text-xs whitespace-pre-wrap break-words ${
                  me ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-800"
                }`}
              >
                {!me && (
                  <div className="text-[10px] font-semibold mb-0.5 opacity-80">{m.fromName}</div>
                )}
                <div>{m.content}</div>
                <div className={`text-[9px] mt-0.5 ${me ? "text-indigo-200" : "text-gray-400"}`}>
                  {fmtTime(m.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={submit} className="border-t border-gray-200 p-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요..."
          className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          전송
        </button>
      </form>
    </div>
  );
}
