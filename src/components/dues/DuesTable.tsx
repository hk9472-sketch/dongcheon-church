"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface DuesItem {
  id: number;
  memberId: number;
  memberNo: number;
  name: string;
  amount: number; // 월정액
  // UI 상태
  status?: "saved" | "dirty" | "saving" | "error";
  message?: string;
}

interface NewMember {
  // 신규 행 — id=0, memberId=0 일 때
  inputNo: string;
  inputName: string;
  inputAmount: string;
}

interface Props {
  category: "전도회" | "건축";
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function DuesTable({ category }: Props) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<DuesItem[]>([]);
  const [newRows, setNewRows] = useState<NewMember[]>([
    { inputNo: "", inputName: "", inputAmount: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 전년회원 불러오기 모달
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);

  // 행간 화살표 이동용 refs (existing rows: 2 cols (amount만 편집), new rows: 3 cols)
  const cellRefs = useRef<Array<Array<HTMLInputElement | null>>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/accounting/dues/amounts?category=${encodeURIComponent(category)}&year=${year}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setRows(
        (data.items || []).map((i: DuesItem) => ({ ...i, status: "saved" })),
      );
      cellRefs.current = [];
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [category, year]);

  useEffect(() => {
    load();
  }, [load]);

  const setCellRef = (row: number, col: number) => (el: HTMLInputElement | null) => {
    if (!cellRefs.current[row]) cellRefs.current[row] = [];
    cellRefs.current[row][col] = el;
  };
  const focusCell = (row: number, col: number) => {
    const el = cellRefs.current[row]?.[col];
    if (el) {
      el.focus();
      el.select();
    }
  };
  const totalRows = rows.length + newRows.length;

  const onCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      // 마지막 행에서 ↓ → 새 행 추가
      if (row === totalRows - 1) {
        setNewRows((prev) => [...prev, { inputNo: "", inputName: "", inputAmount: "" }]);
        setTimeout(() => focusCell(row + 1, col), 0);
      } else {
        focusCell(row + 1, col);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(row - 1, col);
    }
  };

