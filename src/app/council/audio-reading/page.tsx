"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  const audioMetaRef = useRef<HTMLAudioElement | null>(null);

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
      // 음성 길이 추출
      const durationMs = await new Promise<number>((resolve) => {
        const url = URL.createObjectURL(audioFile);
        const a = new Audio();
        audioMetaRef.current = a;
        a.preload = "metadata";
        a.onloadedmetadata = () => {
          const ms = Math.floor(a.duration * 1000);
          URL.revokeObjectURL(url);
          resolve(Number.isFinite(ms) ? ms : 0);
        };
        a.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(0);
        };
        a.src = url;
      });

      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("content", content);
      fd.append("audio", audioFile);
      fd.append("durationMs", String(durationMs));

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
            {submitting ? "등록 중..." : "등록"}
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
