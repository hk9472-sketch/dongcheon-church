"use client";

import { useEffect, useMemo, useState } from "react";

interface Board {
  id: number;
  slug: string;
  title: string;
}

interface Tree {
  oldHeadnum: number;
  treeOldest: string;
  treeNewest: string;
  treeCount: number;
  rootSubject: string | null;
}

interface BoardData {
  boardId: number;
  boardTitle: string;
  totalTrees: number;
  totalPosts: number;
  trees: Tree[];
}

type SortKey = "rootSubject" | "treeOldest" | "treeNewest" | "oldHeadnum" | "treeCount";
type SortDir = "asc" | "desc";

export default function BoardReorderPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 정렬 상태 — 기본: 트리 작성일(oldest) DESC = 최신부터
  const [sortKey, setSortKey] = useState<SortKey>("treeOldest");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    fetch("/api/admin/boards")
      .then((r) => r.json())
      .then((d) => setBoards(Array.isArray(d) ? d : d.boards || []))
      .catch(() => {});
  }, []);

  async function handleLoad() {
    if (!boardId) return;
    setLoading(true);
    setMessage(null);
    setData(null);
    try {
      const res = await fetch(`/api/admin/boards/${boardId}/reorder-headnum`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "조회 실패");
      setData(d);
    } catch (e: unknown) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "오류" });
    } finally {
      setLoading(false);
    }
  }

  // 정렬 + 매핑 계산 — 클라이언트 측에서
  const sortedTrees = useMemo(() => {
    if (!data) return [];
    const arr = [...data.trees].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "rootSubject":
          cmp = (a.rootSubject || "").localeCompare(b.rootSubject || "");
          break;
        case "treeOldest":
          cmp = new Date(a.treeOldest).getTime() - new Date(b.treeOldest).getTime();
          break;
        case "treeNewest":
          cmp = new Date(a.treeNewest).getTime() - new Date(b.treeNewest).getTime();
          break;
        case "oldHeadnum":
          cmp = a.oldHeadnum - b.oldHeadnum;
          break;
        case "treeCount":
          cmp = a.treeCount - b.treeCount;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    const total = arr.length;
    return arr.map((t, i) => ({
      ...t,
      rank: i + 1,
      newHeadnum: -(total - i),
      changed: t.oldHeadnum !== -(total - i),
    }));
  }, [data, sortKey, sortDir]);

  const changedCount = useMemo(
    () => sortedTrees.filter((t) => t.changed).length,
    [sortedTrees]
  );

  function clickHeader(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // 일자/숫자류는 DESC, 제목은 ASC 가 직관적
      setSortDir(key === "rootSubject" ? "asc" : "desc");
    }
  }

  async function handleExecute() {
    if (!data || !boardId) return;
    if (changedCount === 0) {
      setMessage({ type: "err", text: "변경되는 트리가 없습니다." });
      return;
    }
    if (
      !confirm(
        `"${data.boardTitle}" 의 ${data.totalTrees}개 트리를 화면에 보이는 순서로 재정렬합니다.\n` +
          `(첫 번째 행이 맨 위 = 가장 작은 음수, 마지막 행이 맨 아래 = -1)\n\n` +
          `위치가 바뀌는 트리: ${changedCount}개\n` +
          `진행할까요?`
      )
    )
      return;

    setExecuting(true);
    setMessage(null);
    try {
      const orderedHeadnums = sortedTrees.map((t) => t.oldHeadnum);
      const res = await fetch(`/api/admin/boards/${boardId}/reorder-headnum`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedHeadnums }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "실행 실패");
      setMessage({
        type: "ok",
        text: `"${d.boardTitle}" 의 ${d.treeCount}개 트리를 재정렬했습니다. 백업 ID: ${d.backupId}`,
      });
      // 결과 반영을 위해 다시 로드
      handleLoad();
    } catch (e: unknown) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "실행 실패" });
    } finally {
      setExecuting(false);
    }
  }

  function SortHeader({ keyName, label, align }: { keyName: SortKey; label: string; align?: string }) {
    const active = sortKey === keyName;
    return (
      <th
        onClick={() => clickHeader(keyName)}
        className={`px-2 py-2 font-medium cursor-pointer select-none hover:bg-gray-100 ${
          align === "right" ? "text-right" : "text-left"
        } ${active ? "text-blue-700" : "text-gray-600"}`}
      >
        {label}
        {active && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">게시판 헤드넘 재정렬</h1>
        <p className="mt-1 text-sm text-gray-500">
          게시판의 모든 트리를 표시하고, 컬럼 헤더 클릭으로 원하는 정렬 기준을 선택합니다.
          그 순서대로 새 headnum 이 부여됩니다 (맨 위 = 가장 작은 음수, 맨 아래 = -1).
          위치 변경되는 트리는 노란색 배경으로 표시.
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

      {/* 게시판 선택 + 로드 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">게시판</label>
            <select
              value={boardId ?? ""}
              onChange={(e) => {
                setBoardId(e.target.value ? Number(e.target.value) : null);
                setData(null);
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
              onClick={handleLoad}
              disabled={!boardId || loading}
              className="w-full px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "조회 중..." : "트리 목록 조회"}
            </button>
          </div>
        </div>
      </div>

      {/* 트리 목록 */}
      {data && (
        <div className="bg-white rounded-lg shadow-sm border-t-4 border-blue-500 overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm">
              <span className="font-bold text-gray-800">{data.boardTitle}</span>
              <span className="text-gray-600 ml-3">
                트리 <span className="font-bold">{data.totalTrees}</span>개 / 글{" "}
                <span className="font-bold">{data.totalPosts}</span>건
              </span>
              <span className="text-gray-600 ml-3">
                위치 변경{" "}
                <span
                  className={`font-bold ${
                    changedCount > 0 ? "text-amber-700" : "text-emerald-600"
                  }`}
                >
                  {changedCount}
                </span>
                개
              </span>
              <span className="text-gray-500 ml-3 text-xs">
                정렬: {labelOf(sortKey)} {sortDir === "asc" ? "오름차순" : "내림차순"}
              </span>
            </div>
            <button
              onClick={handleExecute}
              disabled={executing || changedCount === 0}
              className="px-4 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 font-medium"
            >
              {executing
                ? "재정렬 중..."
                : changedCount === 0
                ? "재정렬 불필요"
                : `현재 순서로 재정렬 실행 (${changedCount}개 변경)`}
            </button>
          </div>

          {changedCount === 0 && (
            <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200 text-sm text-emerald-700">
              현재 정렬 기준에선 모든 트리의 headnum 이 이미 정확한 위치에 있습니다 — 재정렬할
              필요 없음. 다른 정렬 기준을 선택해 보세요.
            </div>
          )}

          <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
            컬럼 헤더 클릭 = 그 기준으로 정렬. 한 번 더 클릭 = 방향 토글. 노란 배경 = 위치 변경됨.
          </div>

          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10 text-xs">
                <tr>
                  <th className="px-2 py-2 text-right text-gray-600 font-medium w-14">#</th>
                  <SortHeader keyName="rootSubject" label="제목" />
                  <SortHeader keyName="treeOldest" label="작성일" />
                  <SortHeader keyName="treeNewest" label="최근활동" />
                  <SortHeader keyName="oldHeadnum" label="현재 headnum" align="right" />
                  <th className="px-2 py-2 text-right text-gray-600 font-medium w-24">새 headnum</th>
                  <SortHeader keyName="treeCount" label="글 수" align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedTrees.map((r) => (
                  <tr
                    key={r.oldHeadnum}
                    className={`border-b border-gray-100 ${
                      r.changed ? "bg-amber-50" : ""
                    }`}
                  >
                    <td className="px-2 py-1 text-right text-gray-500 font-mono text-xs">
                      {r.rank}
                    </td>
                    <td className="px-2 py-1 text-gray-700 truncate max-w-md">
                      {r.rootSubject || (
                        <span className="text-gray-400">(제목 없음)</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-gray-600 text-xs whitespace-nowrap">
                      {fmtDate(r.treeOldest)}
                    </td>
                    <td className="px-2 py-1 text-gray-600 text-xs whitespace-nowrap">
                      {fmtDate(r.treeNewest)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-gray-500">
                      {r.oldHeadnum}
                    </td>
                    <td
                      className={`px-2 py-1 text-right font-mono font-bold ${
                        r.changed ? "text-amber-700" : "text-gray-400"
                      }`}
                    >
                      {r.newHeadnum}
                    </td>
                    <td className="px-2 py-1 text-right text-gray-500">{r.treeCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function labelOf(k: SortKey): string {
  switch (k) {
    case "rootSubject":
      return "제목";
    case "treeOldest":
      return "작성일";
    case "treeNewest":
      return "최근활동";
    case "oldHeadnum":
      return "현재 headnum";
    case "treeCount":
      return "글 수";
  }
}

function fmtDate(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${dd} ${hh}:${mi}`;
}
