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
  id: string;
  displayName: string;
}

export interface SelfIdentity {
  userId: number | null;
  guestId: string | null;
}

interface Props {
  peer: ChatPeer;
  self: SelfIdentity;
  onClose: () => void;
}

const POLL_MS = 3000;
const POS_KEY = "dc_chat_dialog_pos";
const SIZE_KEY = "dc_chat_dialog_size";

interface Pos { left: number; top: number; }
interface Size { w: number; h: number; }

function fmtTime(s: string): string {
  const d = new Date(s);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function isFromMe(m: ChatMessage, self: SelfIdentity): boolean {
  if (self.userId && m.fromUserId === self.userId) return true;
  if (self.guestId && m.fromGuest === self.guestId) return true;
  return false;
}
function clampPos(p: Pos, s: Size): Pos {
  if (typeof window === "undefined") return p;
  const maxL = Math.max(0, window.innerWidth - s.w);
  const maxT = Math.max(0, window.innerHeight - 80);
  return {
    left: Math.min(Math.max(0, p.left), maxL),
    top: Math.min(Math.max(0, p.top), maxT),
  };
}
function loadInit(): { pos: Pos; size: Size } {
  const defSize: Size = { w: 320, h: 480 };
  const defPos: Pos = typeof window === "undefined"
    ? { left: 0, top: 0 }
    : { left: window.innerWidth - defSize.w - 16, top: window.innerHeight - defSize.h - 16 };
  if (typeof window === "undefined") return { pos: defPos, size: defSize };
  try {
    const sRaw = localStorage.getItem(SIZE_KEY);
    const pRaw = localStorage.getItem(POS_KEY);
    const size = sRaw ? JSON.parse(sRaw) : defSize;
    const pos = pRaw ? JSON.parse(pRaw) : defPos;
    return { pos: clampPos(pos, size), size };
  } catch {
    return { pos: defPos, size: defSize };
  }
}

export default function ChatDialog({ peer, self, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attach, setAttach] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 위치 / 크기
  const [pos, setPos] = useState<Pos>({ left: 0, top: 0 });
  const [size, setSize] = useState<Size>({ w: 320, h: 480 });
  const posRef = useRef(pos);
  posRef.current = pos;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  useEffect(() => {
    const init = loadInit();
    setPos(init.pos);
    setSize(init.size);
  }, []);

  const withKey =
    peer.kind === "user" ? `u:${peer.id}` :
    peer.kind === "guest" ? `g:${peer.id}` : "b:";
  const guestParam = self.guestId ? `&guestId=${encodeURIComponent(self.guestId)}` : "";

  // 대화 이력 폴링
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const url = search
        ? `/api/chat/search?q=${encodeURIComponent(search)}${guestParam}`
        : `/api/chat?with=${withKey}${guestParam}`;
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d?.messages) setMessages(d.messages);
        })
        .catch(() => {});
    };
    load();
    if (search) return; // 검색 모드는 폴링 X
    const t = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [withKey, guestParam, search]);

  // 메시지 도착 시 읽음 처리 (검색 모드 X)
  useEffect(() => {
    if (search || messages.length === 0 || peer.kind === "broadcast") return;
    fetch("/api/chat/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ with: withKey, guestId: self.guestId }),
    }).catch(() => {});
  }, [messages.length, withKey, self.guestId, search, peer.kind]);

  // 스크롤 맨 아래
  useEffect(() => {
    if (scrollRef.current && !search) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, search]);

  // 드래그
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        setPos(clampPos(
          { left: e.clientX - dragRef.current.offsetX, top: e.clientY - dragRef.current.offsetY },
          sizeRef.current,
        ));
      }
      if (resizeRef.current) {
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;
        const next = {
          w: Math.max(260, Math.min(720, resizeRef.current.startW + dx)),
          h: Math.max(280, Math.min(800, resizeRef.current.startH + dy)),
        };
        setSize(next);
      }
    };
    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)); } catch {}
      }
      if (resizeRef.current) {
        resizeRef.current = null;
        try { localStorage.setItem(SIZE_KEY, JSON.stringify(sizeRef.current)); } catch {}
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onDragStart = (e: React.MouseEvent<HTMLElement>) => {
    dragRef.current = {
      offsetX: e.clientX - posRef.current.left,
      offsetY: e.clientY - posRef.current.top,
    };
    e.preventDefault();
  };
  const onResizeStart = (e: React.MouseEvent<HTMLElement>) => {
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: sizeRef.current.w,
      startH: sizeRef.current.h,
    };
    e.preventDefault();
    e.stopPropagation();
  };

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

  const deleteMsg = async (id: number) => {
    if (!confirm("이 메시지를 삭제하시겠습니까?")) return;
    const q = self.guestId ? `?guestId=${encodeURIComponent(self.guestId)}` : "";
    const res = await fetch(`/api/chat/${id}${q}`, { method: "DELETE" });
    if (res.ok) {
      setMessages((cur) => cur.filter((m) => m.id !== id));
    } else {
      const err = await res.json();
      alert(err.message || "삭제 실패");
    }
  };

  const reportMsg = async (id: number) => {
    const note = prompt("신고 사유 (선택)");
    if (note === null) return;
    const res = await fetch(`/api/chat/${id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (res.ok) {
      alert("신고가 접수되었습니다.");
    } else {
      const err = await res.json();
      alert(err.message || "신고 실패");
    }
  };

  return (
    <div
      className="fixed z-50 flex flex-col bg-white border border-gray-300 rounded-lg shadow-xl select-none"
      style={{ left: pos.left, top: pos.top, width: size.w, height: size.h }}
    >
      {/* 헤더 — 드래그 핸들 */}
      <div
        onMouseDown={onDragStart}
        className="flex items-center justify-between px-3 py-2 bg-indigo-600 text-white rounded-t-lg cursor-move"
      >
        <div className="text-sm font-bold truncate flex items-center gap-1.5" title={peer.displayName}>
          <span>💬</span>
          <span className="truncate">{peer.displayName}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowSearch((s) => !s); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-indigo-700 text-xs"
            title="검색"
          >
            🔍
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-indigo-700 text-xs"
            title="대화창 닫기"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 검색 입력 */}
      {showSearch && (
        <div className="px-2 py-1 bg-gray-50 border-b border-gray-200">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="메시지 검색 (2자 이상)"
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-indigo-500"
            autoFocus
          />
          {search && (
            <div className="text-[10px] text-gray-500 mt-0.5">
              {messages.length} 건 — 검색 결과 표시 중 ·
              <button
                type="button"
                onClick={() => setSearch("")}
                className="ml-1 text-indigo-600 hover:underline"
              >
                대화로 돌아가기
              </button>
            </div>
          )}
        </div>
      )}

      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-xs py-8">
            {search ? "검색 결과 없음" : "메시지가 없습니다."}
          </div>
        )}
        {messages.map((m) => {
          const me = isFromMe(m, self);
          return (
            <div key={m.id} className={`flex group ${me ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-lg px-3 py-1.5 text-xs whitespace-pre-wrap break-words relative ${
                  me ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-800"
                }`}
              >
                {!me && (
                  <div className="text-[10px] font-semibold mb-0.5 opacity-80">{m.fromName}</div>
                )}
                {m.content && <div>{m.content}</div>}
                {m.attachPath && (() => {
                  const isImage = /\.(jpe?g|png|gif|webp)$/i.test(m.attachPath);
                  if (isImage) {
                    return (
                      <a
                        href={`/${m.attachPath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-1"
                        title="클릭하면 새 창에서 원본"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/${m.attachPath}`}
                          alt={m.attachName || "이미지"}
                          className="max-w-full max-h-40 rounded border border-gray-200 bg-white"
                          loading="lazy"
                        />
                      </a>
                    );
                  }
                  return (
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
                  );
                })()}
                <div className={`text-[9px] mt-0.5 ${me ? "text-indigo-200" : "text-gray-400"}`}>
                  {fmtTime(m.createdAt)}
                </div>

                {/* hover 액션 — 본인 발신은 삭제, 타인 발신은 신고 */}
                <div className={`absolute ${me ? "left-1 -translate-x-full" : "right-1 translate-x-full"} top-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5`}>
                  {me ? (
                    <button
                      type="button"
                      onClick={() => deleteMsg(m.id)}
                      className="w-5 h-5 flex items-center justify-center bg-white border border-gray-300 rounded text-[10px] hover:bg-red-50 hover:border-red-300"
                      title="삭제"
                    >
                      🗑
                    </button>
                  ) : self.userId ? (
                    <button
                      type="button"
                      onClick={() => reportMsg(m.id)}
                      className="w-5 h-5 flex items-center justify-center bg-white border border-gray-300 rounded text-[10px] hover:bg-orange-50 hover:border-orange-300"
                      title="신고"
                    >
                      🚩
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 입력 폼 */}
      {!search && (
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
      )}

      {/* 리사이즈 핸들 — 우하단 */}
      <div
        onMouseDown={onResizeStart}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        style={{
          background: "linear-gradient(135deg, transparent 50%, #9ca3af 50%, #9ca3af 100%)",
        }}
        title="크기 조정"
      />
    </div>
  );
}
