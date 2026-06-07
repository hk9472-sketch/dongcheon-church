"use client";

import { useEffect, useRef } from "react";

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

  // src 에 enablejsapi=1 + origin 부여
  const src = embedUrl
    ? embedUrl + (embedUrl.includes("?") ? "&" : "?") + "enablejsapi=1"
    : "";

  useEffect(() => {
    if (!embedUrl) return;
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
  }, [embedUrl]);

  if (!src) return null;
  return (
    <iframe
      ref={iframeRef}
      className="absolute inset-0 w-full h-full"
      src={src}
      title="동천교회 실시간 예배"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  );
}
