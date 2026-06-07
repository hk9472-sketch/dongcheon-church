"use client";

import { useEffect, useRef, useState } from "react";

/**
 * /live 페이지의 임베드 YouTube 플레이어.
 * IFrame Player API 로 PLAYING/PAUSED 이벤트를 받아 sessionId 와 함께
 * 분 단위 hb 를 서버에 전송. 같은 (sessionId, 분) 1 row 로 자동 dedup.
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

interface Props {
  embedUrl: string;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        target: HTMLIFrameElement,
        opts: { events?: { onStateChange?: (e: { data: number }) => void } },
      ) => unknown;
      PlayerState?: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export default function LiveYoutubePlayer({ embedUrl }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playingRef = useRef(false);
  const hbTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [src, setSrc] = useState("");

  // origin 은 클라이언트에서만 알 수 있으므로 mount 후 src 구성 (SSR hydration mismatch 방지).
  //  · enablejsapi=1 + origin → IFrame Player API 가 onStateChange 를 바인딩. 이게 없으면
  //    PLAYING 이벤트가 안 와서 hb 가 한 번도 안 나감 (임베드 통계 0 의 직접 원인).
  //  · mute=1                → 브라우저 자동재생 정책상 음소거여야 PLAYING 상태까지 도달.
  //  · playsinline=1         → 모바일에서 전체화면 강제 전환 방지.
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new (window.YT.Player as any)(iframeRef.current, {
          events: {
            onStateChange: (e: { data: number }) => {
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

  if (!src) return null;
  return (
    <iframe
      id="dc-live-yt"
      ref={iframeRef}
      className="absolute inset-0 w-full h-full"
      src={src}
      title="동천교회 실시간 예배"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  );
}
