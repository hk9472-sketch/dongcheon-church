"use client";

import { useEffect, useMemo, useRef, useState, use } from "react";
import { useSearchParams } from "next/navigation";

// 재독듣기 팝업 플레이어 — 메인 재독듣기 페이지에서 window.open 으로 띄움.
// 단일 화면: 제목 + 폰트/크기 + 오디오 + 페이지 이동 + 본문.
// 관리자는 싱크 편집까지. 본문은 가려지지 않게 편집 패널은 collapsible.

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

const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "기본 (시스템)" },
  { value: "'Noto Sans KR', sans-serif", label: "Noto Sans KR" },
  { value: "'Noto Serif KR', serif", label: "Noto Serif KR" },
  { value: "'Nanum Gothic', sans-serif", label: "나눔 고딕" },
  { value: "'Nanum Myeongjo', serif", label: "나눔 명조" },
  { value: "'Nanum Pen Script', cursive", label: "나눔 손글씨 펜" },
  { value: "'Gowun Dodum', sans-serif", label: "고운 도담" },
  { value: "'Gowun Batang', serif", label: "고운 바탕" },
  { value: "'Hahmlet', serif", label: "Hahmlet" },
  { value: "'Spoqa Han Sans Neo', sans-serif", label: "Spoqa 한 산스" },
  { value: "Pretendard, sans-serif", label: "Pretendard" },
  { value: "monospace", label: "고정폭" },
];

