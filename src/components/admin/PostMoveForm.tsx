"use client";

import { useState } from "react";

interface Board {
  id: number;
  slug: string;
  title: string;
}

interface PostInfo {
  id: number;
  subject: string;
  authorName: string | null;
  createdAt: string;
  boardId: number;
  boardSlug: string;
  boardTitle: string;
  treeCount: number;
  headnum: number;
  depth: number;
}

export default function PostMoveForm({ boards }: { boards: Board[] }) {
  const [postIdInput, setPostIdInput] = useState("");
  const [post, setPost] = useState<PostInfo | null>(null);
  const [targetBoardId, setTargetBoardId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLookup() {
    setError(null);
    setPost(null);
    setLoading(true);
    try {
      const id = parseInt(postIdInput, 10);
      if (!id || Number.isNaN(id)) {
        setError("올바른 게시글 ID 를 입력하세요.");
        return;
      }
      const res = await fetch(`/api/admin/posts/info?id=${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "조회 실패");
        return;
      }
      setPost(data.post);
    } finally {
      setLoading(false);
    }
  }

  async function handleMove() {
    if (!post || !targetBoardId) return;
    const target = boards.find((b) => b.id === targetBoardId);
    if (!target) return;
    if (
      !confirm(
        `정말 이동하시겠습니까?\n\n[${post.boardTitle}] → [${target.title}]\n트리 ${post.treeCount}개 글 함께 이동.`
      )
    )
      return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/posts/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, targetBoardId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "이동 실패");
        return;
      }
      alert(
        `이동 완료. ${data.moved}개 글이 [${data.targetTitle}] 로 이동됐습니다.\n` +
          `게시판 카운터는 대시보드의 [카운터 재계산] 으로 동기화하세요.`
      );
      setPost(null);
      setPostIdInput("");
      setTargetBoardId(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ID 입력 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              게시글 ID
              <span className="ml-2 text-[11px] text-gray-400">
                URL 의 마지막 숫자 (예: /board/DcNotice/14749 → 14749)
              </span>
            </label>
            <input
              type="number"
              value={postIdInput}
              onChange={(e) => setPostIdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLookup();
              }}
              placeholder="예: 14749"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleLookup}
            disabled={loading || !postIdInput}
            className="px-4 py-2 text-sm bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50"
          >
            조회
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* 게시글 정보 + 이동 */}
      {post && (
        <div className="bg-white rounded-lg shadow-sm border border-blue-300 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-xs text-gray-500">제목</span>
              <div className="font-medium text-gray-800 break-words">{post.subject}</div>
            </div>
            <div>
              <span className="text-xs text-gray-500">작성자</span>
              <div className="font-medium text-gray-700">{post.authorName ?? "—"}</div>
            </div>
            <div>
              <span className="text-xs text-gray-500">현재 게시판</span>
              <div className="font-medium text-gray-700">
                {post.boardTitle}{" "}
                <span className="font-mono text-xs text-gray-400">({post.boardSlug})</span>
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500">작성일</span>
              <div className="font-medium text-gray-700">
                {new Date(post.createdAt).toLocaleString("ko-KR")}
              </div>
            </div>
            <div className="sm:col-span-2 pt-2 border-t border-gray-200">
              <span className="text-xs text-gray-500">트리 멤버</span>
              <div className="font-medium text-gray-700">
                {post.treeCount}개 글{" "}
                {post.treeCount > 1 && (
                  <span className="text-xs text-amber-700">
                    (답글 트리 전체 함께 이동됨)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 items-end pt-2 border-t border-gray-200">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                대상 게시판
              </label>
              <select
                value={targetBoardId ?? ""}
                onChange={(e) =>
                  setTargetBoardId(e.target.value ? parseInt(e.target.value, 10) : null)
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                <option value="">선택...</option>
                {boards
                  .filter((b) => b.id !== post.boardId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} ({b.slug})
                    </option>
                  ))}
              </select>
            </div>
            <button
              onClick={handleMove}
              disabled={!targetBoardId || loading}
              className="px-4 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
            >
              {loading ? "이동 중..." : "이동"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
