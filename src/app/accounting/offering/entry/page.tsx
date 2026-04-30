"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccountPerms } from "@/lib/useAccountPerms";
import HelpButton from "@/components/HelpButton";

/* ───── constants ───── */
const OFFERING_TYPES = [
  "주일연보",
  "십일조연보",
  "감사연보",
  "특별연보",
  "오일연보",
  "절기연보",
] as const;

/* ───── types ───── */
interface EntryRow {
  key: string;
  memberId: string;
  memberName: string;
  offeringType: string;
  amount: string;
  description: string;
}

interface SavedEntry {
  id: number;
  date: string;
  memberId: number | null;
  member: { id: number; name: string } | null;
  offeringType: string;
  amount: number;
  description: string | null;
}

/* ───── helpers ───── */
function todayKST(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmtAmount(n: number): string {
  return n.toLocaleString("ko-KR");
}

function parseAmount(s: string): number {
  return parseInt(s.replace(/[^0-9-]/g, ""), 10) || 0;
}

let keySeq = 0;
function nextKey(): string {
  return `row-${++keySeq}-${Date.now()}`;
}

function emptyRow(): EntryRow {
  return {
    key: nextKey(),
    memberId: "",
    memberName: "",
    offeringType: OFFERING_TYPES[0],
    amount: "",
    description: "",
  };
}

/** 하나의 개인번호에 대해 연보종류별 6행 생성 */
function memberRows(memberId: string, memberName: string): EntryRow[] {
  return OFFERING_TYPES.map((t) => ({
    key: nextKey(),
    memberId,
    memberName,
    offeringType: t,
    amount: "",
    description: "",
  }));
}

/* ───── component ───── */
export default function OfferingEntryPage() {
  const { hasMemberEdit } = useAccountPerms();
  const [date, setDate] = useState(todayKST());
  const [rows, setRows] = useState<EntryRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [todayEntries, setTodayEntries] = useState<SavedEntry[]>([]);

  // member search popup
  const [searchPopupKey, setSearchPopupKey] = useState<string | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<
    { id: number; name: string; groupName: string | null }[]
  >([]);

  // grid navigation
  // navigable columns: 0=개인번호, 1=금액, 2=비고
  const NAV_COLS = ["memberid", "amount", "desc"] as const;
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  function getNavCell(rowIdx: number, colIdx: number): HTMLInputElement | null {
    if (!tbodyRef.current) return null;
    const colName = NAV_COLS[colIdx];
    return tbodyRef.current.querySelector(
      `[data-row="${rowIdx}"][data-col="${colName}"]`
    ) as HTMLInputElement | null;
  }

  function handleNavKeyDown(e: React.KeyboardEvent, rowIdx: number, colIdx: number) {
    const { key } = e;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return;

    if (key === "ArrowLeft" || key === "ArrowRight") {
      const input = e.target as HTMLInputElement;
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
      const atEnd =
        input.selectionStart === input.value.length &&
        input.selectionEnd === input.value.length;
      if (key === "ArrowLeft" && !atStart) return;
      if (key === "ArrowRight" && !atEnd) return;
    }

    e.preventDefault();
    let nextRow = rowIdx;
    let nextCol = colIdx;

    if (key === "ArrowUp") nextRow = Math.max(0, rowIdx - 1);
    if (key === "ArrowDown") nextRow = rowIdx + 1;
    if (key === "ArrowLeft") nextCol = Math.max(0, colIdx - 1);
    if (key === "ArrowRight") nextCol = Math.min(NAV_COLS.length - 1, colIdx + 1);

    // 마지막 행에서 아래로 → 빈 줄 추가
    if (key === "ArrowDown" && nextRow >= rows.length) {
      setRows((prev) => [...prev, emptyRow()]);
      requestAnimationFrame(() => {
        getNavCell(nextRow, nextCol)?.focus();
      });
      return;
    }

    getNavCell(nextRow, nextCol)?.focus();
  }

  /* ---- fetch today's entries ---- */
  const fetchTodayEntries = useCallback(() => {
    fetch(`/api/accounting/offering/entries?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setTodayEntries(d);
        else if (d.entries) setTodayEntries(d.entries);
      })
      .catch(() => setTodayEntries([]));
  }, [date]);

  useEffect(() => {
    fetchTodayEntries();
  }, [fetchTodayEntries]);

  /* ---- member lookup by id → expand to 6 rows ---- */
  // 번호가 빈 칸이거나 0 이면 "익명 연보" 입력 모드 — 이름 비우고 행 확장하지 않음.
  // 번호가 양수면 서버에서 교인 조회 후 6종 연보 행으로 확장.
  function handleMemberIdBlur(key: string, idStr: string) {
    const trimmed = idStr.trim();
    // 빈 칸이거나 명시적 0 → 익명 연보로 간주
    if (trimmed === "" || trimmed === "0") {
      updateRow(key, "memberName", "");
      return;
    }
    const id = parseInt(trimmed, 10);
    if (!Number.isFinite(id) || id <= 0) {
      updateRow(key, "memberName", "(없음)");
      return;
    }
    fetch(`/api/accounting/offering/members/${id}`)
      .then(async (r) => {
        if (!r.ok) {
          // 404 는 "없는 번호", 나머지는 권한·서버 오류
          const msg = r.status === 404 ? "(없음)" : `(오류 ${r.status})`;
          updateRow(key, "memberName", msg);
          throw new Error(msg);
        }
        return r.json();
      })
      .then((d) => {
        const name = d.name || "";
        if (!name) {
          updateRow(key, "memberName", "(없음)");
          return;
        }
        // 현재 행의 인덱스 찾기
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.key === key);
          if (idx < 0) return prev;
          const current = prev[idx];
          // 같은 번호가 이미 확장된 상태면 그대로 유지 (중복 확장 방지)
          if (current.memberId === String(id) && current.memberName === name) {
            return prev;
          }
          // 빈 줄 → 6줄로 확장. 이름만 다른 경우에도 새로 확장하여 일관성 유지.
          const newRows = memberRows(String(id), name);
          const result = [...prev];
          // 같은 번호 그룹이 뒤에 이어져 있으면 한꺼번에 교체
          let removeCount = 1;
          for (let i = idx + 1; i < result.length; i++) {
            if (result[i].memberId === current.memberId && current.memberId !== "") {
              removeCount++;
            } else break;
          }
          result.splice(idx, removeCount, ...newRows);
          // 끝에 빈 줄이 없으면 추가
          const last = result[result.length - 1];
          if (last.memberId !== "") {
            result.push(emptyRow());
          }
          // 확장된 첫 행의 금액 칸으로 포커스
          requestAnimationFrame(() => {
            getNavCell(idx, 1)?.focus();
          });
          return result;
        });
      })
      .catch(() => {
        // updateRow 는 위에서 이미 호출됨 — 여기서는 삼킴
      });
  }

  /* ---- member search ---- */
  useEffect(() => {
    if (!memberSearchQuery || memberSearchQuery.length < 1) {
      setMemberSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(
        `/api/accounting/offering/members?name=${encodeURIComponent(memberSearchQuery)}&activeOnly=true`
      )
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) {
            setMemberSearchResults(
              d.map((m: { id: number; name: string; groupName: string | null }) => ({
                id: m.id,
                name: m.name,
                groupName: m.groupName,
              }))
            );
          }
        })
        .catch(() => setMemberSearchResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [memberSearchQuery]);

  /* ---- row handlers ---- */
  function updateRow(key: string, field: keyof EntryRow, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length === 0 ? [emptyRow()] : next;
    });
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  /* ---- amount formatting ---- */
  function handleAmountBlur(key: string, raw: string) {
    const n = parseAmount(raw);
    if (n > 0) updateRow(key, "amount", fmtAmount(n));
  }

  function handleAmountFocus(key: string, raw: string) {
    const n = parseAmount(raw);
    updateRow(key, "amount", n > 0 ? String(n) : "");
  }

  /* ---- total ---- */
  const total = useMemo(
    () => rows.reduce((s, r) => s + parseAmount(r.amount), 0),
    [rows]
  );

  /* ---- save ---- */
  async function handleSave() {
    // memberId 는 선택 — 금액 > 0 만 필수. 연보종류는 항상 기본값이 있음.
    const validRows = rows.filter((r) => parseAmount(r.amount) > 0 && r.offeringType);
    if (validRows.length === 0) {
      setMessage({ type: "err", text: "최소 1개 이상의 유효한 항목을 입력하세요." });
      return;
    }

    setSaving(true);
    setMessage(null);

    const payload = {
      entries: validRows.map((r) => {
        const mid = parseInt(r.memberId, 10);
        return {
          date,
          memberId: Number.isFinite(mid) && mid > 0 ? mid : null,
          offeringType: r.offeringType,
          amount: parseAmount(r.amount),
          description: r.description || null,
        };
      }),
    };

    try {
      const res = await fetch("/api/accounting/offering/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "저장에 실패했습니다.");
      }
      setMessage({ type: "ok", text: `${validRows.length}건이 저장되었습니다.` });
      setRows([emptyRow()]);
      fetchTodayEntries();
    } catch (e: unknown) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "오류가 발생했습니다." });
    } finally {
      setSaving(false);
    }
  }

  /* ---- delete entry ---- */
  async function handleDeleteEntry(id: number) {
    if (!confirm("이 항목을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/accounting/offering/entries/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      fetchTodayEntries();
    } catch {
      alert("삭제에 실패했습니다.");
    }
  }

  /* ---- select member from search popup ---- */
  function selectMember(key: string, id: number, name: string) {
    // 검색으로 선택 → 6줄 확장
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.key === key);
      if (idx < 0) return prev;
      const newRows = memberRows(String(id), name);
      const result = [...prev];
      result.splice(idx, 1, ...newRows);
      const last = result[result.length - 1];
      if (last.memberId !== "") {
        result.push(emptyRow());
      }
      // 확장된 첫 행의 금액 칸으로 포커스
      requestAnimationFrame(() => {
        getNavCell(idx, 1)?.focus();
      });
      return result;
    });
    setSearchPopupKey(null);
    setMemberSearchQuery("");
    setMemberSearchResults([]);
  }

  /* ---- 같은 개인번호의 첫 행인지 (그룹 헤더용) ---- */
  function isFirstOfMember(idx: number): boolean {
    if (idx === 0) return true;
    return rows[idx].memberId !== rows[idx - 1].memberId || rows[idx].memberId === "";
  }

  /* ======== render ======== */
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">연보입력 <HelpButton slug="offering-entry" /></h1>

      {/* message */}
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

      {/* form card */}
      <div className="bg-white rounded-lg shadow-sm border-t-4 border-teal-500 p-4 md:p-6 space-y-4">
        {/* date + 무기명 추가 */}
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">연보일자</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              // 개인번호 0 (무기명) + 연보종류별 줄 묶음 추가
              setRows((prev) => {
                // 마지막이 빈 행이면 제거 후 무기명 묶음 추가
                const next = prev.length > 0 && !prev[prev.length - 1].memberId && !prev[prev.length - 1].amount
                  ? prev.slice(0, -1)
                  : prev;
                return [...next, ...memberRows("0", "(무기명)"), emptyRow()];
              });
            }}
            className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            title="개인번호 없이 (무기명) 으로 연보종류별 줄을 한 묶음 추가"
          >
            + 무기명 묶음 추가
          </button>
        </div>

        {/* entry rows table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="px-2 py-2 text-left font-medium w-24">개인번호</th>
                {hasMemberEdit && <th className="px-2 py-2 text-left font-medium w-28">성명</th>}
                <th className="px-2 py-2 text-left font-medium w-32">연보종류</th>
                <th className="px-2 py-2 text-right font-medium w-32">금액</th>
                <th className="px-2 py-2 text-left font-medium">비고</th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {rows.map((row, rowIdx) => {
                const firstOfGroup = isFirstOfMember(rowIdx);
                // 같은 개인번호 그룹의 행 수 계산 (첫 행에서만)
                let groupSpan = 1;
                if (firstOfGroup && row.memberId) {
                  for (let i = rowIdx + 1; i < rows.length; i++) {
                    if (rows[i].memberId === row.memberId) groupSpan++;
                    else break;
                  }
                }

                return (
                  <tr
                    key={row.key}
                    className={`border-b border-gray-100 ${
                      firstOfGroup && row.memberId ? "border-t border-gray-300" : ""
                    }`}
                  >
                    {/* 개인번호 - 그룹 첫 행에서만 표시 */}
                    {(firstOfGroup || !row.memberId) && (
                      <td
                        className="px-2 py-1.5 align-top"
                        rowSpan={row.memberId ? groupSpan : 1}
                      >
                        <div className="flex gap-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            data-row={rowIdx}
                            data-col="memberid"
                            value={row.memberId}
                            onChange={(e) => updateRow(row.key, "memberId", e.target.value)}
                            onBlur={() => handleMemberIdBlur(row.key, row.memberId)}
                            onKeyDown={(e) => {
                              // Enter → 즉시 조회 + 금액 칸으로 포커스 이동.
                              // onBlur 로직을 명시적으로 호출한 뒤 기본 동작 차단.
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleMemberIdBlur(row.key, row.memberId);
                                return;
                              }
                              handleNavKeyDown(e, rowIdx, 0);
                            }}
                            placeholder="번호"
                            className="w-16 border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setSearchPopupKey(row.key);
                              setMemberSearchQuery("");
                              setMemberSearchResults([]);
                            }}
                            className="px-1.5 text-teal-600 hover:text-teal-800 text-lg"
                            title="검색"
                          >
                            &#128269;
                          </button>
                        </div>
                      </td>
                    )}
                    {/* 성명 - 그룹 첫 행에서만 표시 */}
                    {hasMemberEdit && (firstOfGroup || !row.memberId) && (
                      <td
                        className="px-2 py-1.5 align-top"
                        rowSpan={row.memberId ? groupSpan : 1}
                      >
                        <span
                          className={`text-sm ${
                            row.memberName === "(없음)" ? "text-red-500" : "text-gray-700"
                          }`}
                        >
                          {row.memberName || "-"}
                        </span>
                      </td>
                    )}
                    {/* 연보종류 */}
                    <td className="px-2 py-1.5">
                      <select
                        value={row.offeringType}
                        onChange={(e) => updateRow(row.key, "offeringType", e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      >
                        {OFFERING_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    {/* 금액 */}
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        data-row={rowIdx}
                        data-col="amount"
                        value={row.amount}
                        onChange={(e) => updateRow(row.key, "amount", e.target.value)}
                        onBlur={() => handleAmountBlur(row.key, row.amount)}
                        onFocus={() => handleAmountFocus(row.key, row.amount)}
                        onKeyDown={(e) => handleNavKeyDown(e, rowIdx, 1)}
                        placeholder="0"
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </td>
                    {/* 비고 */}
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        data-row={rowIdx}
                        data-col="desc"
                        value={row.description}
                        onChange={(e) => updateRow(row.key, "description", e.target.value)}
                        onKeyDown={(e) => handleNavKeyDown(e, rowIdx, 2)}
                        placeholder="비고"
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </td>
                    {/* 삭제 */}
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        className="text-red-400 hover:text-red-600 text-lg leading-none"
                        title="삭제"
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={3} className="px-2 py-2 text-right text-gray-600">
                  합계
                </td>
                <td className="px-2 py-2 text-right text-blue-700">{fmtAmount(total)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* add row + save */}
        <div className="flex justify-between">
          <button
            type="button"
            onClick={addRow}
            className="px-4 py-2 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
          >
            + 행 추가
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 text-sm text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      {/* today's entries */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-teal-50 border-b border-teal-100">
          <h2 className="text-sm font-bold text-teal-800">{date} 입력내역</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="px-3 py-2 text-left font-medium w-16">번호</th>
                {hasMemberEdit && <th className="px-3 py-2 text-left font-medium">성명</th>}
                <th className="px-3 py-2 text-left font-medium">연보종류</th>
                <th className="px-3 py-2 text-right font-medium">금액</th>
                <th className="px-3 py-2 text-left font-medium">비고</th>
                <th className="px-3 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {todayEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                    입력된 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                todayEntries.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600">{e.memberId ?? "-"}</td>
                    {hasMemberEdit && (
                      <td className="px-3 py-2 text-gray-800">
                        {e.member?.name ?? "(개인번호없음)"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-gray-600">{e.offeringType}</td>
                    <td className="px-3 py-2 text-right text-blue-700 font-medium">
                      {fmtAmount(e.amount)}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{e.description || ""}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteEntry(e.id)}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {todayEntries.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold border-t">
                  <td colSpan={3} className="px-3 py-2 text-right text-gray-600">
                    합계
                  </td>
                  <td className="px-3 py-2 text-right text-blue-700">
                    {fmtAmount(todayEntries.reduce((s, e) => s + e.amount, 0))}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* member search popup */}
      {searchPopupKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">회원 검색</h2>
            <input
              type="text"
              value={memberSearchQuery}
              onChange={(e) => setMemberSearchQuery(e.target.value)}
              placeholder="이름으로 검색"
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
              {memberSearchResults.length === 0 ? (
                <div className="px-4 py-6 text-center text-gray-400 text-sm">
                  {memberSearchQuery ? "검색 결과 없음" : "이름을 입력하세요"}
                </div>
              ) : (
                memberSearchResults.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => selectMember(searchPopupKey, m.id, m.name)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-teal-50 border-b border-gray-100 last:border-b-0 transition-colors"
                  >
                    <span className="text-teal-600 font-medium">{m.id}</span>
                    <span className="ml-3 text-gray-800">{m.name}</span>
                    {m.groupName && (
                      <span className="ml-2 text-gray-400 text-xs">({m.groupName})</span>
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSearchPopupKey(null);
                  setMemberSearchQuery("");
                  setMemberSearchResults([]);
                }}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
