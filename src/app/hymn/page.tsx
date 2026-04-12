"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import HelpButton from "@/components/HelpButton";

interface Hymn {
  id: number;
  category: string;
  number: number;
  title: string;
}

const CAT_LABELS: Record<string, string> = {
  hymn: "찬송가",
  gospel: "복음성가",
  etc: "기타",
};

const CAT_COLORS: Record<string, string> = {
  hymn: "bg-indigo-100 text-indigo-700",
  gospel: "bg-emerald-100 text-emerald-700",
  etc: "bg-gray-100 text-gray-600",
};

function catLabel(cat: string) {
  return CAT_LABELS[cat] || cat;
}
function catColor(cat: string) {
  return CAT_COLORS[cat] || "bg-gray-100 text-gray-600";
}
function displayNumber(h: Hymn) {
  return h.category === "hymn" ? `${h.number}장` : `${h.number}번`;
}

export default function HymnPage() {
  const [hymns, setHymns] = useState<Hymn[]>([]);
  const [playlist, setPlaylist] = useState<Hymn[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  // 곡 추가 폼 (관리자용)
  const [showAdd, setShowAdd] = useState(false);
  const [addCategory, setAddCategory] = useState("hymn");
  const [addNumber, setAddNumber] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addAudio, setAddAudio] = useState<File | null>(null);
  const [addMsg, setAddMsg] = useState("");
  const audioInputRef = useRef<HTMLInputElement>(null);

  // 찬송가 목록 로드
  const loadHymns = useCallback(async () => {
    setLoading(true);
    const q = search ? `?q=${encodeURIComponent(search)}` : "";
    const res = await fetch(`/api/hymn${q}`);
    const data = await res.json();
    if (Array.isArray(data)) setHymns(data);
    setLoading(false);
  }, [search]);

  useEffect(() => { loadHymns(); }, [loadHymns]);

  // 플레이리스트에 추가
  const addToPlaylist = (hymn: Hymn) => {
    if (playlist.some((h) => h.id === hymn.id)) return;
    setPlaylist((prev) => [...prev, hymn]);
  };

  // 플레이리스트에서 제거
  const removeFromPlaylist = (idx: number) => {
    setPlaylist((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (idx === currentIdx) {
        stopPlaying();
      } else if (idx < currentIdx) {
        setCurrentIdx((ci) => ci - 1);
      }
      return next;
    });
  };

  // 재생
  const playHymn = (idx: number) => {
    if (idx < 0 || idx >= playlist.length) return;
    setCurrentIdx(idx);
    setIsPlaying(true);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.load();
        audioRef.current.play().catch(() => {});
      }
    }, 100);
  };

  // 중지
  const stopPlaying = () => {
    setIsPlaying(false);
    setCurrentIdx(-1);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  // 곡 끝났을 때
  const handleEnded = () => {
    if (continuous && currentIdx < playlist.length - 1) {
      playHymn(currentIdx + 1);
    } else {
      setIsPlaying(false);
    }
  };

  // 전체 재생
  const playAll = () => {
    if (playlist.length === 0) return;
    setContinuous(true);
    playHymn(0);
  };

  // 곡 추가 (관리자)
  const handleAddHymn = async () => {
    const num = parseInt(addNumber, 10);
    if (!num || !addTitle.trim()) {
      setAddMsg("번호와 곡명을 입력하세요.");
      return;
    }
    const fd = new FormData();
    fd.append("category", addCategory);
    fd.append("number", String(num));
    fd.append("title", addTitle.trim());
    if (addAudio) fd.append("audio", addAudio);

    const res = await fetch("/api/hymn", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) {
      setAddMsg(`${catLabel(addCategory)} ${num}번 추가 완료${addAudio ? " (음성 업로드됨)" : ""}`);
      setAddNumber(""); setAddTitle(""); setAddAudio(null);
      if (audioInputRef.current) audioInputRef.current.value = "";
      loadHymns();
      setTimeout(() => setAddMsg(""), 3000);
    } else {
      setAddMsg(data.error || "추가 실패");
    }
  };

  // 플레이리스트 순서 이동
  const moveInPlaylist = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= playlist.length) return;
    setPlaylist((prev) => {
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
    if (currentIdx === idx) setCurrentIdx(newIdx);
    else if (currentIdx === newIdx) setCurrentIdx(idx);
  };

  const currentHymn = currentIdx >= 0 && currentIdx < playlist.length ? playlist[currentIdx] : null;

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">찬송 듣기 <HelpButton slug="hymn" /></h1>

      {/* 오디오 플레이어 (숨김) */}
      {currentHymn && (
        <audio
          ref={audioRef}
          src={`/api/hymn/audio/${currentHymn.id}`}
          onEnded={handleEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {/* 현재 재생 정보 */}
      {currentHymn && (
        <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { if (isPlaying) audioRef.current?.pause(); else audioRef.current?.play(); }}
              className="w-10 h-10 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700"
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <div>
              <div className="text-sm font-bold text-indigo-800 flex items-center gap-1.5">
                <span className={`px-1.5 py-0.5 text-[10px] rounded ${catColor(currentHymn.category)}`}>
                  {catLabel(currentHymn.category)}
                </span>
                {displayNumber(currentHymn)} — {currentHymn.title}
              </div>
              <div className="text-xs text-indigo-500">
                {currentIdx + 1} / {playlist.length}곡
                {continuous && " (연속 재생)"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => currentIdx > 0 && playHymn(currentIdx - 1)} disabled={currentIdx <= 0}
              className="px-2 py-1 text-xs bg-white border border-indigo-300 rounded hover:bg-indigo-50 disabled:opacity-30">
              ◀ 이전
            </button>
            <button onClick={() => currentIdx < playlist.length - 1 && playHymn(currentIdx + 1)} disabled={currentIdx >= playlist.length - 1}
              className="px-2 py-1 text-xs bg-white border border-indigo-300 rounded hover:bg-indigo-50 disabled:opacity-30">
              다음 ▶
            </button>
            <button onClick={stopPlaying}
              className="px-2 py-1 text-xs bg-red-100 text-red-700 border border-red-300 rounded hover:bg-red-200">
              ■ 중지
            </button>
            <a
              href={`/api/hymn/audio/${currentHymn.id}?dl=1`}
              download={`${catLabel(currentHymn.category)}_${currentHymn.number}_${currentHymn.title}.mp3`}
              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 border border-blue-300 rounded hover:bg-blue-200 flex items-center gap-1"
              title="다운로드"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              저장
            </a>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* 왼쪽: 찬송가 목록 */}
        <div className="lg:w-1/2 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-gray-700">곡 목록</h2>
              <button onClick={() => setShowAdd(!showAdd)}
                className="px-2 py-1 text-[10px] bg-green-100 text-green-700 border border-green-300 rounded hover:bg-green-200">
                {showAdd ? "닫기" : "곡 추가"}
              </button>
            </div>
            {/* 곡 추가 폼 */}
            {showAdd && (
              <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded space-y-2">
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="block text-[10px] text-gray-500">카테고리</label>
                    <select value={addCategory} onChange={(e) => setAddCategory(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs">
                      <option value="hymn">찬송가</option>
                      <option value="gospel">복음성가</option>
                      <option value="etc">기타</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500">번호</label>
                    <input type="number" value={addNumber} onChange={(e) => setAddNumber(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs w-16" placeholder="1" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-500">곡명</label>
                    <input type="text" value={addTitle} onChange={(e) => setAddTitle(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs w-full" placeholder="만복의 근원 하나님" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-gray-500 shrink-0">음성파일</label>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setAddAudio(e.target.files?.[0] || null)}
                    className="text-xs text-gray-600 file:mr-2 file:px-2 file:py-0.5 file:text-xs file:border-0 file:rounded file:bg-blue-100 file:text-blue-700 file:cursor-pointer hover:file:bg-blue-200 flex-1"
                  />
                  <button onClick={handleAddHymn}
                    className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 shrink-0">추가</button>
                </div>
                {addMsg && <div className="text-[10px] text-green-700">{addMsg}</div>}
              </div>
            )}
            {/* 검색 */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="번호 또는 곡명 검색..."
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-400 text-sm">로딩 중...</div>
            ) : hymns.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">등록된 곡이 없습니다.</div>
            ) : (
              <ul>
                {hymns.map((h) => {
                  const inPlaylist = playlist.some((p) => p.id === h.id);
                  return (
                    <li key={h.id} className="flex items-center px-3 py-1.5 border-b border-gray-100 hover:bg-gray-50 text-sm">
                      <span className={`px-1.5 py-0.5 text-[10px] rounded mr-2 flex-shrink-0 ${catColor(h.category)}`}>
                        {catLabel(h.category)}
                      </span>
                      <span className="w-10 text-xs text-gray-400 text-right mr-2 flex-shrink-0">{displayNumber(h)}</span>
                      <span className="flex-1 truncate text-gray-800">{h.title}</span>
                      <a
                        href={`/api/hymn/audio/${h.id}?dl=1`}
                        download={`${catLabel(h.category)}_${h.number}_${h.title}.mp3`}
                        className="ml-1 px-1.5 py-0.5 text-[10px] text-blue-600 hover:bg-blue-50 rounded flex-shrink-0"
                        title="다운로드"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </a>
                      <button
                        onClick={() => addToPlaylist(h)}
                        disabled={inPlaylist}
                        className={`ml-1 px-2 py-0.5 text-[10px] rounded flex-shrink-0 ${
                          inPlaylist
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-indigo-100 text-indigo-700 border border-indigo-300 hover:bg-indigo-200"
                        }`}
                      >
                        {inPlaylist ? "추가됨" : "추가 ▶"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* 오른쪽: 재생 목록 */}
        <div className="lg:w-1/2 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 bg-indigo-50">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-indigo-800">재생 목록 ({playlist.length}곡)</h2>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={continuous}
                    onChange={(e) => setContinuous(e.target.checked)}
                    className="w-3.5 h-3.5 accent-indigo-600"
                  />
                  계속 듣기
                </label>
                {playlist.length > 0 && (
                  <button onClick={playAll}
                    className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">
                    전체 재생
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {playlist.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                왼쪽 목록에서 곡을 추가하세요.
              </div>
            ) : (
              <ul>
                {playlist.map((h, idx) => {
                  const isCurrent = idx === currentIdx;
                  return (
                    <li key={`${h.id}-${idx}`}
                      className={`flex items-center px-3 py-2 border-b border-gray-100 text-sm ${
                        isCurrent ? "bg-indigo-100 font-bold" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="w-6 text-xs text-gray-400 text-right mr-2 flex-shrink-0">{idx + 1}</span>
                      <span className={`px-1.5 py-0.5 text-[10px] rounded mr-2 flex-shrink-0 ${catColor(h.category)}`}>
                        {catLabel(h.category)}
                      </span>
                      <span className="w-10 text-xs text-gray-500 text-right mr-2 flex-shrink-0">{displayNumber(h)}</span>
                      <span className="flex-1 truncate text-gray-800">{h.title}</span>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <button onClick={() => moveInPlaylist(idx, -1)} disabled={idx === 0}
                          className="px-1 py-0.5 text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-30">▲</button>
                        <button onClick={() => moveInPlaylist(idx, 1)} disabled={idx === playlist.length - 1}
                          className="px-1 py-0.5 text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-30">▼</button>
                        <button onClick={() => playHymn(idx)}
                          className={`px-2 py-0.5 text-[10px] rounded ${
                            isCurrent && isPlaying
                              ? "bg-orange-100 text-orange-700 border border-orange-300"
                              : "bg-indigo-100 text-indigo-700 border border-indigo-300 hover:bg-indigo-200"
                          }`}>
                          {isCurrent && isPlaying ? "⏸" : "▶"}
                        </button>
                        <button onClick={() => removeFromPlaylist(idx)}
                          className="px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-700 hover:bg-red-50 rounded">✕</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {playlist.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-200 flex justify-end">
              <button onClick={() => { stopPlaying(); setPlaylist([]); }}
                className="px-3 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50">
                전체 삭제
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
