"use client";

import { useRef, useState } from "react";
import HelpButton from "@/components/HelpButton";

// 한 행에 여러 연보 종류 동시 입력. 빈 칸(0)은 저장 안 함.
// 종류별로 OfferingEntry 1건씩 분할 저장.
const TYPES = [
  { key: "주일연보", label: "주일" },
  { key: "십일조연보", label: "십일조" },
  { key: "감사연보", label: "감사" },
  { key: "특별연보", label: "특별" },
  { key: "오일연보", label: "오일" },
  { key: "절기연보", label: "절기" },
] as const;

type RowStatus = "dirty" | "saving" | "saved" | "error";

interface Row {
  memberNo: string;
  amounts: Record<string, string>; // TYPES.key → 입력 문자열
  description: string;
  status: RowStatus;
  message?: string;
}

function todayStr(): string {
  const d = new Date();
  const k = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return k.toISOString().slice(0, 10);
}

function blankRow(): Row {
  return {
    memberNo: "",
    amounts: Object.fromEntries(TYPES.map((t) => [t.key, ""])),
    description: "",
    status: "dirty",
  };
}

export default function MultiOfferingEntryPage() {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [error, setError] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  // 셀 참조: cellRefs[row][col] — col 0 = memberNo, 1~6 = 6개 종류 금액, 7 = 비고
  const cellRefs = useRef<Array<Array<HTMLInputElement | null>>>([]);
  const COLS_PER_ROW = 1 + TYPES.length + 1; // = 8
  // saveAll 진행 중에는 자동 행 추가·포커스 이동을 막아 흐름이 깨지지 않게 함
  const savingAllRef = useRef(false);

  const update = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch, status: "dirty" };
      return next;
    });
  };

  const updateAmount = (idx: number, key: string, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        amounts: { ...next[idx].amounts, [key]: value.replace(/[^\d]/g, "") },
        status: "dirty",
      };
      return next;
    });
  };

  const saveRow = async (idx: number) => {
    const r = rows[idx];
    // 0 보다 큰 amount 가 있는 종류만 entry 로
    // memberId 는 입력한 개인번호를 그대로 사용 (성명 조회 안 함, soft FK 라 미등록도 허용)
    const noTrim = r.memberNo.trim();
    const memberId = noTrim ? parseInt(noTrim, 10) : null;
    const entries = TYPES.flatMap((t) => {
      const n = parseInt(r.amounts[t.key] || "0", 10);
      if (!Number.isFinite(n) || n <= 0) return [];
      return [
        {
          date,
          memberId: memberId && Number.isFinite(memberId) ? memberId : null,
          offeringType: t.key,
          amount: n,
          description: r.description || null,
        },
      ];
    });

    if (entries.length === 0) {
      setRows((p) => {
        const n = [...p];
        n[idx] = { ...n[idx], status: "error", message: "금액 입력 없음" };
        return n;
      });
      return;
    }

    setRows((p) => {
      const n = [...p];
      n[idx] = { ...n[idx], status: "saving", message: undefined };
      return n;
    });

    try {
      const res = await fetch("/api/accounting/offering/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      setRows((p) => {
        const n = [...p];
        n[idx] = {
          ...n[idx],
          status: "saved",
          message: `저장됨 (${entries.length}건)`,
        };
        // 일괄 저장 중에는 자동 행 추가 안 함 (행 인덱스가 흔들려 다음 행 저장이 어긋남)
        if (!savingAllRef.current && idx === n.length - 1) n.push(blankRow());
        return n;
      });
      // 일괄 저장 중에는 포커스 이동도 안 함 (다른 행 input 으로 옮겨가면서
      // 사용자의 입력 흐름이 끊기는 현상 방지)
      if (!savingAllRef.current) {
        setTimeout(() => {
          cellRefs.current[idx + 1]?.[0]?.focus();
          cellRefs.current[idx + 1]?.[0]?.select();
        }, 0);
      }
    } catch (e) {
      setRows((p) => {
        const n = [...p];
        n[idx] = {
          ...n[idx],
          status: "error",
          message: e instanceof Error ? e.message : "저장 실패",
        };
        return n;
      });
    }
  };

  const saveAll = async () => {
    setSavingAll(true);
    savingAllRef.current = true;
    setError(null);
    try {
      const dirtyIdx = rows
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.status === "dirty" || r.status === "error")
        .map(({ i }) => i);
      for (const idx of dirtyIdx) {
        // 빈 행 건너뜀 (금액도 없음)
        const r = rows[idx];
        const hasAmount = TYPES.some((t) => (parseInt(r.amounts[t.key] || "0", 10) || 0) > 0);
        if (!hasAmount) continue;
        await saveRow(idx);
      }
    } finally {
      savingAllRef.current = false;
      setSavingAll(false);
    }
  };

  // ============ 셀 참조 + 화살표 키 이동 ============
  const setCellRef = (row: number, col: number) => (el: HTMLInputElement | null) => {
    if (!cellRefs.current[row]) cellRefs.current[row] = [];
    cellRefs.current[row][col] = el;
  };
  const focusCell = (row: number, col: number) => {
    const el = cellRefs.current[row]?.[col];
    if (el) {
      el.focus();
      el.select?.();
    }
  };
  const onCellKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      if (row === rows.length - 1) {
        setRows((p) => [...p, blankRow()]);
        setTimeout(() => focusCell(row + 1, col), 0);
      } else {
        focusCell(row + 1, col);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(row - 1, col);
    } else if (e.key === "ArrowLeft") {
      const input = e.currentTarget;
      if (input.selectionStart === 0) {
        e.preventDefault();
        focusCell(row, col - 1);
      }
    } else if (e.key === "ArrowRight") {
      const input = e.currentTarget;
      if (input.selectionStart === input.value.length) {
        e.preventDefault();
        focusCell(row, col + 1);
      }
    }
  };

  const addRow = () => setRows((p) => [...p, blankRow()]);
  const removeRow = (idx: number) => {
    if (rows.length === 1) return;
    setRows((p) => p.filter((_, i) => i !== idx));
  };

  const totalsPerType: Record<string, number> = Object.fromEntries(
    TYPES.map((t) => [
      t.key,
      rows.reduce((s, r) => s + (parseInt(r.amounts[t.key] || "0", 10) || 0), 0),
    ]),
  );
  const grandTotal = Object.values(totalsPerType).reduce((s, n) => s + n, 0);
  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          연보 통합 입력
          <HelpButton slug="acc-offering-multi-entry" />
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          한 회원의 여러 종류 연보를 한 줄에 입력합니다. 0 이거나 빈 칸인 종류는
          저장되지 않고, 입력된 종류만 각각의 연보 항목으로 저장됩니다.
          키보드 ↑↓←→ 로 셀 이동, 마지막 행에서 ↓/Enter 누르면 새 빈 행 추가.
          [+ 줄 추가] 또는 [전체 저장] 으로 한꺼번에 입력·저장 가능.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 공통 날짜 */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">연보 일자</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={saveAll}
          disabled={savingAll}
          className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {savingAll ? "저장 중..." : "전체 저장"}
        </button>
        <button
          type="button"
          onClick={addRow}
          className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          + 줄 추가
        </button>
      </div>

      {/* 매트릭스 입력 표 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-2 py-2 text-left font-medium w-20">개인번호</th>
              {TYPES.map((t) => (
                <th key={t.key} className="px-2 py-2 text-right font-medium w-24">
                  {t.label}
                </th>
              ))}
              <th className="px-2 py-2 text-left font-medium">비고</th>
              <th className="px-2 py-2 w-24 text-center font-medium">작업</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const rowSum = TYPES.reduce(
                (s, t) => s + (parseInt(r.amounts[t.key] || "0", 10) || 0),
                0,
              );
              return (
                <tr
                  key={idx}
                  className={`border-b last:border-b-0 ${
                    r.status === "dirty"
                      ? "bg-orange-50/40"
                      : r.status === "saved"
                      ? "bg-green-50/40"
                      : r.status === "error"
                      ? "bg-red-50/40"
                      : ""
                  }`}
                >
                  <td className="px-2 py-1">
                    <input
                      ref={setCellRef(idx, 0)}
                      type="text"
                      inputMode="numeric"
                      value={r.memberNo}
                      onChange={(e) =>
                        update(idx, { memberNo: e.target.value.replace(/[^\d]/g, "") })
                      }
                      onKeyDown={(e) => onCellKey(e, idx, 0)}
                      placeholder="번호"
                      className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-right font-mono"
                    />
                  </td>
                  {TYPES.map((t, tIdx) => (
                    <td key={t.key} className="px-2 py-1">
                      <input
                        ref={setCellRef(idx, 1 + tIdx)}
                        type="text"
                        inputMode="numeric"
                        value={
                          r.amounts[t.key] === ""
                            ? ""
                            : (parseInt(r.amounts[t.key], 10) || 0).toLocaleString()
                        }
                        onChange={(e) => updateAmount(idx, t.key, e.target.value)}
                        onKeyDown={(e) => onCellKey(e, idx, 1 + tIdx)}
                        placeholder="0"
                        className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-right font-mono"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1">
                    <input
                      ref={setCellRef(idx, COLS_PER_ROW - 1)}
                      type="text"
                      value={r.description}
                      onChange={(e) => update(idx, { description: e.target.value })}
                      onKeyDown={(e) => onCellKey(e, idx, COLS_PER_ROW - 1)}
                      className="w-full rounded border border-gray-200 px-1.5 py-0.5"
                    />
                  </td>
                  <td className="px-2 py-1 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => saveRow(idx)}
                        disabled={r.status === "saving" || rowSum === 0}
                        className="w-12 rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {r.status === "saving" ? "..." : "저장"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        disabled={rows.length === 1}
                        className="w-8 rounded bg-gray-300 px-1 py-0.5 text-xs text-white hover:bg-gray-400 disabled:opacity-30"
                      >
                        ✕
                      </button>
                    </div>
                    {r.message && (
                      <div
                        className={`text-[10px] mt-0.5 ${
                          r.status === "error" ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {r.message}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-gray-100 font-semibold text-xs">
              <td colSpan={2} className="px-2 py-2 text-right">
                종류별 합계
              </td>
              {TYPES.map((t) => (
                <td key={t.key} className="px-2 py-2 text-right text-indigo-700 font-mono">
                  {totalsPerType[t.key] > 0 ? fmt(totalsPerType[t.key]) : ""}
                </td>
              ))}
              <td className="px-2 py-2 text-right">총계</td>
              <td className="px-2 py-2 text-right text-indigo-800 font-mono">
                {fmt(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
