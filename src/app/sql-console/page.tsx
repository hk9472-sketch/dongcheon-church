"use client";

import { useEffect, useRef, useState } from "react";
import { downloadSqlResultCsv } from "@/lib/sqlCsvDownload";

// SQL 콘솔 팝업 — 메인 SQL 페이지에서 window.open 으로 띄워 별도 창에서 독립 실행.
// 자체 권한 체크 (admin layout 이 wrap 하지만 popup 은 layout 밖이라 명시적 fetch).
// 한 페이지에 여러 콘솔 탭을 추가/제거하며 동시 테스트 가능.

interface SqlResult {
  type: "select" | "execute";
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  affectedRows?: number;
  executionTime: number;
  error?: string;
}

interface ConsoleTab {
  id: number;
  title: string;
  query: string;
  result: SqlResult | null;
  loading: boolean;
}

let nextId = 1;
function newTab(seed?: Partial<ConsoleTab>): ConsoleTab {
  return {
    id: nextId++,
    title: `콘솔 ${nextId - 1}`,
    query: "",
    result: null,
    loading: false,
    ...seed,
  };
}

export default function SqlConsolePopupPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tabs, setTabs] = useState<ConsoleTab[]>([newTab({ title: "콘솔 1" })]);
  const [activeId, setActiveId] = useState<number>(1);

  // 권한 체크
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setAuthed(!!(d.user && d.user.isAdmin <= 2)))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return <div className="p-8 text-center text-gray-400">권한 확인 중…</div>;
  }
  if (!authed) {
    return (
      <div className="p-8 text-center text-red-600">
        관리자 권한이 필요합니다. 메인 창에서 로그인 후 다시 여세요.
      </div>
    );
  }

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  function updateTab(id: number, patch: Partial<ConsoleTab>) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function addTab() {
    const t = newTab();
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
  }

  function closeTab(id: number) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) return [newTab({ title: "콘솔 1" })];
      return next;
    });
    if (activeId === id) {
      const idx = tabs.findIndex((t) => t.id === id);
      const fallback = tabs[idx - 1] ?? tabs[idx + 1] ?? tabs[0];
      setActiveId(fallback.id);
    }
  }

  async function executeQuery(tab: ConsoleTab) {
    const q = tab.query.trim();
    if (!q) return;
    if (/^\s*(DROP|TRUNCATE|DELETE)\s/i.test(q)) {
      if (!confirm(`파괴적 쿼리입니다. 실행할까요?\n\n${q}`)) return;
    }
    updateTab(tab.id, { loading: true, result: null });
    try {
      const res = await fetch("/api/admin/db/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      const result: SqlResult = data.error
        ? { type: "select", executionTime: 0, error: data.error }
        : data;
      updateTab(tab.id, { result, loading: false });
    } catch (e) {
      updateTab(tab.id, {
        result: { type: "select", executionTime: 0, error: String(e) },
        loading: false,
      });
    }
  }

  function resetTab(tab: ConsoleTab) {
    updateTab(tab.id, { query: "", result: null });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">SQL 콘솔 (팝업)</h1>
          <button
            onClick={addTab}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + 새 콘솔
          </button>
        </div>

        {/* 탭 헤더 */}
        <div className="flex flex-wrap gap-1 border-b border-gray-200">
          {tabs.map((t) => (
            <div
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`flex items-center gap-1 pl-3 pr-1 py-1.5 text-xs border border-b-0 rounded-t cursor-pointer ${
                t.id === active.id
                  ? "bg-white border-gray-200 text-blue-700 font-bold"
                  : "bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-700"
              }`}
            >
              <input
                value={t.title}
                onChange={(e) => updateTab(t.id, { title: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="bg-transparent w-24 text-xs outline-none"
              />
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  className="ml-1 px-1 text-gray-400 hover:text-red-600"
                  title="이 콘솔 닫기"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {/* 활성 콘솔 */}
        <ConsolePanel
          tab={active}
          onChange={(patch) => updateTab(active.id, patch)}
          onExecute={() => executeQuery(active)}
          onReset={() => resetTab(active)}
        />
      </div>
    </div>
  );
}

function ConsolePanel({
  tab,
  onChange,
  onExecute,
  onReset,
}: {
  tab: ConsoleTab;
  onChange: (patch: Partial<ConsoleTab>) => void;
  onExecute: () => void;
  onReset: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-3 border-b border-gray-100">
        <textarea
          ref={taRef}
          value={tab.query}
          onChange={(e) => onChange({ query: e.target.value })}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              onExecute();
            }
          }}
          placeholder="SQL 쿼리 입력 — Ctrl+Enter 실행"
          className="w-full h-32 px-2 py-1.5 text-xs font-mono border border-gray-300 rounded resize-y focus:outline-none focus:border-blue-500"
        />
        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onReset}
            className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
          >
            초기화
          </button>
          <button
            onClick={onExecute}
            disabled={tab.loading || !tab.query.trim()}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
          >
            {tab.loading ? "실행 중…" : "실행 (Ctrl+Enter)"}
          </button>
        </div>
      </div>

      {/* 결과 */}
      {tab.result && (
        <div>
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs">
            <span className="font-medium text-gray-700">
              {tab.result.error
                ? "오류"
                : tab.result.type === "select"
                ? `결과: ${tab.result.rowCount}행`
                : `실행 완료: ${tab.result.affectedRows}행 영향`}
            </span>
            <div className="flex items-center gap-2">
              {!tab.result.error &&
                tab.result.type === "select" &&
                tab.result.rows &&
                tab.result.rows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadSqlResultCsv(tab.result!, tab.title || "query")}
                    className="px-2 py-0.5 text-[10px] bg-emerald-600 text-white rounded hover:bg-emerald-700 inline-flex items-center gap-1"
                    title="결과를 CSV(엑셀) 파일로 다운로드"
                  >
                    엑셀 다운로드
                  </button>
                )}
              {!tab.result.error && (
                <span className="text-gray-400">{tab.result.executionTime}ms</span>
              )}
            </div>
          </div>
          {tab.result.error ? (
            <div className="p-3 text-xs text-red-600 bg-red-50 font-mono whitespace-pre-wrap">
              {tab.result.error}
            </div>
          ) : tab.result.type === "select" && tab.result.rows ? (
            <div className="overflow-auto max-h-[60vh]">
              <table className="text-xs w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {tab.result.columns?.map((col) => (
                      <th
                        key={col}
                        className="px-2 py-1.5 text-left font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tab.result.rows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      {tab.result!.columns?.map((col) => (
                        <td
                          key={col}
                          className="px-2 py-1 font-mono text-gray-700 whitespace-nowrap max-w-md truncate"
                          title={String(row[col] ?? "")}
                        >
                          {row[col] === null ? (
                            <span className="text-gray-400 italic">NULL</span>
                          ) : (
                            String(row[col])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
