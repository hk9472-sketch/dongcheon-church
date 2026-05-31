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
  amounts: Record<string, string>;       // TYPES.key → 입력 문자열
  savedIds: Record<string, number>;      // TYPES.key → OfferingEntry.id (저장 후 보관, 수정/삭제용)
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
    savedIds: {},
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
    const noTrim = r.memberNo.trim();
    const memberId = noTrim ? parseInt(noTrim, 10) : null;
    const memberIdForBody =
      memberId !== null && Number.isFinite(memberId) ? memberId : null;

    // 종류별로 (id 있음/없음) × (금액 > 0 / = 0) 4 분기 분류
    const toCreate: { offeringType: string; amount: number }[] = [];
    const toUpdate: { id: number; offeringType: string; amount: number }[] = [];
    const toDelete: { id: number; offeringType: string }[] = [];
    for (const t of TYPES) {
      const amt = parseInt(r.amounts[t.key] || "0", 10) || 0;
      const existingId = r.savedIds[t.key];
      if (existingId && amt > 0) {
        toUpdate.push({ id: existingId, offeringType: t.key, amount: amt });
      } else if (existingId && amt === 0) {
        toDelete.push({ id: existingId, offeringType: t.key });
      } else if (!existingId && amt > 0) {
        toCreate.push({ offeringType: t.key, amount: amt });
      }
      // 그 외(!existingId && amt===0): no-op
    }

    if (toCreate.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
      setRows((p) => {
        const n = [...p];
        n[idx] = { ...n[idx], status: "error", message: "변경된 항목 없음" };
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
      const newIds: Record<string, number> = { ...r.savedIds };

      // 1) DELETE
      for (const d of toDelete) {
        const res = await fetch(`/api/accounting/offering/entries/${d.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `${d.offeringType} 삭제 실패`);
        }
        delete newIds[d.offeringType];
      }

      // 2) UPDATE
      for (const u of toUpdate) {
        const res = await fetch(`/api/accounting/offering/entries/${u.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            memberId: memberIdForBody,
            offeringType: u.offeringType,
            amount: u.amount,
            description: r.description || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `${u.offeringType} 수정 실패`);
        }
      }

      // 3) CREATE — 배치
      if (toCreate.length > 0) {
        const res = await fetch("/api/accounting/offering/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            entries: toCreate.map((c) => ({
              date,
              memberId: memberIdForBody,
              offeringType: c.offeringType,
              amount: c.amount,
              description: r.description || null,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "저장 실패");
        // 응답의 entries 배열에서 id 매핑
        const createdArr: Array<{ id: number; offeringType: string }> =
          data.entries || [];
        for (const c of createdArr) {
          if (c.id && c.offeringType) newIds[c.offeringType] = c.id;
        }
      }

      const summary = [
        toCreate.length > 0 ? `신규 ${toCreate.length}` : null,
        toUpdate.length > 0 ? `수정 ${toUpdate.length}` : null,
        toDelete.length > 0 ? `삭제 ${toDelete.length}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      setRows((p) => {
        const n = [...p];
        n[idx] = {
          ...n[idx],
          savedIds: newIds,
          status: "saved",
          message: summary || "저장됨",
        };
        if (!savingAllRef.current && idx === n.length - 1) n.push(blankRow());
        return n;
      });
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
      // 결과 요약 — 가장 최신 rows 상태를 확인해 알림
      setRows((p) => {
        const errCount = p.filter((r) => r.status === "error").length;
        const savedCount = p.filter((r) => r.status === "saved").length;
        if (errCount > 0) {
          setError(
            `전체 저장 완료 — 성공 ${savedCount}건, 실패 ${errCount}건. ` +
              `빨간 행의 [저장] 을 다시 누르거나 [전체 저장] 으로 재시도하세요.`,
          );
        } else if (savedCount > 0) {
          setError(null);
        }
        return p;
      });
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
    if (e.key === "Enter") {
      // Enter: 다음 줄의 첫 칸(개인번호) 으로 이동 — 다음 행 입력 시작
      e.preventDefault();
      if (row === rows.length - 1) {
        setRows((p) => [...p, blankRow()]);
        setTimeout(() => focusCell(row + 1, 0), 0);
      } else {
        focusCell(row + 1, 0);
      }
    } else if (e.key === "ArrowDown") {
      // ↓: 같은 컬럼 다음 행 (세로 이동)
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
          ↑↓ ← → 로 셀 이동. <strong>Enter</strong> 는 다음 줄의 개인번호 칸으로 점프 (새 행 자동 추가).
          [+ 줄 추가] 또는 [전체 저장] 으로 한꺼번에 입력·저장. 실패한 행만 다시 [저장] 가능.
          <br />
          ※ <strong className="text-green-700">저장된 행(초록)</strong> 도 수정·삭제 가능합니다. 금액 변경 후 [저장] 누르면 그 종류만 수정, 0 으로 비우고 [저장] 누르면 그 종류만 삭제됩니다 (id 기반 PUT/DELETE).
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
              const hasSavedIds = Object.keys(r.savedIds).length > 0;
              // 입력은 항상 열려 있고, saved 상태에서 수정하면 status=dirty 로 자연 전환.
              // 저장 시 종류별로 신규/수정/삭제 분기 처리 (saveRow).
              const cellClass = "w-full rounded border border-gray-200 px-1.5 py-0.5 text-right font-mono";
              const cellClassDesc = "w-full rounded border border-gray-200 px-1.5 py-0.5";
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
                      className={cellClass}
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
                        className={cellClass}
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
                      className={cellClassDesc}
                    />
                  </td>
                  <td className="px-2 py-1 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => saveRow(idx)}
                        disabled={r.status === "saving" || (rowSum === 0 && !hasSavedIds)}
                        className="w-12 rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                        title={hasSavedIds ? "수정·삭제 가능" : "신규 저장"}
                      >
                        {r.status === "saving" ? "..." : "저장"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        disabled={rows.length === 1 || hasSavedIds}
                        className="w-8 rounded bg-gray-300 px-1 py-0.5 text-xs text-white hover:bg-gray-400 disabled:opacity-30"
                        title={hasSavedIds ? "DB 에 저장된 행 — 금액을 0 으로 비우고 [저장] 누르면 해당 종류 삭제" : "화면에서 행 제거"}
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
              {/* 개인번호 칸 아래 — '종류별 합계' 라벨 */}
              <td className="px-2 py-2 text-center text-gray-600">종류별 합계</td>
              {TYPES.map((t) => (
                <td key={t.key} className="px-2 py-2 text-right text-indigo-700 font-mono">
                  {totalsPerType[t.key] > 0 ? fmt(totalsPerType[t.key]) : ""}
                </td>
              ))}
              {/* 비고 + 작업 칸 합쳐서 총계 표시 */}
              <td colSpan={2} className="px-2 py-2 text-right">
                <span className="text-gray-600 mr-2">총계</span>
                <span className="text-indigo-800 font-mono text-sm">{fmt(grandTotal)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
