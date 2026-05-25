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

interface Member {
  id: number;
  memberNo: number;
  name: string;
  monthlyAmount?: number;
}

export default function DepositTable({ category }: Props) {
  const [dateFrom, setDateFrom] = useState(monthAgoStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [rows, setRows] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cellRefs = useRef<Array<Array<HTMLInputElement | null>>>([]);
  // 월정명단 — 컴포넌트 마운트 시 1회 로드 + cache. 화면에 일괄 표시 안 함,
  // 행별 이름 자동 매칭과 🔍 모달 검색에만 사용.
  const [members, setMembers] = useState<Member[]>([]);
  // 회원 선택 모달
  const [pickerOpenForIdx, setPickerOpenForIdx] = useState<number | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  // 같은 이름이 여러 명일 때 후보 표시 (이름 입력 후 onBlur)
  const [nameCandidates, setNameCandidates] = useState<{ idx: number; matches: Member[] } | null>(null);
  // 회계 반영 모달
  const [reflectOpen, setReflectOpen] = useState(false);
  const [reflectBusy, setReflectBusy] = useState(false);

  // 월정명단 로드
  useEffect(() => {
    fetch(`/api/accounting/dues/members?category=${encodeURIComponent(category)}&year=${new Date().getFullYear()}`)
      .then((r) => r.json())
      .then((d) => setMembers(d.members || []))
      .catch(() => setMembers([]));
  }, [category]);

  /** 이름으로 회원 매칭 — 단일 일치는 자동 채움, 복수면 후보 모달 띄움. */
  const matchByName = (idx: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const matches = members.filter((m) => m.name === trimmed);
    if (matches.length === 1) {
      const m = matches[0];
      setRows((prev) => {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          memberId: m.id,
          memberNo: String(m.memberNo),
          memberName: m.name,
          status: "dirty",
        };
        return next;
      });
    } else if (matches.length > 1) {
      setNameCandidates({ idx, matches });
    } else {
      // 부분 일치 fallback — 이름 일부를 포함하는 회원
      const partial = members.filter((m) => m.name.includes(trimmed));
      if (partial.length === 1) {
        const m = partial[0];
        setRows((prev) => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            memberId: m.id,
            memberNo: String(m.memberNo),
            memberName: m.name,
            status: "dirty",
          };
          return next;
        });
      } else if (partial.length > 1) {
        setNameCandidates({ idx, matches: partial });
      }
      // 0 건이면 그대로 두고 사용자에게 표시
    }
  };

  /** 모달에서 회원 선택 시 row 갱신. */
  const pickMember = (idx: number, m: Member) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        memberId: m.id,
        memberNo: String(m.memberNo),
        memberName: m.name,
        status: "dirty",
        amount: next[idx].amount || (m.monthlyAmount ? String(m.monthlyAmount) : next[idx].amount),
      };
      return next;
    });
    setPickerOpenForIdx(null);
    setPickerQuery("");
    setNameCandidates(null);
  };

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

  const reflectRun = async (mode: "row" | "summary") => {
    setReflectBusy(true);
    try {
      const res = await fetch("/api/accounting/dues/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, from: dateFrom, to: dateTo, mode }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.message || "반영 실패");
        return;
      }
      alert(
        `반영 완료\n전표 ${d.voucherCount}건 · 합계 ${d.totalAmount.toLocaleString("ko-KR")}원 · 입금 ${d.depositCount}건`,
      );
      setReflectOpen(false);
    } catch (e) {
      alert("오류: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setReflectBusy(false);
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
          번호 직접 입력 / 이름 입력 후 ↹(Tab) 으로 자동 매칭 / 🔍 버튼으로 명단 검색.
          ↑↓/Enter 로 행 이동, 마지막 행 ↓ 누르면 새 행.
        </p>
      </div>

      {/* 회원 선택 모달 (검색) */}
      {pickerOpenForIdx !== null && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPickerOpenForIdx(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-2 bg-indigo-600 text-white rounded-t-lg flex items-center justify-between">
              <h3 className="text-sm font-bold">{category} 월정명단</h3>
              <button onClick={() => setPickerOpenForIdx(null)} className="text-xs">✕</button>
            </div>
            <div className="px-3 py-2 border-b border-gray-200">
              <input
                type="text"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="이름 또는 번호 검색"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <tbody>
                  {members
                    .filter((m) =>
                      !pickerQuery ||
                      m.name.includes(pickerQuery) ||
                      String(m.memberNo).includes(pickerQuery)
                    )
                    .map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-gray-100 hover:bg-indigo-50 cursor-pointer"
                        onClick={() => pickMember(pickerOpenForIdx, m)}
                      >
                        <td className="px-3 py-2 font-mono w-14">{m.memberNo}</td>
                        <td className="px-3 py-2 font-medium">{m.name}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-500 w-24">
                          {m.monthlyAmount ? fmt(m.monthlyAmount) : ""}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 동명이인 후보 모달 — 이름 입력 시 같은 이름 여러 명일 때 */}
      {nameCandidates && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setNameCandidates(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-2 bg-amber-500 text-white rounded-t-lg text-sm font-bold">
              동명이인 — 하나 선택
            </div>
            <ul className="divide-y divide-gray-100">
              {nameCandidates.matches.map((m) => (
                <li
                  key={m.id}
                  onClick={() => pickMember(nameCandidates.idx, m)}
                  className="px-4 py-2 cursor-pointer hover:bg-amber-50 flex items-center justify-between text-sm"
                >
                  <span>
                    <span className="font-mono mr-2 text-gray-500">#{m.memberNo}</span>
                    <strong>{m.name}</strong>
                  </span>
                  {m.monthlyAmount && (
                    <span className="text-xs text-gray-400 font-mono">{fmt(m.monthlyAmount)}</span>
                  )}
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-gray-200 text-right">
              <button onClick={() => setNameCandidates(null)} className="text-xs text-gray-500 hover:underline">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 회계 반영 모드 선택 모달 */}
      {reflectOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !reflectBusy && setReflectOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2 bg-blue-600 text-white rounded-t-lg text-sm font-bold">
              📒 회계 반영 모드 선택
            </div>
            <div className="px-4 py-3 text-sm text-gray-700 space-y-2">
              <div>
                {dateFrom} ~ {dateTo} <strong>{category}</strong> 입금을
                회계 전표로 반영합니다.
              </div>
              <ul className="text-xs text-gray-600 space-y-1 list-disc pl-5">
                <li>
                  <strong>개별</strong> — 회원별 입금 row 를 모두 포함하는 일자별
                  voucher 생성
                </li>
                <li>
                  <strong>일괄</strong> — 기간 합계 단일 voucher 만 생성 (개별
                  row 없음)
                </li>
              </ul>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReflectOpen(false)}
                disabled={reflectBusy}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => reflectRun("summary")}
                disabled={reflectBusy}
                className="rounded border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100 font-semibold disabled:opacity-50"
              >
                일괄
              </button>
              <button
                type="button"
                onClick={() => reflectRun("row")}
                disabled={reflectBusy}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 font-semibold disabled:opacity-50"
              >
                개별
              </button>
            </div>
            {reflectBusy && (
              <div className="px-4 pb-3 text-xs text-gray-500">반영 중...</div>
            )}
          </div>
        </div>
      )}

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

        {/* 회계 반영 — 기간 내 입금을 합계 또는 일자별 voucher 로 생성.
            연보 계정과목 매핑(duesJeondo|duesBuild) 으로부터 unitId/accountId 결정. */}
        <button
          type="button"
          onClick={() => setReflectOpen(true)}
          className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 font-semibold"
          title="기간 내 입금을 회계 전표로 반영"
        >
          📒 회계 반영
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
              <th className="px-2 py-2 w-32 text-center font-medium">작업</th>
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
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={r.memberName}
                        onChange={(e) => update(idx, "memberName", e.target.value)}
                        onBlur={(e) => matchByName(idx, e.target.value)}
                        placeholder="이름"
                        className="flex-1 rounded border border-gray-200 px-1.5 py-0.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => { setPickerOpenForIdx(idx); setPickerQuery(""); }}
                        className="shrink-0 px-1.5 py-0.5 text-[10px] border border-gray-300 rounded hover:bg-gray-100"
                        title="월정명단에서 회원 선택"
                      >
                        🔍
                      </button>
                    </div>
                  </td>
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
                  <td className="px-2 py-1 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => saveRow(idx)}
                        disabled={r.status === "saving"}
                        className="w-12 rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        저장
                      </button>
                      {!isNew && (
                        <button
                          type="button"
                          onClick={() => deleteRow(idx)}
                          className="w-12 rounded bg-red-500 px-2 py-0.5 text-xs text-white hover:bg-red-600"
                        >
                          삭제
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
