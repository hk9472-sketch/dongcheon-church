"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";

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
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // currentTime 폴링 (audio 의 timeupdate 사용)
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentMs(Math.floor(a.currentTime * 1000));
    a.addEventListener("timeupdate", onTime);
    return () => a.removeEventListener("timeupdate", onTime);
  }, [data]);

  if (!data) {
    return <div className="text-center py-12 text-gray-400">불러오는 중...</div>;
  }

  // 현재 재생 중인 문단 index (startMs <= currentMs < endMs)
  const activeIdx = paragraphs.findIndex(
    (p) => currentMs >= p.startMs && currentMs < p.endMs,
  );

  const jumpTo = (ms: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = ms / 1000;
    a.play().catch(() => {});
  };

  // === 자동 싱크: 현재 음성 길이 기준으로 균등 재배분 ===
  const autoSync = () => {
    if (!data.durationMs || paragraphs.length === 0) return;
    if (paragraphs.length === 1) {
      setParagraphs([{ ...paragraphs[0], startMs: 0, endMs: data.durationMs }]);
      setDirty(true);
      return;
    }
    const slice = Math.floor(data.durationMs / paragraphs.length);
    const next = paragraphs.map((p, i) => ({
      ...p,
      startMs: i * slice,
      endMs: i === paragraphs.length - 1 ? data.durationMs : (i + 1) * slice,
    }));
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

      {/* 음성 플레이어 */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <audio
          ref={audioRef}
          src={`/${data.audioPath}`}
          controls
          preload="metadata"
          className="w-full"
        />
        <div className="mt-1 text-xs text-gray-500 flex items-center gap-3">
          <span>현재: <span className="font-mono">{fmtTime(currentMs)}</span></span>
          <span>총: <span className="font-mono">{fmtTime(data.durationMs)}</span></span>
          <span>문단: <span className="font-mono">{paragraphs.length}</span>개</span>
          {activeIdx >= 0 && (
            <span className="text-indigo-700 font-semibold">현재 문단 #{activeIdx + 1}</span>
          )}
        </div>
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
