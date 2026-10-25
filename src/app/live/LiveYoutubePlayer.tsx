"use client";

import { useEffect, useRef, useState } from "react";

/**
 * /live 페이지의 임베드 YouTube 플레이어.
 *  · IFrame Player API 로 PLAYING/PAUSED 이벤트를 받아 sessionId 와 함께
 *    분 단위 hb 를 서버에 전송. 같은 (sessionId, 분) 1 row 로 자동 dedup.
 *  · 소리: 브라우저 자동재생 정책상 '음소거'로만 자동재생이 가능하므로 음소거로 시작하고,
 *    사용자가 페이지를 처음 터치/클릭하는 순간 음소거 해제 + 최대 음량(100)으로 전환.
 *  · 영상 아래 소리 조절 바(음소거/슬라이더/최대) — 공식 API(unMute/setVolume) 사용,
 *    플레이어 위를 가리지 않음(YouTube 정책 준수).
 */

const HB_INTERVAL_MS = 20_000;
const SESSION_KEY = "dc_session_visitor_id.v1";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let v = localStorage.getItem(SESSION_KEY);
    if (!v) {
      v = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, v);
    }
    return v;
  } catch {
    return "";
  }
}

interface YTPlayer {
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(v: number): void;
  getVolume(): number;
}

interface Props {
  embedUrl: string;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        target: HTMLIFrameElement,
        opts: {
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
            onStateChange?: (e: { data: number }) => void;
          };
        },
      ) => YTPlayer;
      PlayerState?: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// iOS(아이폰/아이패드)는 웹에서 음량(setVolume) 조절이 막혀 있음 → 기기 버튼 안내
