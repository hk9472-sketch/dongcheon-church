"use client";

import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  id: number;
  fromUserId: number | null;
  fromGuest: string | null;
  fromName: string;
  toUserId: number | null;
  toGuest: string | null;
  toBroadcast?: boolean;
  content: string;
  attachPath: string | null;
  attachName: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ChatPeer {
  kind: "user" | "guest" | "broadcast";
  id: string;        // user id (숫자 문자열) 또는 guest sessionId / broadcast 는 ""
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
  const [attach, setAttach] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const withKey =
    peer.kind === "user" ? `u:${peer.id}` :
    peer.kind === "guest" ? `g:${peer.id}` : "b:";

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
    if (!text && !attach) return;
    setSending(true);
    try {
      const fd = new FormData();
      if (peer.kind === "user") fd.append("toUserId", peer.id);
      else if (peer.kind === "guest") fd.append("toGuest", peer.id);
      else fd.append("toBroadcast", "true");
      fd.append("content", text);
      if (self.guestId) fd.append("fromGuest", self.guestId);
      if (!self.userId) fd.append("fromName", "방문자");
      if (attach) fd.append("attach", attach);

      const res = await fetch("/api/chat", { method: "POST", body: fd });
      if (res.ok) {
        setInput("");
        setAttach(null);
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
                {m.content && <div>{m.content}</div>}
                {m.attachPath && (
                  <a
                    href={`/${m.attachPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 mt-1 text-[10px] underline ${
                      me ? "text-indigo-100" : "text-blue-600"
                    }`}
                    download={m.attachName || undefined}
                    title="다운로드"
                  >
                    📎 {m.attachName || "파일"}
                  </a>
                )}
                <div className={`text-[9px] mt-0.5 ${me ? "text-indigo-200" : "text-gray-400"}`}>
                  {fmtTime(m.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={submit} className="border-t border-gray-200 p-2 space-y-1.5">
        {attach && (
          <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-[11px]">
            <span>📎</span>
            <span className="flex-1 truncate" title={attach.name}>{attach.name}</span>
            <span className="text-gray-500">{(attach.size / 1024).toFixed(0)}KB</span>
            <button
              type="button"
              onClick={() => setAttach(null)}
              className="text-red-500 hover:text-red-700"
              title="제거"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <label
            className="shrink-0 w-7 h-7 flex items-center justify-center border border-gray-300 rounded cursor-pointer hover:bg-gray-50 text-sm"
            title="파일 첨부 (최대 10MB)"
          >
            📎
            <input
              type="file"
              onChange={(e) => setAttach(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={peer.kind === "broadcast" ? "전체 공지를 입력하세요..." : "메시지를 입력하세요..."}
            className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={sending || (!input.trim() && !attach)}
            className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {sending ? "..." : "전송"}
          </button>
        </div>
      </form>
    </div>
  );
}
