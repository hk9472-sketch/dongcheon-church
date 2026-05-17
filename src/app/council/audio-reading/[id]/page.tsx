"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import WaveSurfer from "wavesurfer.js";

interface Paragraph {
  text: string;
  startMs: number;
  endMs: number;
}

interface Session {
  id: number;
  title: string;
  audioPath: string;
  durationMs: number;
  paragraphs: Paragraph[];
  peaksJson?: number[] | null;
}

function fmtTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  const cs = Math.floor((ms % 1000) / 100);
  return `${m}:${String(r).padStart(2, "0")}.${cs}`;
}

export default function AudioReadingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Session | null>(null);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [title, setTitle] = useState("");
  const [currentMs, setCurrentMs] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [waveReady, setWaveReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveContainerRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    fetch(`/api/audio-reading/${id}`)
      .then((r) => r.json())
      .then((d: Session) => {
        setData(d);
        setTitle(d.title);
        setParagraphs(Array.isArray(d.paragraphs) ? d.paragraphs : []);
      })
      .catch(() => {});
  }, [id]);

  // currentTime + play/pause 상태 폴링
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentMs(Math.floor(a.currentTime * 1000));
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
    };
  }, [data]);

  // wavesurfer — 파형 시각화. 동일 audio element 와 동기화 (media=audioRef.current).
  // peaksJson 있으면 즉시 렌더 (mp3 디코딩 skip). 없으면 wavesurfer 가 자체 디코딩.
  useEffect(() => {
    if (!data || !waveContainerRef.current || !audioRef.current) return;
    if (waveSurferRef.current) return;

    const hasPeaks = Array.isArray(data.peaksJson) && data.peaksJson.length > 0;
    const ws = WaveSurfer.create({
      container: waveContainerRef.current,
      media: audioRef.current,
      waveColor: "#cbd5e1",
      progressColor: "#6366f1",
      cursorColor: "#4f46e5",
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 80,
      normalize: true,
      // 사전 추출된 peaks + duration 제공 시 wavesurfer 가 fetch/디코딩 skip
      ...(hasPeaks
        ? {
            peaks: [data.peaksJson as number[]],
            duration: data.durationMs / 1000,
          }
        : {}),
    });
    waveSurferRef.current = ws;
    ws.on("ready", () => setWaveReady(true));
    // peaks 가 사전 제공된 경우 ready 이벤트가 늦을 수도 있어 즉시 표시
    if (hasPeaks) {
      setWaveReady(true);
    }
    return () => {
      ws.destroy();
      waveSurferRef.current = null;
    };
  }, [data]);

  if (!data) {
    return <div className="text-center py-12 text-gray-400">불러오는 중...</div>;
  }

  // 현재 재생 중인 문단 index (startMs <= currentMs < endMs)
  const activeIdx = paragraphs.findIndex(
    (p) => currentMs >= p.startMs && currentMs < p.endMs,
  );

  const jumpTo = (ms: number) => {
    // wavesurfer 인스턴스 있으면 setTime 으로 sync (audio 와 파형 cursor 함께 이동).
    // 단순히 audio.currentTime 만 바꾸면 wavesurfer v7 의 내부 상태와 어긋남.
    const ws = waveSurferRef.current;
    if (ws) {
      try {
        ws.setTime(ms / 1000);
        ws.play().catch(() => {});
        return;
      } catch {}
    }
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = ms / 1000;
    a.play().catch(() => {});
  };

  // === 자동 싱크: 텍스트 길이 가중 분할 (긴 문단 = 긴 시간) ===
  const autoSync = () => {
    if (!data.durationMs || paragraphs.length === 0) return;
    const weights = paragraphs.map((p) => Math.max(1, p.text.trim().length));
    const total = weights.reduce((s, w) => s + w, 0);
    let cursor = 0;
    const next = paragraphs.map((p, i) => {
      const dur = Math.floor((data.durationMs * weights[i]) / total);
      const startMs = cursor;
      const endMs = i === paragraphs.length - 1 ? data.durationMs : cursor + dur;
      cursor = endMs;
      return { ...p, startMs, endMs };
    });
    setParagraphs(next);
    setDirty(true);
  };

  // === 수동 싱크: 특정 문단의 startMs 를 현재 재생 시점으로 ===
  const markStart = (idx: number) => {
    const next = paragraphs.map((p, i) => {
      if (i === idx) return { ...p, startMs: currentMs };
      return p;
    });
    // endMs 정렬 — 각 startMs 의 다음 문단 = 직전 endMs
    for (let i = 0; i < next.length - 1; i++) {
      next[i].endMs = next[i + 1].startMs;
    }
    if (next.length > 0) next[next.length - 1].endMs = data.durationMs;
    setParagraphs(next);
    setDirty(true);
  };

  const nudge = (idx: number, deltaMs: number) => {
    const next = paragraphs.map((p, i) => {
      if (i === idx) return { ...p, startMs: Math.max(0, p.startMs + deltaMs) };
      return p;
    });
    for (let i = 0; i < next.length - 1; i++) {
      next[i].endMs = next[i + 1].startMs;
    }
    if (next.length > 0) next[next.length - 1].endMs = data.durationMs;
    setParagraphs(next);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/audio-reading/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, paragraphs }),
      });
      if (res.ok) {
        setDirty(false);
        setData({ ...data, title, paragraphs });
      } else {
        const err = await res.json();
        alert(err.message || "저장 실패");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/council/audio-reading" className="text-sm text-gray-500 hover:text-gray-800">
          ← 목록
        </Link>
        <span className="inline-block w-1 h-6 bg-indigo-700 rounded-full" />
        {editMode ? (
          <input
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            className="text-lg font-bold text-gray-800 border-b border-gray-300 px-2 py-1 focus:outline-none focus:border-indigo-500"
          />
        ) : (
          <h1 className="text-lg font-bold text-gray-800">{title}</h1>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditMode((p) => !p)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              editMode
                ? "bg-indigo-700 text-white border-indigo-700"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {editMode ? "편집 종료" : "편집 모드"}
          </button>
          {editMode && (
            <>
              <button
                type="button"
                onClick={autoSync}
                className="px-3 py-1.5 text-xs rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                title="음성 총 길이를 문단 수로 균등 분할 (1차 싱크)"
              >
                자동 싱크
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "저장 중..." : dirty ? "저장" : "저장됨"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 에러 표시 */}
      {audioError && (
        <div className="bg-rose-50 border border-rose-300 rounded p-3 text-sm text-rose-800">
          ⚠ {audioError}
        </div>
      )}

      {/* 음성 플레이어 + 파형 */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
        {/* 큰 재생 버튼 — 가장 잘 보이는 진입점 */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              // wavesurfer 가 audio element 를 점유 중이므로 wavesurfer 통제 우선.
              // playPause() 가 audio 와 파형 cursor 동시 sync.
              const ws = waveSurferRef.current;
              if (ws) {
                try { ws.playPause(); return; } catch {}
              }
              const a = audioRef.current;
              if (!a) return;
              if (a.paused) a.play().catch(() => {});
              else a.pause();
            }}
            className="shrink-0 w-12 h-12 rounded-full bg-indigo-600 text-white text-xl flex items-center justify-center hover:bg-indigo-700 shadow-sm transition-colors"
            title={isPlaying ? "일시정지" : "재생"}
          >
            {isPlaying ? "❚❚" : "▶"}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800 truncate">
              {isPlaying ? "재생 중" : "재생 대기"}
            </div>
            <div className="text-[11px] text-gray-500">
              아래 본문 문단을 클릭하면 그 위치부터 재생됩니다.
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs font-mono text-gray-700">
              {fmtTime(currentMs)} / {fmtTime(data.durationMs)}
            </div>
            {activeIdx >= 0 && (
              <div className="text-[10px] text-indigo-700 font-semibold mt-0.5">
                문단 #{activeIdx + 1} / {paragraphs.length}
              </div>
            )}
          </div>
        </div>

        {/* 파형 컨테이너 */}
        <div className="relative">
          <div ref={waveContainerRef} className="w-full" />
          {!waveReady && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
              파형 분석 중...
            </div>
          )}
          {/* 문단 시작점 마커 — 파형 위에 세로선. 클릭 시 그 시점으로 점프.
              wavesurfer canvas 위에 떠야 하므로 z-10 + relative stacking context. */}
          {waveReady && data.durationMs > 0 && paragraphs.map((p, idx) => {
            const left = (p.startMs / data.durationMs) * 100;
            const isActive = idx === activeIdx;
            return (
              <button
                key={idx}
                type="button"
                onClick={(e) => { e.stopPropagation(); jumpTo(p.startMs); }}
                className="absolute top-0 h-full w-1 -translate-x-1/2 hover:w-1.5 transition-all z-10 cursor-pointer"
                style={{
                  left: `${left}%`,
                  background: isActive ? "#dc2626" : "rgba(99,102,241,0.6)",
                }}
                title={`#${idx + 1} ${fmtTime(p.startMs)} — ${p.text.slice(0, 30)}...`}
              />
            );
          })}
        </div>
        {/* audio element 는 wavesurfer 가 점유 — native controls 는 0:00/0:00 으로
            잘못 보이므로 표시 X. display:none 은 일부 브라우저에서 audio 동작 차단
            가능성이 있어 sr-only 패턴으로 화면 밖에 배치. */}
        <audio
          ref={audioRef}
          src={`/api/audio-reading/file/${data.id}`}
          preload="auto"
          className="sr-only"
          onError={() => setAudioError("음성 파일을 불러올 수 없습니다.")}
        />

        {/* 진행 슬라이더 (custom) */}
        <input
          type="range"
          min={0}
          max={data.durationMs}
          step={100}
          value={currentMs}
          onChange={(e) => jumpTo(Number(e.target.value))}
          className="w-full accent-indigo-600 cursor-pointer"
          title="드래그로 위치 이동"
        />

        <p className="text-[11px] text-gray-400 text-center">
          🎯 본문 문단 클릭 · 파형 위 막대(│) 클릭 · 진행바 드래그 — 어디서든 그 시점부터 재생
        </p>
      </div>

      {/* 문단 리스트 */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">본문 · 문단별 싱크</h2>
          {editMode && (
            <span className="text-[11px] text-gray-500">
              ⏱ = 현재 재생 시점을 이 문단 시작으로 / ◀▶ = ±100ms 미세 조정 / 클릭 = 이 문단으로 점프
            </span>
          )}
        </div>
        <ol className="divide-y divide-gray-100">
          {paragraphs.map((p, idx) => {
            const isActive = idx === activeIdx;
            return (
              <li
                key={idx}
                className={`px-4 py-3 transition-colors ${
                  isActive ? "bg-indigo-50 border-l-4 border-indigo-500" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* 시간 + 점프 버튼 */}
                  <button
                    type="button"
                    onClick={() => jumpTo(p.startMs)}
                    className="shrink-0 text-xs font-mono text-gray-500 hover:text-indigo-700 hover:underline w-14 text-left pt-0.5"
                    title="이 문단으로 점프"
                  >
                    {fmtTime(p.startMs)}
                  </button>

                  {/* 본문 */}
                  <p
                    className={`flex-1 text-sm leading-relaxed cursor-pointer ${
                      isActive ? "text-gray-900 font-medium" : "text-gray-700"
                    }`}
                    onClick={() => jumpTo(p.startMs)}
                  >
                    {p.text}
                  </p>

                  {/* 편집 컨트롤 */}
                  {editMode && (
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => nudge(idx, -100)}
                        className="w-7 h-7 text-xs border border-gray-300 rounded hover:bg-gray-100"
                        title="-100ms"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => markStart(idx)}
                        className="px-2 h-7 text-xs border border-indigo-300 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100"
                        title="현재 재생 시점으로 시작 시간 설정"
                      >
                        ⏱ 찍기
                      </button>
                      <button
                        type="button"
                        onClick={() => nudge(idx, 100)}
                        className="w-7 h-7 text-xs border border-gray-300 rounded hover:bg-gray-100"
                        title="+100ms"
                      >
                        ▶
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {paragraphs.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            등록된 문단이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