function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export default function LiveYoutubePlayer({ embedUrl }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const playingRef = useRef(false);
  const hbTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [src, setSrc] = useState("");
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVol] = useState(100);
  const [isIOS] = useState(detectIOS);

  // origin 은 클라이언트에서만 알 수 있으므로 mount 후 src 구성 (SSR hydration mismatch 방지).
  //  · enablejsapi=1 + origin → IFrame Player API 바인딩(이게 없으면 hb·소리제어 불가)
  //  · mute=1                → 브라우저 자동재생 정책상 음소거여야 자동재생됨
  //  · playsinline=1         → 모바일에서 전체화면 강제 전환 방지
  useEffect(() => {
    if (!embedUrl) {
      setSrc("");
      return;
    }
    const sep = embedUrl.includes("?") ? "&" : "?";
    const origin = encodeURIComponent(window.location.origin);
    setSrc(`${embedUrl}${sep}enablejsapi=1&mute=1&playsinline=1&origin=${origin}`);
  }, [embedUrl]);

  useEffect(() => {
    if (!src) return;
    const sessionId = getOrCreateSessionId();

    function sendHb(playing: boolean) {
      if (!sessionId) return;
      fetch("/api/live/embed/hb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, playing }),
        keepalive: true,
      }).catch(() => {});
    }

    function startHb() {
      if (hbTimerRef.current) return;
      playingRef.current = true;
      sendHb(true); // 즉시 1회
      hbTimerRef.current = setInterval(() => sendHb(true), HB_INTERVAL_MS);
    }
    function stopHb() {
      playingRef.current = false;
      if (hbTimerRef.current) {
        clearInterval(hbTimerRef.current);
        hbTimerRef.current = null;
      }
    }

    function initPlayer() {
      if (!window.YT || !iframeRef.current) return;
      try {
        new window.YT.Player(iframeRef.current, {
          events: {
            onReady: (e) => {
              playerRef.current = e.target;
              try {
                // 음소거 상태여도 음량은 미리 100 — 음소거 해제 즉시 최대 음량
                e.target.setVolume(100);
                setMuted(e.target.isMuted());
              } catch {
                /* ignore */
              }
              setReady(true);
            },
            onStateChange: (e) => {
              // YT.PlayerState: PLAYING=1, PAUSED=2, ENDED=0, BUFFERING=3, CUED=5
              if (e.data === 1) startHb();
              else stopHb();
            },
          },
        });
      } catch {
        /* ignore */
      }
    }

    // IFrame API 스크립트 로드 (한 번만)
    if (!window.YT) {
      const existing = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]',
      );
      if (!existing) {
        const s = document.createElement("script");
        s.src = "https://www.youtube.com/iframe_api";
        s.async = true;
        document.head.appendChild(s);
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        initPlayer();
      };
    } else {
      initPlayer();
    }

    // pagehide / unmount 시 final
    const final = () => {
      if (playingRef.current && sessionId) {
        try {
          const blob = new Blob(
            [JSON.stringify({ sessionId, playing: true })],
            { type: "application/json" },
          );
          navigator.sendBeacon?.("/api/live/embed/hb", blob);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("pagehide", final);

    return () => {
      stopHb();
      window.removeEventListener("pagehide", final);
    };
  }, [src]);

  // ---- 소리 제어 ----
  function unmuteMax() {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.unMute();
      p.setVolume(100);
    } catch {
      /* ignore */
    }
    setMuted(false);
    setVol(100);
  }

  function muteNow() {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.mute();
    } catch {
      /* ignore */
    }
    setMuted(true);
  }

  function changeVolume(v: number) {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.setVolume(v);
      if (v === 0) p.mute();
      else if (p.isMuted()) p.unMute();
    } catch {
      /* ignore */
    }
    setVol(v);
    setMuted(v === 0);
  }

  // 페이지 첫 터치/클릭/키 입력 → 음소거 해제 + 최대 음량 (브라우저가 허용하는 가장 빠른 시점)
  //  ※ 영상(iframe) 안을 누르는 건 우리 페이지에서 감지 불가 → 아래 [소리 켜기] 버튼으로도 가능
  useEffect(() => {
    if (!ready) return;
    const remove = () => {
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("keydown", handler);
    };
    function handler(e: Event) {
      const t = e.target as HTMLElement | null;
      // 소리 조절 바 조작은 각 버튼이 직접 처리
      if (t && typeof t.closest === "function" && t.closest("[data-live-controls]")) return;
      if (playerRef.current?.isMuted()) unmuteMax();
      remove();
    }
    document.addEventListener("pointerdown", handler);
    document.addEventListener("keydown", handler);
    return remove;
  }, [ready]);

  // 유튜브 자체 컨트롤로 바꾼 음량/음소거를 조절 바에도 반영
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        setMuted(p.isMuted());
        setVol(Math.round(p.getVolume()));
      } catch {
        /* ignore */
      }
    }, 1000);
    return () => clearInterval(t);
  }, [ready]);

  if (!src) return null;
  const shownVolume = muted ? 0 : volume;

  return (
    <>
      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
        <iframe
          id="dc-live-yt"
          ref={iframeRef}
          className="absolute inset-0 w-full h-full"
          src={src}
          title="동천교회 실시간 예배"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>

      {/* 소리 조절 바 — 영상 바로 아래 */}
      <div
        data-live-controls
        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 bg-gray-900 text-white"
      >
        {muted ? (
          <button
            type="button"
            onClick={unmuteMax}
            disabled={!ready}
            className="px-3 py-2 rounded-md bg-red-600 hover:bg-red-700 text-sm font-bold disabled:opacity-50 animate-pulse"
          >
            🔊 소리 켜기 (최대 음량)
          </button>
        ) : (
          <button
            type="button"
            onClick={muteNow}
            className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm"
            title="음소거"
          >
            🔇 음소거
          </button>
        )}

        {isIOS ? (
          <span className="text-xs text-gray-300">
            아이폰·아이패드는 기기 옆 <strong>볼륨 버튼</strong>으로 크기를 조절하세요.
          </span>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <span className="text-sm" aria-hidden>🔈</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={shownVolume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              disabled={!ready}
              aria-label="음량"
              className="flex-1 h-2 accent-red-500 cursor-pointer"
            />
            <span className="text-sm" aria-hidden>🔊</span>
            <span className="w-11 text-right text-xs tabular-nums text-gray-200">{shownVolume}%</span>
            <button
              type="button"
              onClick={() => changeVolume(100)}
              disabled={!ready}
              className="px-2 py-1 text-xs rounded border border-gray-600 hover:bg-gray-700 disabled:opacity-50"
            >
              최대
            </button>
          </div>
        )}
      </div>
    </>
  );
}
