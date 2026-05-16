"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface Thread {
  peerKey: string;
  peerName: string;
  lastContent: string;
  lastAt: string;
  unread: number;
  isBroadcast: boolean;
}

interface Me {
  id: number;
  userId: string;
  name: string;
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

function MessagesContent() {
  const searchParams = useSearchParams();
  const expectedUserId = searchParams.get("as"); // 이메일 링크의 ?as=hk9472

  const [me, setMe] = useState<Me | null>(null);
  const [meChecked, setMeChecked] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  // 로그인 상태 확인
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d?.user) setMe({ id: d.user.id, userId: d.user.userId, name: d.user.name });
      })
      .catch(() => {})
      .finally(() => setMeChecked(true));
  }, []);

  // threads 로드
  useEffect(() => {
    if (!meChecked) return;
    const gid = getGuestId();
    const q = !me && gid ? `?guestId=${encodeURIComponent(gid)}` : "";
    fetch(`/api/chat/threads${q}`)
      .then((r) => r.json())
      .then((d) => setThreads(d.threads || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [meChecked, me]);

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

  // 비로그인 케이스 — guestId 있어도 무조건 로그인 안내 우선.
  // 메일에서 진입(?as=...) 했을 때 빈 화면 보이던 문제 해결.
  if (meChecked && !me) {
    const target = "/messages" + (expectedUserId ? `?as=${expectedUserId}` : "");
    return (
      <div className="max-w-3xl mx-auto py-10">
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-8 text-center shadow-sm">
          <p className="text-2xl mb-3">{expectedUserId ? "📩" : "🔒"}</p>
          <p className="text-lg font-bold text-amber-900 mb-3">
            {expectedUserId ? "메시지를 확인하려면 로그인이 필요합니다" : "로그인이 필요합니다"}
          </p>
          {expectedUserId ? (
            <p className="text-sm text-amber-800 mb-5 leading-relaxed">
              이 메시지는{" "}
              <code className="bg-white px-2 py-0.5 rounded border border-amber-200 font-bold">
                {expectedUserId}
              </code>{" "}
              계정 앞으로 발송되었습니다.
              <br />
              해당 계정으로 로그인하시면 메시지 내용을 확인할 수 있습니다.
            </p>
          ) : (
            <p className="text-sm text-amber-800 mb-5">
              메시지함은 로그인한 사용자만 볼 수 있습니다.
            </p>
          )}
          <Link
            href={`/auth/login?redirect=${encodeURIComponent(target)}`}
            className="inline-block px-6 py-2.5 bg-blue-700 text-white rounded-lg hover:bg-blue-800 font-medium shadow-sm"
          >
            {expectedUserId ? `${expectedUserId} 로 로그인하기` : "로그인 하기"}
          </Link>
          <p className="text-xs text-gray-500 mt-4">
            로그인 후 자동으로 메시지함으로 돌아옵니다.
          </p>
        </div>
      </div>
    );
  }

  // (2) 이메일 링크의 as= 와 현재 로그인 계정이 다를 때
  const accountMismatch = !!(expectedUserId && me && me.userId !== expectedUserId);

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="inline-block w-1 h-7 bg-indigo-700 rounded-full" />
        <h1 className="text-xl font-bold text-gray-800">메시지함</h1>
        {me && (
          <span className="text-xs text-gray-500">
            ({me.name} · <code>{me.userId}</code>)
          </span>
        )}
      </div>

      {/* 계정 불일치 경고 */}
      {accountMismatch && (
        <div className="bg-rose-50 border border-rose-300 rounded-lg p-4 space-y-2">
          <p className="text-sm font-bold text-rose-800">
            ⚠ 이 메시지는 <code className="bg-white px-1.5 py-0.5 rounded">{expectedUserId}</code> 앞으로 발송된 것입니다.
          </p>
          <p className="text-xs text-rose-700">
            현재 <strong>{me?.userId}</strong> 계정으로 로그인되어 있어 해당 메시지가 보이지 않을 수 있습니다.
            같은 이메일을 여러 계정이 공유 중이라면, 메시지를 받은 계정으로 다시 로그인해 주세요.
          </p>
          <div className="flex gap-2 pt-1">
            <Link
              href={`/auth/login?redirect=${encodeURIComponent(`/messages?as=${expectedUserId}`)}`}
              className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded hover:bg-rose-700"
            >
              {expectedUserId} 로 다시 로그인
            </Link>
          </div>
        </div>
      )}

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

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">로딩 중...</div>}>
      <MessagesContent />
    </Suspense>
  );
}
