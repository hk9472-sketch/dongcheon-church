"use client";

import { useEffect, useState } from "react";

interface Board {
  id: number;
  slug: string;
  title: string;
}

interface PreviewRow {
  rank: number;
  oldHeadnum: number;
  newHeadnum: number;
  treeOldest: string;
  treeCount: number;
}

interface PreviewData {
  boardId: number;
  boardTitle: string;
  totalTrees: number;
  totalPosts: number;
  preview: PreviewRow[];
}

export default function BoardReorderPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/boards")
      .then((r) => r.json())
      .then((d) => setBoards(Array.isArray(d) ? d : d.boards || []))
      .catch(() => {});
  }, []);

  async function handlePreview() {
    if (!boardId) return;
    setLoading(true);
    setMessage(null);
    setPreview(null);
    try {
      const res = await fetch(`/api/admin/boards/${boardId}/reorder-headnum`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "미리보기 실패");
      setPreview(data);
    } catch (e: unknown) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "오류" });
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!boardId || !preview) return;
    if (
      !confirm(
        `"${preview.boardTitle}" 의 ${preview.totalTrees}개 트리(글 ${preview.totalPosts}건) 의 headnum 을 createdAt 기준으로 재정렬합니다.\n\n정렬 결과는 게시판 위젯·목록의 글 순서에 즉시 반영됩니다.\n진행할까요?`
      )
    )
      return;

    setExecuting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/boards/${boardId}/reorder-headnum`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "실행 실패");
      setMessage({
        type: "ok",
        text: `"${data.boardTitle}" 의 ${data.treeCount}개 트리를 재정렬했습니다. 백업 ID: ${data.backupId} (관리메뉴 → 작업 백업/복원에서 되돌릴 수 있음)`,
      });
      setPreview(null);
    } catch (e: unknown) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "실행 실패" });
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">게시판 헤드넘 재정렬</h1>
        <p className="mt-1 text-sm text-gray-500">
          선택한 게시판의 모든 글 트리(원글+답글)를 작성일(createdAt) 기준으로
          재정렬합니다. 직접 SQL 로 옮긴 글 등이 위젯에 잘못된 자리에 표시될 때
          정상화하는 도구입니다. 답글 트리는 원글 작성 시점 기준으로 위치가
          유지되고, 트리 안 답글 순서(arrangenum)는 그대로 보존됩니다.
        </p>
      </div>

      {message && (
        <div
          className={`px-4 py-2.5 rounded-lg text-sm ${
            message.type === "ok"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 선택 + 미리보기 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">게시판</label>
            <select
              value={boardId ?? ""}
              onChange={(e) => {
                setBoardId(e.target.value ? Number(e.target.value) : null);
                setPreview(null);
              }}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">선택...</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} ({b.slug})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handlePreview}
              disabled={!boardId || loading}
              className="w-full px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "조회 중..." : "미리보기"}
            </button>
          </div>
        </div>
      </div>

      {/* 미리보기 결과 */}
      {preview && (
        <div className="bg-white rounded-lg shadow-sm border-t-4 border-blue-500 overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm">
              <span className="font-bold text-gray-800">{preview.boardTitle}</span>
              <span className="text-gray-600 ml-3">
                트리 <span className="font-bold">{preview.totalTrees}</span>개 / 글{" "}
                <span className="font-bold">{preview.totalPosts}</span>건
              </span>
            </div>
            <button
              onClick={handleExecute}
              disabled={executing || preview.totalTrees === 0}
              className="px-4 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 font-medium"
            >
              {executing ? "재정렬 중..." : "재정렬 실행"}
            </button>
          </div>

          <div className="p-4">
            <div className="text-xs text-gray-500 mb-2">
              상위 {preview.preview.length}개 트리 미리보기 (createdAt DESC 순)
            </div>
            <div className="overflow-x-auto max-h-[55vh]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-gray-600 text-xs">
                    <th className="px-2 py-2 text-right font-medium w-12">#</th>
                    <th className="px-2 py-2 text-right font-medium w-24">현재 headnum</th>
                    <th className="px-2 py-2 text-right font-medium w-24">새 headnum</th>
                    <th className="px-2 py-2 text-left font-medium w-40">트리 작성일</th>
                    <th className="px-2 py-2 text-right font-medium w-20">글 수</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((r) => (
                    <tr key={r.rank} className="border-b border-gray-100">
                      <td className="px-2 py-1.5 text-right text-gray-500">{r.rank}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-500">
                        {r.oldHeadnum}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-blue-700 font-bold">
                        {r.newHeadnum}
                      </td>
                      <td className="px-2 py-1.5 text-gray-600 text-xs">
                        {new Date(r.treeOldest).toLocaleString("ko-KR")}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-500">{r.treeCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
