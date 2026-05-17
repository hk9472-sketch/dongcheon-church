"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * 클라이언트에서 mp3 파일의 duration + peaks 동시 추출.
 * WebAudio 의 decodeAudioData 로 PCM 디코딩 후 N 개 샘플로 다운샘플.
 * 큰 파일이면 시간 좀 걸리지만 — 업로드 시 한 번만, 이후 모든 사용자는 재디코딩 없음.
 */
async function extractDurationAndPeaks(
  file: File,
  samples: number,
): Promise<{ durationMs: number; peaks: number[] }> {
  try {
    const arrayBuf = await file.arrayBuffer();
    type AudioCtxCtor = typeof AudioContext;
    const w = window as unknown as { AudioContext?: AudioCtxCtor; webkitAudioContext?: AudioCtxCtor };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return { durationMs: 0, peaks: [] };
    const ctx = new Ctor();
    const buf: AudioBuffer = await new Promise((resolve, reject) => {
      ctx.decodeAudioData(arrayBuf.slice(0), resolve, reject);
    });
    const channelData = buf.getChannelData(0);
    const block = Math.max(1, Math.floor(channelData.length / samples));
    const peaks: number[] = [];
    for (let i = 0; i < samples; i++) {
      const start = i * block;
      const end = Math.min(channelData.length, start + block);
      let max = 0;
      for (let j = start; j < end; j++) {
        const v = Math.abs(channelData[j]);
        if (v > max) max = v;
      }
      peaks.push(Number(max.toFixed(4)));
    }
    const durationMs = Math.floor(buf.duration * 1000);
    ctx.close().catch(() => {});
    return { durationMs, peaks };
  } catch {
    return { durationMs: 0, peaks: [] };
  }
}

interface Item {
  id: number;
  title: string;
  durationMs: number;
  createdAt: string;
  updatedAt: string;
}

function fmtDur(ms: number): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function AudioReadingListPage() {
  const router = useRouter();
  const [list, setList] = useState<Item[] | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reload = () => {
    fetch("/api/audio-reading")
      .then((r) => r.json())
      .then((d) => setList(d.list || []))
      .catch(() => setList([]));
  };

  useEffect(reload, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { alert("제목을 입력하세요."); return; }
    if (!content.trim()) { alert("본문을 입력하세요."); return; }
    if (!audioFile) { alert("음성 파일을 선택하세요."); return; }

    setSubmitting(true);
    try {
      // 음성 디코딩 — duration + peaks 한 번에 추출 (WebAudio).
      // 샘플 수는 음성 길이에 비례 — 짧은 음성도 부드럽게, 긴 음성도 sparse 안 보이게.
      // 1초당 약 6샘플, 최소 1500, 최대 20000.
      // duration 추정용 임시 audio (디코딩 전에 sampleCount 결정 필요).
      const tmpUrl = URL.createObjectURL(audioFile);
      const estDurSec = await new Promise<number>((resolve) => {
        const a = new Audio();
        a.preload = "metadata";
        a.onloadedmetadata = () => { resolve(Number.isFinite(a.duration) ? a.duration : 0); URL.revokeObjectURL(tmpUrl); };
        a.onerror = () => { resolve(0); URL.revokeObjectURL(tmpUrl); };
        a.src = tmpUrl;
      });
      const sampleCount = Math.max(1500, Math.min(20000, Math.floor(estDurSec * 6)));
      const { durationMs, peaks } = await extractDurationAndPeaks(audioFile, sampleCount);

      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("content", content);
      fd.append("audio", audioFile);
      fd.append("durationMs", String(durationMs));
      if (peaks && peaks.length > 0) {
        fd.append("peaks", JSON.stringify(peaks));
      }

      const res = await fetch("/api/audio-reading", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json();
        alert(err.message || "등록 실패");
        return;
      }
      const data = await res.json();
      router.push(`/council/audio-reading/${data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    const res = await fetch(`/api/audio-reading/${id}`, { method: "DELETE" });
    if (res.ok) reload();
    else {
      const err = await res.json();
      alert(err.message || "삭제 실패");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="inline-block w-1 h-7 bg-indigo-700 rounded-full" />
        <h1 className="text-xl font-bold text-gray-800">설교재독</h1>
      </div>

      {/* 신규 작성 */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-700">신규 등록</h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 2026년 5월 첫째주 설교"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">음성 파일 (mp3 / m4a / wav)</label>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
            className="text-sm"
          />
          {audioFile && (
            <span className="ml-2 text-xs text-gray-500">
              {audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(1)}MB)
            </span>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            본문 (문단은 <strong>빈 줄</strong> 또는 줄바꿈으로 구분 — 등록 시 자동 분할)
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            placeholder="본문을 붙여넣으세요. 문단 사이는 빈 줄로 구분합니다."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            등록하면 음성 총 길이를 문단 수로 균등 분할해 1차 싱크가 저장됩니다. 이후 편집 화면에서 미세 조정 가능.
          </p>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-sm font-medium bg-indigo-700 text-white rounded hover:bg-indigo-800 disabled:opacity-50"
          >
            {submitting ? "음성 분석 + 업로드 중..." : "등록"}
          </button>
        </div>
      </form>

      {/* 목록 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-bold text-gray-700">목록</h2>
        </div>
        {list === null ? (
          <div className="p-8 text-center text-gray-400 text-sm">불러오는 중...</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">등록된 항목이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">제목</th>
                <th className="px-3 py-2 text-right w-20">길이</th>
                <th className="px-3 py-2 text-right w-32">등록일</th>
                <th className="px-3 py-2 text-right w-24"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((item) => (
                <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <Link href={`/council/audio-reading/${item.id}`} className="text-indigo-700 hover:underline">
                      {item.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-600">{fmtDur(item.durationMs)}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-500">
                    {new Date(item.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
