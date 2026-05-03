"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface Deposit {
  id: number; // 0 = 신규
  date: string;
  memberId: number;
  memberNo: string;
  memberName: string;
  amount: string;
  installment: string;
  description: string;
  status: "saved" | "dirty" | "saving" | "error";
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
  category: "전도회" | "건축";
}

function blankRow(): Deposit {
  return {
    id: 0,
    date: todayStr(),
    memberId: 0,
    memberNo: "",
    memberName: "",
    amount: "",
    installment: String(new Date().getMonth() + 1),
    description: "",
    status: "dirty",
  };
}

export default function DepositTable({ category }: Props) {
  const [dateFrom, setDateFrom] = useState(monthAgoStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [rows, setRows] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cellRefs = useRef<Array<Array<HTMLInputElement | null>>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ category, dateFrom, dateTo });
      const res = await fetch(`/api/accounting/dues/deposits?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: Deposit[] = (data.items || []).map((d: any) => ({
        id: d.id,
        date: d.date.slice(0, 10),
        memberId: d.memberId,
        memberNo: d.member?.memberNo ? String(d.member.memberNo) : "",
        memberName: d.member?.name ?? "",
        amount: String(d.amount),
        installment: String(d.installment),
        description: d.description ?? "",
        status: "saved",
      }));
      list.push(blankRow());
      setRows(list);
      cellRefs.current = [];
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [category, dateFrom, dateTo]);

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
  const onKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      if (row === rows.length - 1) {
        setRows((prev) => [...prev, blankRow()]);
        setTimeout(() => focusCell(row + 1, col), 0);
      } else {
        focusCell(row + 1, col);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(row - 1, col);
    }
  };

  const update = (idx: number, field: keyof Deposit, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value, status: "dirty" };
      return next;
    });
  };

  const lookupMember = async (idx: number) => {
    const r = rows[idx];
    const no = r.memberNo.trim();
    if (!no) {
      update(idx, "memberName", "");
      return;
    }
    try {
      const res = await fetch(
        `/api/accounting/dues/members?category=${encodeURIComponent(category)}`,
      );
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = (data.members || []).find((m: any) => String(m.memberNo) === no);
      setRows((prev) => {
        const next = [...prev];
        if (found) {
          next[idx] = {
            ...next[idx],
            memberId: found.id,
            memberName: found.name,
          };
        } else {
          next[idx] = { ...next[idx], memberName: "(없음 — 월정 메뉴에서 등록)" };
        }
        return next;
      });
    } catch {
      // ignore
    }
  };

  const saveRow = async (idx: number) => {
    const r = rows[idx];
    const amt = parseInt(r.amount.replace(/[^\d]/g, ""), 10);
    const inst = parseInt(r.installment, 10);
    if (!Number.isFinite(amt) || amt <= 0) {
      update(idx, "message", "금액 > 0");
      setRows((p) => {
        const n = [...p];
        n[idx] = { ...n[idx], status: "error", message: "금액 > 0" };
        return n;
      });
      return;
    }
    if (!Number.isFinite(inst) || inst < 1 || inst > 12) {
      setRows((p) => {
        const n = [...p];
        n[idx] = { ...n[idx], status: "error", message: "회차 1~12" };
        return n;
      });
      return;
    }
    if (!r.memberId) {
      setRows((p) => {
        const n = [...p];
        n[idx] = { ...n[idx], status: "error", message: "회원 미인식" };
        return n;
      });
      return;
    }

    setRows((p) => {
      const n = [...p];
      n[idx] = { ...n[idx], status: "saving" };
      return n;
    });

    try {
      let res: Response;
      if (r.id === 0) {
        res = await fetch("/api/accounting/dues/deposits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            date: r.date,
            memberId: r.memberId,
            amount: amt,
            installment: inst,
            description: r.description || null,
          }),
        });
      } else {
        res = await fetch(`/api/accounting/dues/deposits/${r.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: r.date,
            memberId: r.memberId,
            amount: amt,
            installment: inst,
            description: r.description || null,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      const newId = data.item?.id ?? r.id;
      setRows((p) => {
        const n = [...p];
        n[idx] = { ...n[idx], id: newId, status: "saved", message: "저장됨" };
        if (idx === n.length - 1) n.push(blankRow());
        return n;
      });
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

  const deleteRow = async (idx: number) => {
    const r = rows[idx];
    if (r.id === 0) {
      setRows((p) => p.filter((_, i) => i !== idx));
      return;
    }
    if (!confirm(`삭제? ${r.date} ${r.memberName} ${r.amount}원`)) return;
    await fetch(`/api/accounting/dues/deposits/${r.id}`, { method: "DELETE" });
    setRows((p) => p.filter((_, i) => i !== idx));
  };

  const totalAmt = rows
    .filter((r) => r.id > 0)
    .reduce((s, r) => s + (parseInt(r.amount, 10) || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">{category} 입금</h1>
        <p className="text-xs text-gray-500 mt-1">
          일자/고유번호/금액/회차(1~12월)/비고. ↑↓/Enter 로 행 이동, 마지막 행 ↓ 누르면 새 행.
          회원이 없으면 먼저 {category} 월정에서 등록.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

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
          onClick={() => setRows((p) => [...p, blankRow()])}
          className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          + 줄 추가
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-2 py-2 text-left font-medium w-32">일자</th>
              <th className="px-2 py-2 text-left font-medium w-20">고유번호</th>
              <th className="px-2 py-2 text-left font-medium w-24">이름</th>
              <th className="px-2 py-2 text-right font-medium w-32">금액</th>
              <th className="px-2 py-2 text-center font-medium w-20">회차</th>
              <th className="px-2 py-2 text-left font-medium">비고</th>
              <th className="px-2 py-2 w-20 text-center font-medium">작업</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
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
                      onChange={(e) => update(idx, "date", e.target.value)}
                      onKeyDown={(e) => onKey(e, idx, 0)}
                      className="w-full rounded border border-gray-200 px-1.5 py-0.5"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      ref={setCellRef(idx, 1)}
                      type="text"
                      inputMode="numeric"
                      value={r.memberNo}
                      onChange={(e) =>
                        update(idx, "memberNo", e.target.value.replace(/[^\d]/g, ""))
                      }
                      onBlur={() => lookupMember(idx)}
                      onKeyDown={(e) => onKey(e, idx, 1)}
                      placeholder="0"
                      className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-right font-mono"
                    />
                  </td>
                  <td className="px-2 py-1 text-xs text-gray-700">{r.memberName}</td>
                  <td className="px-2 py-1">
                    <input
                      ref={setCellRef(idx, 2)}
                      type="text"
                      inputMode="numeric"
                      value={
                        r.amount === ""
                          ? ""
                          : (parseInt(r.amount, 10) || 0).toLocaleString()
                      }
                      onChange={(e) =>
                        update(idx, "amount", e.target.value.replace(/[^\d]/g, ""))
                      }
                      onKeyDown={(e) => onKey(e, idx, 2)}
                      placeholder="0"
                      className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-right font-mono"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      value={r.installment}
                      onChange={(e) => update(idx, "installment", e.target.value)}
                      onKeyDown={(e) =>
                        onKey(e as unknown as React.KeyboardEvent<HTMLInputElement>, idx, 3)
                      }
                      className="w-full rounded border border-gray-200 px-1 py-0.5 text-sm"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {m}월
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <input
                      ref={setCellRef(idx, 4)}
                      type="text"
                      value={r.description}
                      onChange={(e) => update(idx, "description", e.target.value)}
                      onKeyDown={(e) => onKey(e, idx, 4)}
                      className="w-full rounded border border-gray-200 px-1.5 py-0.5"
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => saveRow(idx)}
                        disabled={r.status === "saving"}
                        className="rounded bg-blue-600 px-1.5 py-0.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        ✓
                      </button>
                      {!isNew && (
                        <button
                          type="button"
                          onClick={() => deleteRow(idx)}
                          className="rounded bg-red-500 px-1.5 py-0.5 text-xs text-white hover:bg-red-600"
                        >
                          ✕
                        </button>
                      )}
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
          {rows.some((r) => r.id > 0) && (
            <tfoot>
              <tr className="border-t-2 bg-gray-100 font-semibold">
                <td colSpan={3} className="px-2 py-2 text-right">합계</td>
                <td className="px-2 py-2 text-right text-blue-700">{fmt(totalAmt)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