export default function ReadingPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const id = Number(idStr);
  const search = useSearchParams();
  const startLineParam = Number(search.get("startLine") ?? "0") || 0;

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reading, setReading] = useState<Reading | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [lineTimes, setLineTimes] = useState<LineTime[]>([]);
  const [loading, setLoading] = useState(true);

  // 표시 설정
  const [fontFamily, setFontFamily] = useState<string>("");
  const [fontSize, setFontSize] = useState(28);
  const [page, setPage] = useState(0);
  const [linesPerPage, setLinesPerPage] = useState(8);

  // 오디오
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // 싱크 편집 (admin)
  const [editMode, setEditMode] = useState(false);
  const [editLineIndex, setEditLineIndex] = useState<number>(0);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [showMapping, setShowMapping] = useState(false);

  // 권한
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setAuthed(!!d.user);
        setIsAdmin(!!(d.user && d.user.isAdmin <= 2));
      })
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
    if (lines.length === 0) return;
    const target = startLineParam;
    const targetPage = Math.floor(target / Math.max(1, linesPerPage));
    setPage(targetPage);
    if (lineTimes.length > 0) {
      const lt = lineTimes.find((x) => x.lineIndex === target);
      if (lt && audioRef.current) {
        audioRef.current.currentTime = lt.startSec;
        setCurrentTime(lt.startSec);
      }
    }
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

  // 오디오
  const audioSrc = reading?.audioPath ? `/api/council/reading/audio/${reading.id}` : "";

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play().catch(() => {});
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
    // 자동 페이지 전환
    if (active >= 0) {
      const targetPage = Math.floor(active / Math.max(1, linesPerPage));
      if (targetPage !== page) setPage(targetPage);
    }
  };

  const handleLoaded = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      audioRef.current.playbackRate = playbackRate;
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

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
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

  // ===== 싱크 편집 핸들러 =====
  const saveLineTime = async () => {
    if (!reading) return;
    setEditMsg(null);
    try {
      const prev = lineTimes.find((lt) => lt.lineIndex === editLineIndex);
      const delta = prev ? currentTime - prev.startSec : 0;

      const res = await fetch(`/api/council/reading/${reading.id}/line-times`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineIndex: editLineIndex,
          startSec: currentTime,
          manual: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "저장 실패");

      // 뒤쪽 자동 줄도 같은 delta 만큼 shift (수동 보존)
      let shifted = 0;
      if (Math.abs(delta) > 0.01) {
        const targets = lineTimes.filter(
          (lt) => lt.lineIndex > editLineIndex && !lt.manuallyAdjusted
        );
        await Promise.all(
          targets.map(async (lt) => {
            const newSec = Math.max(0, lt.startSec + delta);
            try {
              await fetch(`/api/council/reading/${reading.id}/line-times`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  lineIndex: lt.lineIndex,
                  startSec: newSec,
                  manual: false,
                }),
              });
              shifted++;
            } catch {
              /* skip */
            }
          })
        );
      }

      const tres = await fetch(`/api/council/reading/${reading.id}/line-times`);
      const td = await tres.json();
      setLineTimes(td.times || []);
      const shiftMsg =
        shifted > 0
          ? ` · 뒤쪽 자동 ${shifted}줄 ${delta > 0 ? "+" : ""}${delta.toFixed(1)}초 이동`
          : "";
      setEditMsg(
        `${editLineIndex + 1}번 줄 ${formatTime(currentTime)} 저장됨${shiftMsg}`
      );
    } catch (e) {
      setEditMsg(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const deleteLineTime = async (lineIndex: number) => {
    if (!reading) return;
    try {
      const res = await fetch(
        `/api/council/reading/${reading.id}/line-times?lineIndex=${lineIndex}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || "삭제 실패");
      }
      setLineTimes((prev) => prev.filter((lt) => lt.lineIndex !== lineIndex));
      setEditMsg(`${lineIndex + 1}번 줄 시간 삭제됨`);
    } catch (e) {
      setEditMsg(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const autoDistributeLineTimes = async () => {
    if (!reading || lines.length === 0 || !duration || duration <= 0) {
      setEditMsg("오디오가 로드되지 않았거나 줄이 없습니다.");
      return;
    }
    if (
      !confirm(
        `이 본문의 ${lines.length}개 줄을 글자 수 비율로 자동 분할 저장합니다.\n` +
          `(이미 저장된 시간이 있다면 덮어씁니다.)\n진행할까요?`
      )
    )
      return;
    const lengths = lines.map((l) => l.length);
    const totalLen = lengths.reduce((a, b) => a + b, 0);
    if (totalLen === 0) return;
    let cum = 0;
    const payloads: { lineIndex: number; startSec: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      payloads.push({ lineIndex: i, startSec: (cum / totalLen) * duration });
      cum += lengths[i];
    }
    setEditMsg(`자동 분할 저장 중... 0 / ${payloads.length}`);
    let done = 0;
    let failed = 0;
    await Promise.all(
      payloads.map(async (p) => {
        try {
          const r = await fetch(`/api/council/reading/${reading.id}/line-times`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...p, manual: false }),
          });
          if (!r.ok) failed++;
        } catch {
          failed++;
        }
        done++;
        setEditMsg(`자동 분할 저장 중... ${done} / ${payloads.length}`);
      })
    );
    const tres = await fetch(`/api/council/reading/${reading.id}/line-times`);
    const td = await tres.json();
    setLineTimes(td.times || []);
    setEditMsg(
      failed > 0
        ? `완료: 성공 ${done - failed} / 실패 ${failed}`
        : `자동 분할 저장 완료 (${done}건). 진행바로 미세 조정 가능.`
    );
  };

  const clearAllLineTimes = async () => {
    if (!reading) return;
    if (!confirm(`이 본문의 모든 줄-시간 매핑(${lineTimes.length}건)을 삭제할까요?`))
      return;
    const r = await fetch(
      `/api/council/reading/${reading.id}/line-times?lineIndex=all`,
      { method: "DELETE" }
    );
    if (r.ok) {
      setLineTimes([]);
      setEditMsg("이 본문 전체 매핑 삭제됨");
    }
  };

  if (authed === null) return <div className="p-8 text-center text-gray-400">권한 확인 중…</div>;
  if (!authed) {
    return (
      <div className="p-8 text-center text-red-600">
        로그인이 필요합니다. 메인 창에서 로그인 후 다시 여세요.
      </div>
    );
  }
  if (loading) return <div className="p-8 text-center text-gray-400">불러오는 중…</div>;
  if (!reading) return <div className="p-8 text-center text-red-600">자료를 찾을 수 없습니다.</div>;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* 상단: 제목 + 폰트 + 크기 + 오디오 + 페이지 — 한 영역에 통합 */}
      <div className="px-3 py-2 bg-white border-b border-gray-200 space-y-2 flex-shrink-0">
        {/* row 1: 제목 + 폰트/크기 + 편집 토글 */}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-base font-bold text-gray-800 truncate flex-1 min-w-[120px]">
            {reading.title}
          </h1>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-500">글꼴</span>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="px-2 py-0.5 text-xs border border-gray-300 rounded bg-white"
              style={{ fontFamily: fontFamily || "inherit" }}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} style={{ fontFamily: f.value || "inherit" }}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-500">크기</span>
            <input
              type="number"
              min={10}
              max={120}
              value={fontSize}
              onChange={(e) => setFontSize(Math.max(10, Math.min(120, Number(e.target.value) || 28)))}
              className="w-14 px-1 py-0.5 text-xs border border-gray-300 rounded text-right font-mono"
            />
            <span className="text-gray-400">px</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-500">한 페이지 줄</span>
            <input
              type="number"
              min={1}
              max={50}
              value={linesPerPage}
              onChange={(e) => setLinesPerPage(Math.max(1, Number(e.target.value) || 1))}
              className="w-12 px-1 py-0.5 text-xs border border-gray-300 rounded text-right font-mono"
            />
          </div>
          {isAdmin && (
            <label className="flex items-center gap-1 text-xs text-amber-700 cursor-pointer">
              <input
                type="checkbox"
                checked={editMode}
                onChange={(e) => setEditMode(e.target.checked)}
                className="rounded"
              />
              싱크 편집
            </label>
          )}
        </div>

        {/* row 2: 오디오 컨트롤 + 페이지 이동 */}
        {audioSrc && (
          <div className="flex items-center gap-2 flex-wrap">
            <audio
              ref={audioRef}
              src={audioSrc}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onLoadedMetadata={handleLoaded}
              onTimeUpdate={handleTimeUpdate}
              hidden
            />
            <button
              onClick={togglePlay}
              className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
              title={isPlaying ? "일시정지" : "재생"}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <span className="text-xs text-gray-500 w-10 text-right font-mono">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 min-w-[120px] h-1.5 accent-indigo-600"
            />
            <span className="text-xs text-gray-500 w-10 font-mono">{formatTime(duration)}</span>
            <select
              value={playbackRate}
              onChange={(e) => handleRateChange(parseFloat(e.target.value))}
              className="text-xs px-1 py-0.5 border border-gray-300 rounded bg-white"
              title="재생 속도"
            >
              <option value={0.5}>0.5×</option>
              <option value={0.75}>0.75×</option>
              <option value={1.0}>1.0×</option>
              <option value={1.25}>1.25×</option>
              <option value={1.5}>1.5×</option>
              <option value={2.0}>2.0×</option>
            </select>

            {/* 페이지 이동 */}
            <span className="mx-1 text-gray-300">|</span>
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="px-2 py-0.5 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30"
            >
              ⟨⟨
            </button>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-0.5 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30"
            >
              ‹
            </button>
            <span className="text-xs text-gray-600 font-mono">
              {totalPages > 0 ? page + 1 : 0}/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-0.5 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30"
            >
              ›
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="px-2 py-0.5 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30"
            >
              ⟩⟩
            </button>
          </div>
        )}

        {/* row 3: 싱크 편집 패널 (admin + editMode) */}
        {isAdmin && editMode && (
          <div className="p-2 border border-amber-200 bg-amber-50 rounded space-y-1.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-bold text-amber-900">싱크 편집</div>
              <div className="flex gap-2">
                <button
                  onClick={autoDistributeLineTimes}
                  disabled={!duration || lines.length === 0}
                  className="px-2 py-0.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
                >
                  이 본문 자동 분할 저장 ({lines.length}줄)
                </button>
                {lineTimes.length > 0 && (
                  <button
                    onClick={clearAllLineTimes}
                    className="px-2 py-0.5 text-xs text-red-600 hover:underline"
                  >
                    전체 초기화
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-xs text-gray-700">
                현재: <strong className="font-mono">{formatTime(currentTime)}</strong>
                <span className="text-gray-400 ml-1">({currentTime.toFixed(1)}초)</span>
              </span>
              <select
                value={editLineIndex}
                onChange={(e) => setEditLineIndex(Number(e.target.value))}
                className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white max-w-md"
              >
                {lines.map((ln, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {ln.length > 40 ? ln.slice(0, 40) + "…" : ln}
                  </option>
                ))}
              </select>
              <button
                onClick={saveLineTime}
                className="px-2 py-0.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-700"
              >
                {editLineIndex + 1}번 줄 시작으로 저장
              </button>
            </div>
            {editMsg && (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                {editMsg}
              </div>
            )}
            {/* 매핑 표 (collapsible — 본문 가리지 않게 default 닫힘) */}
            {lineTimes.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowMapping((s) => !s)}
                  className="w-full flex items-center justify-between px-2 py-0.5 text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 rounded border border-amber-200"
                >
                  <span className="font-medium">저장된 매핑 ({lineTimes.length}건)</span>
                  <span className="font-mono">{showMapping ? "▲ 접기" : "▼ 펼치기"}</span>
                </button>
                {showMapping && (
                  <div className="max-h-32 overflow-y-auto bg-white rounded-b border-x border-b border-amber-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr className="text-gray-600">
                          <th className="px-2 py-0.5 text-left w-10">#</th>
                          <th className="px-2 py-0.5 text-left">줄 (앞부분)</th>
                          <th className="px-2 py-0.5 text-left w-16">시작</th>
                          <th className="px-2 py-0.5 text-center w-12">상태</th>
                          <th className="px-2 py-0.5 text-right w-20">동작</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineTimes.map((lt) => {
                          const text = lines[lt.lineIndex] || "(줄 없음)";
                          return (
                            <tr key={lt.lineIndex} className="border-t border-gray-100 hover:bg-amber-50">
                              <td className="px-2 py-0.5 font-mono">{lt.lineIndex + 1}</td>
                              <td className="px-2 py-0.5 text-gray-700 truncate max-w-md" title={text}>
                                {text.length > 40 ? text.slice(0, 40) + "…" : text}
                              </td>
                              <td className="px-2 py-0.5">
                                <button
                                  onClick={() => seekToLine(lt.lineIndex)}
                                  className="font-mono text-blue-600 hover:underline"
                                >
                                  {formatTime(lt.startSec)}
                                </button>
                              </td>
                              <td className="px-2 py-0.5 text-center">
                                {lt.manuallyAdjusted ? (
                                  <span className="inline-block px-1 py-px text-[10px] bg-amber-100 text-amber-800 rounded font-bold">
                                    수동
                                  </span>
                                ) : (
                                  <span className="inline-block px-1 py-px text-[10px] bg-gray-100 text-gray-500 rounded">
                                    자동
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-0.5 text-right space-x-1">
                                <button
                                  onClick={() => {
                                    setEditLineIndex(lt.lineIndex);
                                    seekToLine(lt.lineIndex);
                                  }}
                                  className="text-[11px] text-gray-500 hover:underline"
                                >
                                  편집
                                </button>
                                <button
                                  onClick={() => deleteLineTime(lt.lineIndex)}
                                  className="text-[11px] text-red-500 hover:underline"
                                >
                                  삭제
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 본문 — flex-1 로 남은 공간 다 차지 */}
      <div
        className="flex-1 overflow-auto p-4"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: 1.5,
          fontFamily: fontFamily || "inherit",
        }}
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
    </div>
  );
}