  const updateAmount = (idx: number, value: string) => {
    const n = parseInt(value.replace(/[^\d]/g, ""), 10) || 0;
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], amount: n, status: "dirty", message: undefined };
      return next;
    });
  };

  const saveAmount = async (idx: number) => {
    const r = rows[idx];
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "saving" };
      return next;
    });
    try {
      const res = await fetch("/api/accounting/dues/amounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          year,
          memberId: r.memberId,
          amount: r.amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], status: "saved", message: "저장됨" };
        return next;
      });
    } catch (e) {
      setRows((prev) => {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          status: "error",
          message: e instanceof Error ? e.message : "저장 실패",
        };
        return next;
      });
    }
  };

  /** 변경된(dirty/error) 기존 row + 입력된 신규 row 를 한번에 처리 */
  const saveAll = async () => {
    setError(null);
    // 1) dirty/error 인 기존 행
    const dirtyIdx = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.status === "dirty" || r.status === "error")
      .map(({ i }) => i);
    for (const i of dirtyIdx) {
      await saveAmount(i);
    }
    // 2) 이름 입력된 신규 행 (마지막 빈 행은 자동 skip)
    const newToSave = newRows
      .map((nr, i) => ({ nr, i }))
      .filter(({ nr }) => nr.inputName.trim() !== "");
    // 인덱스가 변하지 않도록 역순으로 처리
    for (const { i } of [...newToSave].reverse()) {
      await saveNewRow(i);
    }
  };

  const deleteMember = async (idx: number) => {
    const r = rows[idx];
    if (!confirm(`${r.memberNo}. ${r.name} 회원을 삭제할까요?\n(입금 내역이 있으면 삭제 불가)`)) {
      return;
    }
    try {
      const res = await fetch(`/api/accounting/dues/members/${r.memberId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "삭제 실패");
      setRows((prev) => prev.filter((_, i) => i !== idx));
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const runCopyFromPrev = async (overwrite: boolean) => {
    setCopyBusy(true);
    try {
      const res = await fetch("/api/accounting/dues/amounts/copy-from-prev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, year, overwrite }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || "복사 실패");
        return;
      }
      alert(
        `복사 완료\n복사: ${d.copied}건 · 건너뜀: ${d.skipped}건` +
          (d.message ? `\n${d.message}` : ""),
      );
      setCopyOpen(false);
      load();
    } catch (e) {
      alert("오류: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCopyBusy(false);
    }
  };

  const updateNewRow = (idx: number, field: keyof NewMember, value: string) => {
    setNewRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const saveNewRow = async (idx: number) => {
    const r = newRows[idx];
    const name = r.inputName.trim();
    if (!name) {
      setError("이름을 입력하세요.");
      return;
    }
    const memberNo = r.inputNo.trim() === "" ? undefined : parseInt(r.inputNo, 10);
    const amount = parseInt(r.inputAmount.replace(/[^\d]/g, ""), 10) || 0;

    try {
      // 1) 회원 등록 (또는 기존 번호면 거부)
      const memRes = await fetch("/api/accounting/dues/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, memberNo, name }),
      });
      const memData = await memRes.json();
      if (!memRes.ok) throw new Error(memData?.error || "회원 등록 실패");

      const memberId = memData.member.id;
      // 2) 월정액 등록
      if (amount > 0) {
        await fetch("/api/accounting/dues/amounts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, year, memberId, amount }),
        });
      }

      // 3) 신규 행 제거 + 다시 로드
      setNewRows((prev) => prev.filter((_, i) => i !== idx));
      if (newRows.length === 1) {
        // 마지막 신규 행 제거됐으니 새 빈 행 하나 추가
        setNewRows([{ inputNo: "", inputName: "", inputAmount: "" }]);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">{category} 월정</h1>
        <p className="text-xs text-gray-500 mt-1">
          연도별로 회원별 월정액을 등록·수정. 신규 회원은 노란 행에 고유번호(미입력 시 자동) +
          이름 + 월정액 입력 후 저장하면 추가됨. ↑↓/Enter 로 행 이동.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">기준년도</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10) || thisYear)}
            min={2000}
            max={2100}
            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
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
          onClick={() => setCopyOpen(true)}
          className="rounded border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100 font-semibold"
          title={`${year - 1}년 월정액을 ${year}년으로 복사`}
        >
          📋 전년회원 불러오기
        </button>
        <button
          type="button"
          onClick={saveAll}
          disabled={
            loading ||
            (!rows.some((r) => r.status === "dirty" || r.status === "error") &&
              !newRows.some((nr) => nr.inputName.trim() !== ""))
          }
          className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 font-semibold"
          title="변경된 월정액 + 입력된 신규 회원 일괄 저장"
        >
          💾 일괄 저장
        </button>
        <button
          type="button"
          onClick={() => setNewRows((p) => [...p, { inputNo: "", inputName: "", inputAmount: "" }])}
          className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          + 회원 추가
        </button>
      </div>

      {/* 전년회원 불러오기 모달 */}
      {copyOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !copyBusy && setCopyOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2 bg-amber-500 text-white rounded-t-lg text-sm font-bold">
              📋 {year - 1}년 {category} 회원 → {year}년 으로 불러오기
            </div>
            <div className="px-4 py-3 text-sm text-gray-700 space-y-2">
              <div>
                전년도 ({year - 1}) 에 월정액이 등록된 <strong>{category}</strong> 회원의
                금액을 올해 ({year}) 로 복사합니다.
              </div>
              <ul className="text-xs text-gray-600 list-disc pl-5 space-y-1">
                <li>
                  <strong>빈 항목만</strong> — 올해 미설정/0원 회원만 채움 (이미 입력된
                  금액은 보존)
                </li>
                <li>
                  <strong>덮어쓰기</strong> — 올해 이미 입력된 금액도 전년 값으로 변경
                </li>
                <li>탈퇴(비활성) 회원은 자동 제외</li>
              </ul>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCopyOpen(false)}
                disabled={copyBusy}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => runCopyFromPrev(true)}
                disabled={copyBusy}
                className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                덮어쓰기
              </button>
              <button
                type="button"
                onClick={() => runCopyFromPrev(false)}
                disabled={copyBusy}
                className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 font-semibold disabled:opacity-50"
              >
                빈 항목만
              </button>
            </div>
            {copyBusy && (
              <div className="px-4 pb-3 text-xs text-gray-500">복사 중...</div>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-24">고유번호</th>
              <th className="px-3 py-2 text-left font-medium">이름</th>
              <th className="px-3 py-2 text-right font-medium w-40">월정액</th>
              <th className="px-3 py-2 w-32 text-center font-medium">작업</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && newRows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                  등록된 회원 없음
                </td>
              </tr>
            )}
            {rows.map((r, idx) => (
              <tr
                key={r.memberId}
                className={`border-b last:border-b-0 ${
                  r.status === "dirty" ? "bg-orange-50" : ""
                }`}
              >
                <td className="px-3 py-2 text-gray-600 font-mono">{r.memberNo}</td>
                <td className="px-3 py-2 text-gray-800">{r.name}</td>
                <td className="px-3 py-2">
                  <input
                    ref={setCellRef(idx, 0)}
                    type="text"
                    inputMode="numeric"
                    value={r.amount === 0 ? "" : r.amount.toLocaleString()}
                    onChange={(e) => updateAmount(idx, e.target.value)}
                    onKeyDown={(e) => onCellKeyDown(e, idx, 0)}
                    placeholder="0"
                    className="w-full rounded border border-gray-200 px-2 py-1 text-right font-mono"
                  />
                </td>
                <td className="px-3 py-2 text-center whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => saveAmount(idx)}
                      disabled={r.status === "saving"}
                      className="w-12 rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {r.status === "saving" ? "..." : "저장"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMember(idx)}
                      className="w-12 rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700"
                    >
                      삭제
                    </button>
                  </div>
                  {r.message && r.status === "error" && (
                    <div className="text-[10px] text-red-600 mt-0.5">{r.message}</div>
                  )}
                </td>
              </tr>
            ))}
            {newRows.map((nr, idx) => {
              const rowIdx = rows.length + idx;
              return (
                <tr key={`new-${idx}`} className="border-b last:border-b-0 bg-yellow-50">
                  <td className="px-2 py-1">
                    <input
                      ref={setCellRef(rowIdx, 0)}
                      type="text"
                      inputMode="numeric"
                      value={nr.inputNo}
                      onChange={(e) =>
                        updateNewRow(idx, "inputNo", e.target.value.replace(/[^\d]/g, ""))
                      }
                      onKeyDown={(e) => onCellKeyDown(e, rowIdx, 0)}
                      placeholder="자동"
                      className="w-full rounded border border-gray-200 px-2 py-1 font-mono text-right"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      ref={setCellRef(rowIdx, 1)}
                      type="text"
                      value={nr.inputName}
                      onChange={(e) => updateNewRow(idx, "inputName", e.target.value)}
                      onKeyDown={(e) => onCellKeyDown(e, rowIdx, 1)}
                      placeholder="이름"
                      className="w-full rounded border border-gray-200 px-2 py-1"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      ref={setCellRef(rowIdx, 2)}
                      type="text"
                      inputMode="numeric"
                      value={
                        nr.inputAmount === ""
                          ? ""
                          : (parseInt(nr.inputAmount, 10) || 0).toLocaleString()
                      }
                      onChange={(e) =>
                        updateNewRow(idx, "inputAmount", e.target.value.replace(/[^\d]/g, ""))
                      }
                      onKeyDown={(e) => onCellKeyDown(e, rowIdx, 2)}
                      placeholder="0"
                      className="w-full rounded border border-gray-200 px-2 py-1 text-right font-mono"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => saveNewRow(idx)}
                      className="w-12 rounded bg-emerald-600 px-2 py-0.5 text-xs text-white hover:bg-emerald-700"
                    >
                      등록
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-gray-100 font-semibold">
                <td colSpan={2} className="px-3 py-2 text-right">합계</td>
                <td className="px-3 py-2 text-right text-blue-700">
                  {fmt(rows.reduce((s, r) => s + r.amount, 0))}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
