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
 *  · 방송이 없을 때(채널 live_stream 이 재생 불가 — onReady 의 isPlayable=false 또는 onError)
 *    유튜브의 '이 동영상은 볼 수 없습니다' 대신 영상 자리에 안내·예배시간(offline)을 보여 준다.
 *    예배 시간대가 되면 2분마다 페이지를 다시 불러와 방송 시작을 잡는다.
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
  getVideoData?(): { isPlayable?: boolean; video_id?: string } | undefined;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(v: number): void;
  getVolume(): number;
}

interface Props {
  embedUrl: string;
  /** 방송이 없을 때 영상 자리에 보여 줄 내용 (안내 · 예배시간) */
  offline?: React.ReactNode;
}

const RELOAD_KEY = "dc_live_offline_reload_at";

declare global {
  interface Window {
    YT?: {
      Player: new (
        target: HTMLIFrameElement,
        opts: {
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
            onStateChange?: (e: { data: number }) => void;
            onError?: (e: { data: number }) => void;
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

export default function LiveYoutubePlayer({ embedUrl, offline }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const playingRef = useRef(false);
  const hbTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [src, setSrc] = useState("");
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVol] = useState(100);
  const [isIOS] = useState(detectIOS);
  // 방송 상태 — checking: 확인 중(유튜브 오류 화면이 비치지 않게 가림) / live / offline
  const [status, setStatus] = useState<"checking" | "live" | "offline">("checking");
  const [nextService, setNextService] = useState<{ label: string; start: string } | null>(null);

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
              // 채널에 진행 중인 방송이 없으면 live_stream 이 '재생 불가'로 열린다
              try {
                const vd = e.target.getVideoData?.();
                setStatus(vd && vd.isPlayable === false ? "offline" : "live");
              } catch {
                setStatus("live");
              }
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
              if (e.data === 1) {
                startHb();
                setStatus("live");
              } else stopHb();
            },
            // 150/101 = 재생 불가(방송 없음 등), 100 = 영상 없음
            onError: () => setStatus("offline"),
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

  // 플레이어 API 가 응답하지 않으면(네트워크 등) 8초 뒤 영상을 그대로 보여 줌
  useEffect(() => {
    if (status !== "checking") return;
    const t = setTimeout(() => setStatus((s) => (s === "checking" ? "live" : s)), 8000);
    return () => clearTimeout(t);
  }, [status]);

  // 방송이 없을 때: 다음 예배 안내 + 예배 시간대가 되면 2분마다 다시 불러와 방송 시작을 잡음
  useEffect(() => {
    if (status !== "offline") return;
    let stop = false;
    const check = () => {
      fetch("/api/live/stats")
        .then((r) => r.json())
        .then((d) => {
          if (stop) return;
          if (d?.nextService) setNextService({ label: d.nextService.label, start: d.nextService.start });
          if (d?.currentService?.inProgress) {
            let last = 0;
            try {
              last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
            } catch {
              /* ignore */
            }
            if (Date.now() - last > 2 * 60 * 1000) {
              try {
                sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
              } catch {
                /* ignore */
              }
              window.location.reload();
            }
          }
        })
        .catch(() => {});
    };
    check();
    const t = setInterval(check, 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [status]);

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
      {/* 방송이 없을 때 — 유튜브 오류 화면 대신 안내 · 예배시간 */}
      {status === "offline" && (
        <div className="rounded-lg shadow-lg bg-gradient-to-br from-slate-800 via-slate-900 to-black px-6 py-8 sm:px-10 sm:py-10">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-500 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
              방송 대기
            </span>
            <span className="text-lg font-bold text-white">지금은 실시간 방송 시간이 아닙니다</span>
          </div>
          {nextService && (
            <p className="mb-5 text-sm text-amber-300">
              {/* 시각은 표시하지 않음 — start 는 집계 윈도우 시작(예배 몇 분 전)이라 예배시간 표와 달라 보임 */}
              다음 예배: <strong>{nextService.label}</strong>{" "}
              ({new Date(nextService.start).toLocaleDateString("ko-KR", {
                timeZone: "Asia/Seoul",
                month: "long",
                day: "numeric",
                weekday: "long",
              })})
            </p>
          )}
          {offline}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-md border border-slate-500 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            방송 다시 확인
          </button>
        </div>
      )}

      {/* 영상 — 검은 상자는 영상만 감싼다 (소리 조절 칸은 상자 밖, 유튜브 화면과 구분) */}
      <div className={`relative bg-black rounded-lg overflow-hidden shadow-lg ${status === "offline" ? "hidden" : ""}`}>
        {status === "checking" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black text-sm text-slate-400">
            실시간 방송 확인 중...
          </div>
        )}
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
      </div>

      {/* 소리 조절 칸 — 영상(유튜브) 상자 밖, 별도 칸. 방송이 없을 때는 숨김 */}
      <div
        data-live-controls
        className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm ${
          status === "offline" ? "hidden" : ""
        }`}
      >
        <span className="text-sm font-bold text-gray-700">소리</span>
        {muted ? (
          <button
            type="button"
            onClick={unmuteMax}
            disabled={!ready}
            className="px-3 py-2 rounded-md bg-red-600 hover:bg-red-700 text-sm font-bold text-white disabled:opacity-50 animate-pulse"
          >
            🔊 소리 켜기 (최대 음량)
          </button>
        ) : (
          <button
            type="button"
            onClick={muteNow}
            className="px-3 py-2 rounded-md border border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm"
            title="음소거"
          >
            🔇 음소거
          </button>
        )}

        {isIOS ? (
          <span className="text-xs text-gray-500">
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
            <span className="w-11 text-right text-xs tabular-nums text-gray-600">{shownVolume}%</span>
            <button
              type="button"
              onClick={() => changeVolume(100)}
              disabled={!ready}
              className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              최대
            </button>
          </div>
        )}
      </div>
    </>
  );
}
