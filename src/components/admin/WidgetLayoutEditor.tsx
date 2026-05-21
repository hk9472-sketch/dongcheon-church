"use client";

import { useEffect, useState } from "react";

interface Item {
  key: string;
  title: string;
  special: boolean;
  showOnMain?: boolean;
}

type Cell = string[];
type Row = [Cell, Cell, Cell];
type Layout = Row[];

export default function WidgetLayoutEditor() {
  const [layout, setLayout] = useState<Layout>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // 게시판 선택 모달 — 어느 셀에 추가할지
  const [pickerFor, setPickerFor] = useState<{ row: number; col: number } | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/widget-layout");
      const data = await res.json();
      if (res.ok) {
        setLayout(data.layout);
        setItems(data.items);
      } else {
        setMsg({ type: "err", text: data.message || "조회 실패" });
      }
    } catch {
      setMsg({ type: "err", text: "네트워크 오류" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const itemMap = new Map(items.map((i) => [i.key, i]));

  const setCell = (row: number, col: number, cell: Cell) => {
    setLayout((prev) => {
      const next = prev.map((r) => [...r] as Row);
      next[row][col] = cell;
      return next;
    });
  };

  const addToCell = (row: number, col: number, key: string) => {
    const cur = layout[row][col];
    if (cur.includes(key)) return; // 중복 금지
    setCell(row, col, [...cur, key]);
    setPickerFor(null);
    setPickerQuery("");
  };

  const removeFromCell = (row: number, col: number, key: string) => {
    setCell(
      row,
      col,
      layout[row][col].filter((k) => k !== key),
    );
  };

  const moveInCell = (row: number, col: number, idx: number, dir: -1 | 1) => {
    const cell = [...layout[row][col]];
    const j = idx + dir;
    if (j < 0 || j >= cell.length) return;
    [cell[idx], cell[j]] = [cell[j], cell[idx]];
    setCell(row, col, cell);
  };

  const addRow = () => {
    setLayout((prev) => [...prev, [[], [], []] as Row]);
  };

  const removeRow = (row: number) => {
    if (layout.length <= 1) return;
    if (!confirm(`${row + 1} 번째 행을 삭제할까요?`)) return;
    setLayout((prev) => prev.filter((_, i) => i !== row));
  };

  const moveRow = (row: number, dir: -1 | 1) => {
    const j = row + dir;
    if (j < 0 || j >= layout.length) return;
    setLayout((prev) => {
      const next = [...prev];
      [next[row], next[j]] = [next[j], next[row]];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/widget-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ type: "ok", text: "저장됨. 메인 페이지에 적용됩니다." });
      } else {
        setMsg({ type: "err", text: data.message || "저장 실패" });
      }
    } catch {
      setMsg({ type: "err", text: "네트워크 오류" });
    } finally {
      setSaving(false);
    }
  };

  const resetDefault = async () => {
    if (!confirm("레이아웃을 기본값으로 복원할까요?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/widget-layout", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setLayout(data.layout);
        setMsg({ type: "ok", text: "기본값으로 복원됨" });
      } else {
        setMsg({ type: "err", text: data.message || "복원 실패" });
      }
    } catch {
      setMsg({ type: "err", text: "네트워크 오류" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-400">레이아웃 불러오는 중...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">메인 페이지 위젯 레이아웃</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            3열 × N행. 한 칸에 2개 이상 추가하면 <strong>탭 형식</strong>으로 묶여 표시됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetDefault}
            disabled={saving}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
          >
            기본값 복원
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-semibold"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`px-5 py-2 text-sm ${
            msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="p-4 space-y-2">
        {layout.map((row, rIdx) => (
          <div key={rIdx} className="flex items-stretch gap-1">
            {/* 행 번호 + 컨트롤 */}
            <div className="w-9 flex flex-col items-center justify-center gap-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-500">
              <div className="font-bold">{rIdx + 1}</div>
              <button
                type="button"
                onClick={() => moveRow(rIdx, -1)}
                disabled={rIdx === 0}
                className="hover:text-blue-600 disabled:opacity-20"
                title="위로"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => moveRow(rIdx, 1)}
                disabled={rIdx === layout.length - 1}
                className="hover:text-blue-600 disabled:opacity-20"
                title="아래로"
              >
                ▼
              </button>
              <button
                type="button"
                onClick={() => removeRow(rIdx)}
                disabled={layout.length <= 1}
                className="hover:text-red-600 disabled:opacity-20 text-[10px]"
                title="행 삭제"
              >
                ✕
              </button>
            </div>

            {/* 3 셀 */}
            <div className="grid grid-cols-3 gap-1 flex-1">
              {row.map((cell, cIdx) => (
                <div
                  key={cIdx}
                  className="border border-dashed border-gray-300 rounded p-2 bg-gray-50/50 min-h-[5rem]"
                >
                  <div className="space-y-1">
                    {cell.length === 0 && (
                      <div className="text-xs text-gray-400 italic py-1">(비어 있음)</div>
                    )}
                    {cell.map((key, kIdx) => {
                      const item = itemMap.get(key);
                      const label = item?.title || key;
                      const isSpecial = item?.special;
                      const missing = !item;
                      return (
                        <div
                          key={key}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs border ${
                            missing
                              ? "bg-red-50 border-red-300 text-red-700"
                              : isSpecial
                              ? "bg-amber-50 border-amber-300 text-amber-800"
                              : "bg-white border-gray-300 text-gray-700"
                          }`}
                        >
                          <span className="flex-1 truncate" title={key}>
                            {label}
                            {missing && " (없음)"}
                          </span>
                          <button
                            type="button"
                            onClick={() => moveInCell(rIdx, cIdx, kIdx, -1)}
                            disabled={kIdx === 0}
                            className="text-gray-400 hover:text-blue-600 disabled:opacity-20"
                            title="앞으로"
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            onClick={() => moveInCell(rIdx, cIdx, kIdx, 1)}
                            disabled={kIdx === cell.length - 1}
                            className="text-gray-400 hover:text-blue-600 disabled:opacity-20"
                            title="뒤로"
                          >
                            ▶
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromCell(rIdx, cIdx, key)}
                            className="text-gray-400 hover:text-red-600"
                            title="제거"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setPickerFor({ row: rIdx, col: cIdx });
                        setPickerQuery("");
                      }}
                      className="w-full px-2 py-1 text-xs border border-gray-300 border-dashed rounded text-gray-500 hover:bg-white hover:text-blue-600 hover:border-blue-400"
                    >
                      + 게시판 추가
                    </button>
                  </div>
                  {cell.length >= 2 && (
                    <div className="mt-1 text-[10px] text-blue-600 font-semibold text-center">
                      📑 {cell.length}개 탭
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="w-full py-2 text-sm border border-dashed border-gray-300 rounded text-gray-500 hover:bg-gray-50 hover:text-blue-600 hover:border-blue-400"
        >
          + 행 추가
        </button>
      </div>

      {/* 게시판 선택 모달 */}
      {pickerFor && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setPickerFor(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2 bg-blue-600 text-white rounded-t-lg flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {pickerFor.row + 1}행 {pickerFor.col + 1}열 — 항목 추가
              </h3>
              <button onClick={() => setPickerFor(null)} className="text-xs">
                ✕
              </button>
            </div>
            <div className="px-3 py-2 border-b border-gray-200">
              <input
                type="text"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="이름 또는 slug 검색"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {(() => {
                const cur = pickerFor ? layout[pickerFor.row][pickerFor.col] : [];
                const filtered = items.filter((it) => {
                  if (cur.includes(it.key)) return false;
                  if (!pickerQuery) return true;
                  const q = pickerQuery.toLowerCase();
                  return (
                    it.title.toLowerCase().includes(q) ||
                    it.key.toLowerCase().includes(q)
                  );
                });
                return (
                  <ul className="divide-y divide-gray-100">
                    {filtered.map((it) => (
                      <li
                        key={it.key}
                        onClick={() => addToCell(pickerFor.row, pickerFor.col, it.key)}
                        className={`px-3 py-2 cursor-pointer hover:bg-blue-50 flex items-center justify-between text-sm ${
                          it.special ? "bg-amber-50/40" : ""
                        }`}
                      >
                        <span>
                          <strong>{it.title}</strong>
                          <span className="ml-2 text-[10px] text-gray-400 font-mono">
                            {it.key}
                          </span>
                        </span>
                        {it.special && (
                          <span className="text-[10px] text-amber-600 font-semibold">
                            특수
                          </span>
                        )}
                      </li>
                    ))}
                    {filtered.length === 0 && (
                      <li className="px-3 py-6 text-center text-sm text-gray-400">
                        일치하는 항목 없음
                      </li>
                    )}
                  </ul>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
