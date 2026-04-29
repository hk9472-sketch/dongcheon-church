"use client";

import { useEffect, useMemo, useRef, useState, use } from "react";
import { useSearchParams } from "next/navigation";

// 재독듣기 팝업 플레이어 — 메인 재독듣기 페이지에서 window.open 으로 띄움.
// 크기 자유 조정 (브라우저 창), 폰트 크기 조정, 페이지 단위 이동, 선택한 줄에서 시작.
// admin layout 안 거치게 최상위 라우트에 배치.

interface Reading {
  id: number;
  title: string;
  content: string;
  audioPath: string | null;
}

interface LineTime {
  lineIndex: number;
  startSec: number;
  manuallyAdjusted: boolean;
}

export default function ReadingPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const id = Number(idStr);
  const search = useSearchParams();
  const startLineParam = Number(search.get("startLine") ?? "0") || 0;

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [lineTimes, setLineTimes] = useState<LineTime[]>([]);
  const [loading, setLoading] = useState(true);

  // 표시 설정
  const [fontSize, setFontSize] = useState(28);
  const [page, setPage] = useState(0);
  const [linesPerPage, setLinesPerPage] = useState(8);

  // 오디오
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeLine, setActiveLine] = useState<number | null>(null);

  // 권한
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setAuthed(!!d.user))
      .catch(() => setAuthed(false));
  }, []);

  // 데이터 로드
  useEffect(() => {
    if (!Number.isFinite(id) || authed !== true) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/council/reading/${id}`).then((r) => r.json()),
      fetch(`/api/council/reading/${id}/line-times`).then((r) => r.json()),
    ])
      .then(([rd, lt]) => {
        if (rd?.reading) {
          setReading(rd.reading);
          const ls = (rd.reading.content as string)
            .split("\n")
            .filter((l: string) => l.trim() !== "");
          setLines(ls);
        }
        setLineTimes(lt?.times || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, authed]);

  // 시작 줄로 점프
  useEffect(() => {
    if (lines.length === 0 || lineTimes.length === 0) return;
    const target = startLineParam;
    const lt = lineTimes.find((x) => x.lineIndex === target);
    if (lt && audioRef.current) {
      audioRef.current.currentTime = lt.startSec;
      setCurrentTime(lt.startSec);
    }
    const targetPage = Math.floor(target / Math.max(1, linesPerPage));
    setPage(targetPage);
  }, [lines, lineTimes, startLineParam, linesPerPage]);

  // 페이지 분할
  const pagedLines = useMemo(() => {
    if (lines.length === 0) return [] as string[][];
    const result: string[][] = [];
    for (let i = 0; i < lines.length; i += linesPerPage) {
      result.push(lines.slice(i, i + linesPerPage));
    }
    return result;
  }, [lines, linesPerPage]);

  const totalPages = pagedLines.length;
  const currentLines = pagedLines[page] ?? [];
  const pageStartIdx = page * linesPerPage;

  // 오디오 핸들러
  const audioSrc = reading?.audioPath ? `/api/council/reading/audio/${reading.id}` : "";

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setCurrentTime(t);

    if (lineTimes.length === 0) return;
    let active = lineTimes[0].lineIndex;
    for (const lt of lineTimes) {
      if (lt.startSec <= t) active = lt.lineIndex;
      else break;
    }
    setActiveLine(active);

    // 활성 줄이 현재 페이지 밖이면 자동 페이지 이동
    if (active >= 0) {
      const targetPage = Math.floor(active / Math.max(1, linesPerPage));
      if (targetPage !== page) setPage(targetPage);
    }
  };

  const handleLoaded = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      // 시작 줄로 jump (audio loaded 후)
      const lt = lineTimes.find((x) => x.lineIndex === startLineParam);
      if (lt) {
        audioRef.current.currentTime = lt.startSec;
        setCurrentTime(lt.startSec);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const seekToLine = (rawIdx: number) => {
    const lt = lineTimes.find((x) => x.lineIndex === rawIdx);
    if (lt && audioRef.current) {
      audioRef.current.currentTime = lt.startSec;
      setCurrentTime(lt.startSec);
      audioRef.current.play().catch(() => {});
    }
  };

  const formatTime = (sec: number) => {
    if (!isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (authed === null) {
    return <div className="p-8 text-center text-gray-400">권한 확인 중…</div>;
  }
  if (!authed) {
    return (
      <div className="p-8 text-center text-red-600">
        로그인이 필요합니다. 메인 창에서 로그인 후 다시 여세요.
      </div>
    );
  }
  if (loading) {
    return <div className="p-8 text-center text-gray-400">불러오는 중…</div>;
  }
  if (!reading) {
    return <div className="p-8 text-center text-red-600">자료를 찾을 수 없습니다.</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* 헤더: 제목 + 폰트 크기 조정 */}
      <div className="px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-base font-bold text-gray-800 truncate flex-1 min-w-0">
          {reading.title}
        </h1>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">글자</span>
            <button
              onClick={() => setFontSize((s) => Math.max(12, s - 2))}
              className="px-2 py-0.5 text-xs bg-gray-100 rounded hover:bg-gray-200"
              title="글자 작게"
            >
              −
            </button>
            <span className="text-xs font-mono w-8 text-center">{fontSize}</span>
            <button
              onClick={() => setFontSize((s) => Math.min(72, s + 2))}
              className="px-2 py-0.5 text-xs bg-gray-100 rounded hover:bg-gray-200"
              title="글자 크게"
            >
              +
            </button>
            <input
              type="range"
              min={12}
              max={72}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-24 ml-1 h-1 accent-indigo-600"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">페이지당 줄</span>
            <input
              type="number"
              min={1}
              max={50}
              value={linesPerPage}
              onChange={(e) => setLinesPerPage(Math.max(1, Number(e.target.value) || 1))}
              className="w-12 px-1 py-0.5 text-xs border border-gray-300 rounded text-right font-mono"
            />
          </div>
        </div>
      </div>

      {/* 본문 영역 */}
      <div
        className="flex-1 overflow-auto p-4 leading-relaxed"
        style={{ fontSize: `${fontSize}px`, lineHeight: 1.5 }}
      >
        {currentLines.map((line, idx) => {
          const rawIdx = pageStartIdx + idx;
          const isActive = activeLine === rawIdx;
          return (
            <div
              key={rawIdx}
              onClick={() => seekToLine(rawIdx)}
              className={`px-3 py-2 rounded cursor-pointer transition-colors ${
                isActive
                  ? "bg-amber-100 text-amber-900 font-bold"
                  : "hover:bg-gray-100 text-gray-800"
              }`}
              title="클릭하면 이 줄부터 재생"
            >
              <span className="text-gray-300 text-xs mr-2 font-mono align-baseline">
                {rawIdx + 1}
              </span>
              {line}
            </div>
          );
        })}
        {currentLines.length === 0 && (
          <div className="text-center text-gray-400 py-12">표시할 줄이 없습니다.</div>
        )}
      </div>

      {/* 페이지 이동 + 오디오 컨트롤 */}
      <div className="bg-white border-t border-gray-200 p-3 space-y-2">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(0)}
            disabled={page === 0}
            className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30"
          >
            ⟨⟨ 처음
          </button>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30"
          >
            ‹ 이전
          </button>
          <span className="text-xs text-gray-600 font-mono">
            {totalPages > 0 ? page + 1 : 0} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30"
          >
            다음 ›
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30"
          >
            끝 ⟩⟩
          </button>
        </div>

        {audioSrc && (
          <>
            <audio
              ref={audioRef}
              src={audioSrc}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onLoadedMetadata={handleLoaded}
              onTimeUpdate={handleTimeUpdate}
              hidden
            />
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <span className="text-xs text-gray-500 w-10 text-right">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1.5 accent-indigo-600"
              />
              <span className="text-xs text-gray-500 w-10">{formatTime(duration)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
