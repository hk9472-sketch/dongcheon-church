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
  // 신규 행이 생길 때 자동으로 들어갈 기준일자 (사용자가 변경하면 다음 추가부터 반영).
  // load 가 의존성에 defaultDate 를 두면 변경할 때마다 재조회되므로,
  // 항상 최신값을 읽되 load 재생성은 안 시키기 위해 ref 동기화.
  const [defaultDate, setDefaultDate] = useState(todayStr());
  const defaultDateRef = useRef(defaultDate);
  useEffect(() => {
    defaultDateRef.current = defaultDate;
  }, [defaultDate]);
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"member" | "input">("member");

  // 저장된 행을 개인번호별/입력순서별로 재정렬 (신규 행은 끝에 유지)
  const applySort = (by: "member" | "input") => {
    setSortBy(by);
    setRows((prev) => {
      const saved = prev.filter((r) => r.id > 0);
      const news = prev.filter((r) => r.id === 0);
      const sorted = [...saved].sort((a, b) => {
        if (by === "member") {
          const na = parseInt(a.memberId || "0", 10) || 0;
          const nb = parseInt(b.memberId || "0", 10) || 0;
          if (na !== nb) return na - nb;
        }
        return a.id - b.id;
      });
      cellRefs.current = [];
      return [...sorted, ...news];
    });
  };

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
        setRows((prev) => [...prev, blankRow(fixedType, defaultDate)]);
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
      mapped.push(blankRow(fixedType, defaultDateRef.current));
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
    // 비고(내역)는 감사연보에만 기록
    const desc = r.offeringType === "감사연보" ? r.description || null : null;
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
                description: desc,
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
          if (idx === n.length - 1) n.push(blankRow(fixedType, defaultDateRef.current));
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
            description: desc,
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

  /**
   * 변경분 일괄저장 — 단일 트랜잭션.
   * 모든 dirty 행의 (신규/수정) 를 한 번의 POST /entries/bulk 로 보냄.
   * 한 건이라도 실패하면 전체 롤백 → 부분 저장 사고 방지.
   */
  const saveAllDirty = async () => {
    setError(null);
    const createPlan: { rowIdx: number; entry: {
      date: string; memberId: number | null; offeringType: string;
      amount: number; description: string | null;
    } }[] = [];
    const updatePlan: { rowIdx: number; entry: {
      id: number; date: string; memberId: number | null; offeringType: string;
      amount: number; description: string | null;
    } }[] = [];

    rows.forEach((r, idx) => {
      if (r.status !== "dirty") return;
      const amt = parseInt(r.amount.replace(/[^\d-]/g, ""), 10);
      if (!Number.isFinite(amt) || amt <= 0) {
        // 유효성 실패 row 표시 (트랜잭션 보내지 않음)
        setRows((prev) => {
          const n = [...prev];
          n[idx] = { ...n[idx], status: "error", message: "금액 > 0" };
          return n;
        });
        return;
      }
      const mid = r.memberId.trim() === "" ? null : parseInt(r.memberId, 10);
      const memberId = mid !== null && Number.isFinite(mid) ? mid : null;
      // 비고(내역)는 감사연보에만 기록
      const desc = r.offeringType === "감사연보" ? r.description || null : null;
      if (r.id === 0) {
        createPlan.push({
          rowIdx: idx,
          entry: {
            date: r.date,
            memberId,
            offeringType: r.offeringType,
            amount: amt,
            description: desc,
          },
        });
      } else {
        updatePlan.push({
          rowIdx: idx,
          entry: {
            id: r.id,
            date: r.date,
            memberId,
            offeringType: r.offeringType,
            amount: amt,
            description: desc,
          },
        });
      }
    });

    if (createPlan.length + updatePlan.length === 0) {
      setError("저장할 변경 사항이 없습니다.");
      return;
    }

    // saving 상태 표시
    setRows((prev) => {
      const n = [...prev];
      [...createPlan, ...updatePlan].forEach(({ rowIdx }) => {
        if (n[rowIdx]) n[rowIdx] = { ...n[rowIdx], status: "saving", message: undefined };
      });
      return n;
    });

    try {
      // creates 는 모두 같은 날짜인 게 아니라 행마다 다를 수 있어 — bulk API 가
      // body.date 는 신규 공통 일자로 요구하므로, 행별 date 를 entry.date 로 두고
      // body.date 는 첫 신규의 date 로 둠 (서버는 entry.date 가 우선 적용되지 않으니
      // 그대로 body.date 사용 — 행별 다른 일자는 별도 호출 또는 bulk API 보강 필요).
      // 임시 해결: 신규 행마다 date 가 다르면 그룹화해 호출 (단일 트랜잭션 보장 위해).
      // 일반적으로 BulkEditor 는 기준일자 사용이라 같은 날짜인 경우가 대부분.
      const datesInCreate = new Set(createPlan.map((c) => c.entry.date));
      if (datesInCreate.size > 1) {
        throw new Error(
          "신규 행에 여러 날짜가 섞여 있습니다. 기준일자별로 나눠 저장하세요.",
        );
      }

      const commonDate = createPlan[0]?.entry.date || rows[0]?.date;
      const res = await fetch("/api/accounting/offering/entries/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: commonDate,
          creates: createPlan.map(({ entry }) => ({
            memberId: entry.memberId,
            offeringType: entry.offeringType,
            amount: entry.amount,
            description: entry.description,
          })),
          updates: updatePlan.map(({ entry }) => entry),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패 (전체 롤백됨)");

      // 응답 매핑
      setRows((prev) => {
        const n = [...prev];
        const created: Array<{ id: number; offeringType: string }> = data.creates || [];
        createPlan.forEach((cp, i) => {
          if (n[cp.rowIdx] && created[i]) {
            n[cp.rowIdx] = {
              ...n[cp.rowIdx],
              id: created[i].id,
              status: "saved",
              message: "저장됨",
            };
          }
        });
        updatePlan.forEach((up) => {
          if (n[up.rowIdx]) {
            n[up.rowIdx] = { ...n[up.rowIdx], status: "saved", message: "저장됨" };
          }
        });
        // 마지막 행이 saved 면 새 빈 행 추가
        if (n[n.length - 1]?.status === "saved") {
          n.push(blankRow(fixedType, defaultDateRef.current));
        }
        return n;
      });
    } catch (e) {
      // 실패 — 모든 saving 을 dirty 로 되돌림 (입력 데이터 보존)
      setRows((prev) => {
        const n = [...prev];
        [...createPlan, ...updatePlan].forEach(({ rowIdx }) => {
          if (n[rowIdx] && n[rowIdx].status === "saving") {
            n[rowIdx] = { ...n[rowIdx], status: "dirty", message: undefined };
          }
        });
        return n;
      });
      setError(
        (e instanceof Error ? e.message : "저장 실패") +
          " — 입력 내용은 그대로 보존됩니다. 다시 [변경분 일괄저장] 누르세요.",
      );
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
        {/* 기준일자 — 새 행이 추가될 때마다 이 날짜로 채워짐 */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">기준일자</label>
          <input
            type="date"
            value={defaultDate}
            onChange={(e) => setDefaultDate(e.target.value)}
            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-sm"
            title="새 줄 추가 시 자동으로 이 날짜가 입력됩니다"
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
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span>정렬</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="bulk-sort" checked={sortBy === "member"} onChange={() => applySort("member")} />
            개인번호
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="bulk-sort" checked={sortBy === "input"} onChange={() => applySort("input")} />
            입력순서
          </label>
        </div>
        <button
          type="button"
          onClick={() =>
            setRows((prev) => [...prev, blankRow(fixedType, defaultDateRef.current)])
          }
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
                      {r.offeringType === "감사연보" ? (
                        <input
                          ref={setCellRef(idx, showTypeColumn ? 4 : 3)}
                          type="text"
                          value={r.description}
                          onChange={(e) => updateField(idx, "description", e.target.value)}
                          onKeyDown={(e) => onCellKeyDown(e, idx, showTypeColumn ? 4 : 3)}
                          className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-sm"
                        />
                      ) : (
                        <input
                          ref={setCellRef(idx, showTypeColumn ? 4 : 3)}
                          type="text"
                          value=""
                          disabled
                          placeholder="감사연보만"
                          className="w-full rounded border border-gray-100 bg-gray-50 px-1.5 py-0.5 text-sm text-gray-300"
                        />
                      )}
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
        ↓ 누르면 빈 행이 자동 추가됨. 상단 [+ 줄 추가] 로도 즉시 행 생성 가능.
        새 줄의 일자는 상단 <strong>기준일자</strong> 값으로 자동 채워집니다.
      </div>
    </div>
  );
}

function blankRow(fixedType?: OfferingType, defaultDate?: string): Entry {
  return {
    id: 0,
    date: defaultDate || todayStr(),
    memberId: "",
    memberName: "",
    offeringType: fixedType ?? "주일연보",
    amount: "",
    description: "",
    status: "dirty",
  };
}
