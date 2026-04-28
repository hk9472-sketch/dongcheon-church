"use client";

import { useEffect, useState, useCallback } from "react";

interface Board {
  id: number;
  slug: string;
  title: string;
}

interface Category {
  id: number;
  name: string;
}

interface PostRow {
  id: number;
  subject: string;
  authorName: string;
  createdAt: string;
  isNotice: boolean;
  depth: number;
  headnum: number;
  arrangenum: number;
  categoryId: number | null;
  categoryName: string | null;
}

export default function BulkMovePage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [sourceBoardId, setSourceBoardId] = useState<number | null>(null);
  const [sourceCategories, setSourceCategories] = useState<Category[]>([]);
  const [filterCategoryId, setFilterCategoryId] = useState<number | "" | "none">("");
  const [keyword, setKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [targetBoardId, setTargetBoardId] = useState<number | null>(null);
  const [targetCategories, setTargetCategories] = useState<Category[]>([]);
  const [targetCategoryId, setTargetCategoryId] = useState<number | "" | "none">("");

  const [moving, setMoving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 1) 게시판 목록
  useEffect(() => {
    fetch("/api/admin/boards")
      .then((r) => r.json())
      .then((d) => setBoards(Array.isArray(d) ? d : d.boards || []))
      .catch(() => {});
  }, []);

  // 2) source board 선택 시 카테고리 로드
  useEffect(() => {
    if (!sourceBoardId) {
      setSourceCategories([]);
      return;
    }
    fetch(`/api/admin/boards/${sourceBoardId}`)
      .then((r) => r.json())
      .then((d) => setSourceCategories(d?.categories || []))
      .catch(() => setSourceCategories([]));
  }, [sourceBoardId]);

  // 3) target board 선택 시 카테고리 로드
  useEffect(() => {
    if (!targetBoardId) {
      setTargetCategories([]);
      setTargetCategoryId("");
      return;
    }
    fetch(`/api/admin/boards/${targetBoardId}`)
      .then((r) => r.json())
      .then((d) => setTargetCategories(d?.categories || []))
      .catch(() => setTargetCategories([]));
    setTargetCategoryId("");
  }, [targetBoardId]);

  // 4) 글 목록 조회
  const fetchPosts = useCallback(async () => {
    if (!sourceBoardId) return;
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      params.set("boardId", String(sourceBoardId));
      if (filterCategoryId === "none") params.set("categoryId", "null");
      else if (filterCategoryId !== "") params.set("categoryId", String(filterCategoryId));
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("limit", "200");

      const res = await fetch(`/api/admin/posts/list?${params.toString()}`);
      if (!res.ok) throw new Error("목록 조회 실패");
      const data = await res.json();
      setPosts(data.posts || []);
      setSelected(new Set());
    } catch (e: unknown) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "조회 실패" });
    } finally {
      setLoading(false);
    }
  }, [sourceBoardId, filterCategoryId, keyword, dateFrom, dateTo]);

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === posts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(posts.map((p) => p.id)));
    }
  }

  async function handleMove() {
    if (selected.size === 0) {
      setMessage({ type: "err", text: "이동할 글을 선택하세요." });
      return;
    }
    if (!targetBoardId) {
      setMessage({ type: "err", text: "대상 게시판을 선택하세요." });
      return;
    }
    if (sourceBoardId === targetBoardId) {
      setMessage({ type: "err", text: "원본과 대상 게시판이 같습니다." });
      return;
    }
    const targetCat = targetCategories.find(
      (c) => typeof targetCategoryId === "number" && c.id === targetCategoryId
    );
    const confirmMsg = `${selected.size}개 글(답글 포함 트리 단위)을 "${
      boards.find((b) => b.id === targetBoardId)?.title || ""
    }${targetCat ? ` / ${targetCat.name}` : ""}" 게시판으로 이동합니다. 진행할까요?`;
    if (!confirm(confirmMsg)) return;

    setMoving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/posts/bulk-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postIds: Array.from(selected),
          targetBoardId,
          targetCategoryId:
            targetCategoryId === "none" || targetCategoryId === ""
              ? null
              : targetCategoryId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "이동 실패");
      setMessage({
        type: "ok",
        text: `${data.treeCount}개 트리(글 ${data.movedCount}건)를 "${data.targetTitle}" 으로 이동했습니다.`,
      });
      // 목록 재조회
      fetchPosts();
    } catch (e: unknown) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "이동 실패" });
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">게시글 일괄 이동</h1>
        <p className="mt-1 text-sm text-gray-500">
          원본 게시판에서 글을 선택해 다른 게시판/카테고리로 한번에 이동합니다.
          답글이 있는 글은 트리 전체가 함께 이동하며, 대상 게시판 기준으로
          headnum 이 최신(가장 위) 위치로 새로 부여됩니다.
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

      {/* 필터 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-700">원본 (이동할 글)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">게시판</label>
            <select
              value={sourceBoardId ?? ""}
              onChange={(e) =>
                setSourceBoardId(e.target.value ? Number(e.target.value) : null)
              }
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

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">카테고리</label>
            <select
              value={filterCategoryId}
              onChange={(e) => {
                const v = e.target.value;
                setFilterCategoryId(v === "" || v === "none" ? (v as "" | "none") : Number(v));
              }}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              disabled={!sourceBoardId}
            >
              <option value="">전체</option>
              <option value="none">(없음)</option>
              {sourceCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">제목/내용</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="검색어"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">작성일 from</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">작성일 to</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <button
          onClick={fetchPosts}
          disabled={!sourceBoardId || loading}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "조회 중..." : "조회"}
        </button>
      </div>

      {/* 목록 */}
      {posts.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              총 {posts.length}건 — 선택{" "}
              <span className="font-bold text-blue-700">{selected.size}</span>건
            </div>
            <button
              onClick={toggleAll}
              className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
            >
              {selected.size === posts.length ? "전체 해제" : "전체 선택"}
            </button>
          </div>

          <div className="overflow-x-auto max-h-[55vh]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-gray-600">
                  <th className="px-2 py-2 w-10"></th>
                  <th className="px-2 py-2 text-left font-medium w-16">ID</th>
                  <th className="px-2 py-2 text-left font-medium">제목</th>
                  <th className="px-2 py-2 text-left font-medium w-24">카테고리</th>
                  <th className="px-2 py-2 text-left font-medium w-24">작성자</th>
                  <th className="px-2 py-2 text-left font-medium w-32">작성일</th>
                  <th className="px-2 py-2 text-right font-medium w-20">headnum</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                      selected.has(p.id) ? "bg-blue-50 hover:bg-blue-100" : ""
                    }`}
                    onClick={() => toggleOne(p.id)}
                  >
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-gray-500">{p.id}</td>
                    <td className="px-2 py-1.5">
                      {p.depth > 0 && <span className="text-gray-400">{"└─".repeat(1)} </span>}
                      {p.isNotice && (
                        <span className="mr-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">
                          공지
                        </span>
                      )}
                      {p.subject}
                    </td>
                    <td className="px-2 py-1.5 text-gray-600">{p.categoryName || "-"}</td>
                    <td className="px-2 py-1.5 text-gray-600">{p.authorName}</td>
                    <td className="px-2 py-1.5 text-gray-500 text-xs">
                      {p.createdAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-500 font-mono text-xs">
                      {p.headnum}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 대상 + 실행 */}
      {selected.size > 0 && (
        <div className="bg-white rounded-lg shadow-sm border-t-4 border-amber-500 p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-700">대상 게시판/카테고리</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">대상 게시판</label>
              <select
                value={targetBoardId ?? ""}
                onChange={(e) =>
                  setTargetBoardId(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              >
                <option value="">선택...</option>
                {boards
                  .filter((b) => b.id !== sourceBoardId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} ({b.slug})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">대상 카테고리</label>
              <select
                value={targetCategoryId}
                onChange={(e) => {
                  const v = e.target.value;
                  setTargetCategoryId(v === "" || v === "none" ? (v as "" | "none") : Number(v));
                }}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                disabled={!targetBoardId}
              >
                <option value="">선택...</option>
                <option value="none">(카테고리 없음)</option>
                {targetCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleMove}
                disabled={moving || !targetBoardId}
                className="w-full px-4 py-2 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 font-medium"
              >
                {moving ? "이동 중..." : `선택 ${selected.size}건 이동`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
