"use client";

import { useEffect, useState, useCallback, useRef } from "react";

const OFFERING_TYPES = [
  "주일연보",
  "십일조연보",
  "감사연보",
  "특별연보",
  "오일연보",
  "절기연보",
] as const;
type OfferingType = (typeof OFFERING_TYPES)[number];

interface Entry {
  id: number; // 0 = 신규(미저장)
  date: string; // YYYY-MM-DD
  memberId: string; // 입력 편의 위해 string
  memberName: string;
  offeringType: string;
  amount: string;
  description: string;
  // 상태
  status: "saved" | "dirty" | "saving" | "error" | "deleting";
  message?: string;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const todayStr = () => {
  const d = new Date();
  const k = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return k.toISOString().slice(0, 10);
};
const monthAgoStr = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const k = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return k.toISOString().slice(0, 10);
};

interface Props {
  /** 특정 연보종류로 잠가서 편집 (selectType=false 인 경우) */
  fixedType?: OfferingType;
  /** 화면에서 연보종류 셀렉터를 보일지 (전체 편집 페이지) */
  showTypeColumn: boolean;
}

export default function BulkEditor({ fixedType, showTypeColumn }: Props) {
  const [dateFrom, setDateFrom] = useState(monthAgoStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [typeFilter, setTypeFilter] = useState<OfferingType | "all">(
    fixedType ?? "all",
  );
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 행간 화살표 이동 — 각 셀(input/select) 의 ref 를 [row][col] 에 저장.
  // col 순서: 일자(0) / 관리번호(1) / [연보종류(2)] / 금액 / 비고
  const cellRefs = useRef<Array<Array<HTMLElement | null>>>([]);
  const colCount = showTypeColumn ? 5 : 4;
  const setCellRef = (row: number, col: number) => (el: HTMLElement | null) => {
    if (!cellRefs.current[row]) cellRefs.current[row] = [];
    cellRefs.current[row][col] = el;
  };
  const focusCell = (row: number, col: number) => {
    const r = Math.max(0, Math.min(rows.length - 1, row));
    const c = Math.max(0, Math.min(colCount - 1, col));
    const el = cellRefs.current[r]?.[c];
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement) el.select();
    }
  };
  const onCellKeyDown = (
    e: React.KeyboardEvent<HTMLElement>,
    row: number,
    col: number,
  ) => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      // 마지막 행에서 ↓ 누르면 새 빈 행 추가 후 그 행으로 이동
      if (row === rows.length - 1) {
        setRows((prev) => [...prev, blankRow(fixedType)]);
        // 다음 tick 에 새 행에 ref 가 등록되므로 setTimeout
        setTimeout(() => focusCell(row + 1, col), 0);
      } else {
        focusCell(row + 1, col);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(row - 1, col);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
      });
      if (typeFilter !== "all") params.set("offeringType", typeFilter);
      const res = await fetch(`/api/accounting/offering/entries?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      const list = (Array.isArray(data) ? data : data.entries || []) as Array<{
        id: number;
        date: string;
        memberId: number | null;
        member: { name: string } | null;
        offeringType: string;
        amount: number;
        description: string | null;
      }>;
      const mapped: Entry[] = list.map((e) => ({
        id: e.id,
        date: e.date.slice(0, 10),
        memberId: e.memberId != null ? String(e.memberId) : "",
        memberName: e.member?.name ?? "",
        offeringType: e.offeringType,
        amount: String(e.amount),
        description: e.description ?? "",
        status: "saved",
      }));
      // 끝에 빈 행 1개 (신규 입력용)
      mapped.push(blankRow(fixedType));
      setRows(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, typeFilter, fixedType]);

  useEffect(() => {
    load();
  }, [load]);

  const updateField = (idx: number, field: keyof Entry, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value, status: "dirty" };
      return next;
    });
  };

  const lookupMember = async (idx: number) => {
    const r = rows[idx];
    const id = parseInt(r.memberId.trim(), 10);
    if (!Number.isFinite(id) || id <= 0) {
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], memberName: "" };
        return next;
      });
      return;
    }
    try {
      const res = await fetch(`/api/accounting/offering/members/${id}`);
      const name =
        res.status === 404 ? "(미등록)" : res.ok ? (await res.json()).name || "(미등록)" : "(오류)";
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], memberName: name };
        return next;
      });
    } catch {
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], memberName: "(미등록)" };
        return next;
      });
    }
  };

  const saveRow = async (idx: number) => {
    const r = rows[idx];
    const amt = parseInt(r.amount.replace(/[^\d-]/g, ""), 10);
    if (!Number.isFinite(amt) || amt <= 0) {
      setRows((prev) => {
        const n = [...prev];
        n[idx] = { ...n[idx], status: "error", message: "금액 > 0" };
        return n;
      });
      return;
    }
    const mid = r.memberId.trim() === "" ? null : parseInt(r.memberId, 10);
    setRows((prev) => {
      const n = [...prev];
      n[idx] = { ...n[idx], status: "saving", message: undefined };
      return n;
    });
    try {
      if (r.id === 0) {
        // 신규
        const res = await fetch("/api/accounting/offering/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: [
              {
                date: r.date,
                memberId: mid,
                offeringType: r.offeringType,
                amount: amt,
                description: r.description || null,
              },
            ],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "저장 실패");
        const newId = data.entries?.[0]?.id ?? 0;
        setRows((prev) => {
          const n = [...prev];
          n[idx] = { ...n[idx], id: newId, status: "saved", message: "저장됨" };
          // 새 빈 행 추가
          if (idx === n.length - 1) n.push(blankRow(fixedType));
          return n;
        });
      } else {
        // 수정
        const res = await fetch(`/api/accounting/offering/entries/${r.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: r.date,
            memberId: mid,
            offeringType: r.offeringType,
            amount: amt,
            description: r.description || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "저장 실패");
        setRows((prev) => {
          const n = [...prev];
          n[idx] = { ...n[idx], status: "saved", message: "저장됨" };
          return n;
        });
      }
    } catch (e) {
      setRows((prev) => {
        const n = [...prev];
        n[idx] = {
          ...n[idx],
          status: "error",
          message: e instanceof Error ? e.message : "저장 실패",
        };
        return n;
      });
    }
  };

  const deleteRow = async (idx: number) => {
    const r = rows[idx];
    if (r.id === 0) {
      // 신규 — 그냥 행 제거
      setRows((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    if (!confirm(`삭제할까요?\n일자: ${r.date}, 금액: ${fmt(parseInt(r.amount, 10) || 0)}`))
      return;
    setRows((prev) => {
      const n = [...prev];
      n[idx] = { ...n[idx], status: "deleting" };
      return n;
    });
    try {
      const res = await fetch(`/api/accounting/offering/entries/${r.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "삭제 실패");
      }
      setRows((prev) => prev.filter((_, i) => i !== idx));
    } catch (e) {
      setRows((prev) => {
        const n = [...prev];
        n[idx] = {
          ...n[idx],
          status: "error",
          message: e instanceof Error ? e.message : "삭제 실패",
        };
        return n;
      });
    }
  };

  const saveAllDirty = async () => {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].status === "dirty") {
        await saveRow(i);
      }
    }
  };

  const totalAmount = rows
    .filter((r) => r.id > 0 && r.status !== "deleting")
    .reduce((s, r) => s + (parseInt(r.amount, 10) || 0), 0);

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">시작일</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">종료일</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        {!fixedType && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">연보종류</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as OfferingType | "all")}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="all">전체</option>
              {OFFERING_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}
        {fixedType && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">연보종류</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as OfferingType | "all")}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              {OFFERING_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-700 disabled:opacity-50"
        >
          조회
        </button>
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, blankRow(fixedType)])}
          disabled={loading}
          className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          + 줄 추가
        </button>
        <button
          type="button"
          onClick={saveAllDirty}
          disabled={loading || !rows.some((r) => r.status === "dirty")}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          변경분 일괄저장
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 표 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-2 py-2 text-left font-medium w-32">일자</th>
              <th className="px-2 py-2 text-left font-medium w-20">관리번호</th>
              <th className="px-2 py-2 text-left font-medium w-24">성명</th>
              {showTypeColumn && (
                <th className="px-2 py-2 text-left font-medium w-28">연보종류</th>
              )}
              <th className="px-2 py-2 text-right font-medium w-32">금액</th>
              <th className="px-2 py-2 text-left font-medium">비고</th>
              <th className="px-2 py-2 w-24 text-center font-medium">작업</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showTypeColumn ? 7 : 6} className="px-3 py-6 text-center text-gray-400">
                  조회된 내역 없음
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => {
                const isNew = r.id === 0;
                return (
                  <tr
                    key={`${r.id}-${idx}`}
                    className={`border-b last:border-b-0 ${
                      isNew ? "bg-yellow-50" : r.status === "dirty" ? "bg-orange-50" : ""
                    }`}
                  >
                    <td className="px-2 py-1">
                      <input
                        ref={setCellRef(idx, 0)}
                        type="date"
                        value={r.date}
                        onChange={(e) => updateField(idx, "date", e.target.value)}
                        onKeyDown={(e) => onCellKeyDown(e, idx, 0)}
                        className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-sm"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        ref={setCellRef(idx, 1)}
                        type="text"
                        inputMode="numeric"
                        value={r.memberId}
                        onChange={(e) =>
                          updateField(idx, "memberId", e.target.value.replace(/[^\d]/g, ""))
                        }
                        onBlur={() => lookupMember(idx)}
                        onKeyDown={(e) => onCellKeyDown(e, idx, 1)}
                        placeholder="0"
                        className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-sm text-right"
                      />
                    </td>
                    <td className="px-2 py-1 text-xs text-gray-700">{r.memberName}</td>
                    {showTypeColumn && (
                      <td className="px-2 py-1">
                        <select
                          ref={setCellRef(idx, 2)}
                          value={r.offeringType}
                          onChange={(e) => updateField(idx, "offeringType", e.target.value)}
                          onKeyDown={(e) => onCellKeyDown(e, idx, 2)}
                          className="w-full rounded border border-gray-200 px-1 py-0.5 text-sm"
                        >
                          {OFFERING_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td className="px-2 py-1">
                      <input
                        ref={setCellRef(idx, showTypeColumn ? 3 : 2)}
                        type="text"
                        inputMode="numeric"
                        value={
                          r.amount === "" || r.amount === "0"
                            ? r.amount
                            : (parseInt(r.amount, 10) || 0).toLocaleString()
                        }
                        onChange={(e) =>
                          updateField(idx, "amount", e.target.value.replace(/[^\d]/g, ""))
                        }
                        onKeyDown={(e) => onCellKeyDown(e, idx, showTypeColumn ? 3 : 2)}
                        placeholder="0"
                        className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-sm text-right font-mono"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        ref={setCellRef(idx, showTypeColumn ? 4 : 3)}
                        type="text"
                        value={r.description}
                        onChange={(e) => updateField(idx, "description", e.target.value)}
                        onKeyDown={(e) => onCellKeyDown(e, idx, showTypeColumn ? 4 : 3)}
                        className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-sm"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center justify-center gap-1">
                        {r.status === "saving" || r.status === "deleting" ? (
                          <span className="text-xs text-gray-500">...</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => saveRow(idx)}
                              disabled={r.status === "saved" && !isNew}
                              className="rounded px-1.5 py-0.5 text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-30"
                              title="저장"
                            >
                              ✓
                            </button>
                            {!isNew && (
                              <button
                                type="button"
                                onClick={() => deleteRow(idx)}
                                className="rounded px-1.5 py-0.5 text-xs text-white bg-red-500 hover:bg-red-600"
                                title="삭제"
                              >
                                ✕
                              </button>
                            )}
                          </>
                        )}
                        {r.message && (
                          <span
                            className={`ml-1 text-[10px] ${
                              r.status === "error" ? "text-red-600" : "text-green-600"
                            }`}
                            title={r.message}
                          >
                            {r.status === "error" ? "!" : "✓"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.some((r) => r.id > 0) && (
            <tfoot>
              <tr className="border-t-2 bg-gray-100 font-semibold">
                <td colSpan={showTypeColumn ? 4 : 3} className="px-2 py-2 text-right">
                  합계
                </td>
                <td className="px-2 py-2 text-right text-blue-700">
                  {fmt(totalAmount)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="text-xs text-gray-500">
        ※ 노란 배경 = 신규 행, 주황 배경 = 변경됨(저장 필요). 각 행의 ✓ 로 저장, ✕ 로 삭제.
        일자도 셀에서 수정 가능. ↑↓ 또는 Enter 로 같은 컬럼 위/아래 행 이동, 마지막 행에서
        ↓ 누르면 빈 행이 자동 추가됨. 상단 "+ 줄 추가" 로도 즉시 행 생성 가능.
      </div>
    </div>
  );
}

function blankRow(fixedType?: OfferingType): Entry {
  return {
    id: 0,
    date: todayStr(),
    memberId: "",
    memberName: "",
    offeringType: fixedType ?? "주일연보",
    amount: "",
    description: "",
    status: "dirty",
  };
}
