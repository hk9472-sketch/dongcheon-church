"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Member {
  id: number;
  memberNo: number;
  name: string;
  monthlyAmount?: number;
}

interface Cell {
  /** 이미 입금된 회차(서버) */
  paid: boolean;
  /** 사용자 선택 (체크박스) */
  checked: boolean;
  /** 입력된 금액 */
  amount: string;
}

interface Props {
  category: "전도회" | "건축";
}

function todayStr(): string {
  const d = new Date();
  const k = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return k.toISOString().slice(0, 10);
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function DepositMatrix({ category }: Props) {
  const [date, setDate] = useState(todayStr());
  const [members, setMembers] = useState<Member[]>([]);
  /** matrix[memberId][installment] = Cell */
  const [matrix, setMatrix] = useState<Record<number, Record<number, Cell>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  /** 회원 + 해당 연도 입금 내역 로드 */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const year = new Date(date).getFullYear();
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;

      const [mRes, dRes] = await Promise.all([
        fetch(
          `/api/accounting/dues/members?category=${encodeURIComponent(category)}&year=${year}`,
        ),
        fetch(
          `/api/accounting/dues/deposits?category=${encodeURIComponent(category)}` +
            `&dateFrom=${yearStart}&dateTo=${yearEnd}`,
        ),
      ]);
      const mData = await mRes.json();
      const dData = await dRes.json();
      const ms: Member[] = mData.members || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deposits: any[] = dData.items || [];
      setMembers(ms);

      const paidMap = new Set<string>();
      for (const d of deposits) {
        paidMap.add(`${d.memberId}:${d.installment}`);
      }

      // 초기엔 금액 비워두고, 체크할 때 monthlyAmount 자동 채움.
      const mat: Record<number, Record<number, Cell>> = {};
      for (const m of ms) {
        mat[m.id] = {};
        for (const mo of MONTHS) {
          const isPaid = paidMap.has(`${m.id}:${mo}`);
          mat[m.id][mo] = {
            paid: isPaid,
            checked: false,
            amount: "",
          };
        }
      }
      setMatrix(mat);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [category, date]);

  useEffect(() => {
    load();
  }, [load]);

  const setCell = (memberId: number, month: number, patch: Partial<Cell>) => {
    setMatrix((prev) => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        [month]: { ...prev[memberId][month], ...patch },
      },
    }));
  };

  /** 체크박스 토글 — 체크하면서 금액이 비어 있으면 월정액 자동 채움 */
  const toggleCell = (member: Member, month: number, checked: boolean) => {
    const cur = matrix[member.id]?.[month];
    if (!cur || cur.paid) return;
    const next: Partial<Cell> = { checked };
    if (checked && !cur.amount && member.monthlyAmount) {
      next.amount = String(member.monthlyAmount);
    }
    setCell(member.id, month, next);
  };

  // ============ 화살표 키 이동 ============
  // 셀 좌표: rowIdx = filteredMembers index, colIdx = month-1
  // 금액 input 에 ref 부착, 키 이벤트로 상하좌우 이동
  const cellRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const focusCell = (rowIdx: number, colIdx: number, memberList: Member[]) => {
    if (rowIdx < 0 || rowIdx >= memberList.length) return;
    if (colIdx < 0 || colIdx >= 12) return;
    const m = memberList[rowIdx];
    const mo = colIdx + 1;
    // 입금 완료 셀은 input 이 없음 → 다음/이전 가능한 셀까지 건너뜀
    const cell = matrix[m.id]?.[mo];
    const key = `${m.id}:${mo}`;
    const el = cellRefs.current.get(key);
    if (el && cell && !cell.paid) {
      el.focus();
      el.select();
    }
  };
  const onCellKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number,
    memberList: Member[],
  ) => {
    // 한 행에서 좌우 이동: caret 위치 무시하고 무조건 이동 (input 작아서 caret 의미 적음)
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      // 다음 행에서 paid 가 아닌 셀까지 건너뜀
      for (let r = rowIdx + 1; r < memberList.length; r++) {
        const m = memberList[r];
        const c = matrix[m.id]?.[colIdx + 1];
        if (c && !c.paid) {
          focusCell(r, colIdx, memberList);
          return;
        }
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      for (let r = rowIdx - 1; r >= 0; r--) {
        const m = memberList[r];
        const c = matrix[m.id]?.[colIdx + 1];
        if (c && !c.paid) {
          focusCell(r, colIdx, memberList);
          return;
        }
      }
    } else if (e.key === "ArrowLeft") {
      // 좌측 셀 — caret 0 일 때만 이동
      const input = e.currentTarget;
      if (input.selectionStart === 0) {
        e.preventDefault();
        for (let c = colIdx - 1; c >= 0; c--) {
          const cell = matrix[memberList[rowIdx].id]?.[c + 1];
          if (cell && !cell.paid) {
            focusCell(rowIdx, c, memberList);
            return;
          }
        }
      }
    } else if (e.key === "ArrowRight") {
      const input = e.currentTarget;
      if (input.selectionStart === input.value.length) {
        e.preventDefault();
        for (let c = colIdx + 1; c < 12; c++) {
          const cell = matrix[memberList[rowIdx].id]?.[c + 1];
          if (cell && !cell.paid) {
            focusCell(rowIdx, c, memberList);
            return;
          }
        }
      }
    } else if (e.key === " ") {
      // 스페이스로 체크 토글
      e.preventDefault();
      const m = memberList[rowIdx];
      const cell = matrix[m.id]?.[colIdx + 1];
      if (cell && !cell.paid) toggleCell(m, colIdx + 1, !cell.checked);
    }
  };

  /** 회원 행 전체 체크/해제 (미입금 셀만) */
  const toggleRow = (memberId: number, target: boolean) => {
    setMatrix((prev) => {
      const next = { ...prev };
      next[memberId] = { ...next[memberId] };
      for (const mo of MONTHS) {
        const c = next[memberId][mo];
        if (!c.paid) next[memberId][mo] = { ...c, checked: target };
      }
      return next;
    });
  };

  /** 월 컬럼 전체 체크/해제 */
  const toggleCol = (month: number, target: boolean) => {
    setMatrix((prev) => {
      const next: typeof prev = {};
      for (const [mid, row] of Object.entries(prev)) {
        next[parseInt(mid, 10)] = { ...row };
        const c = row[month];
        if (!c.paid) next[parseInt(mid, 10)][month] = { ...c, checked: target };
      }
      return next;
    });
  };

  /** 체크된 셀 전체 저장 */
  const saveSelected = async () => {
    const items: { memberId: number; installment: number; amount: number; description?: string }[] = [];
    for (const m of members) {
      const row = matrix[m.id] || {};
      for (const mo of MONTHS) {
        const c = row[mo];
        if (!c || c.paid || !c.checked) continue;
        const amt = parseInt(c.amount.replace(/[^\d]/g, ""), 10);
        if (!Number.isFinite(amt) || amt <= 0) continue;
        items.push({
          memberId: m.id,
          installment: mo,
          amount: amt,
          description: `${mo}월분`,
        });
      }
    }
    if (items.length === 0) {
      setError("저장할 항목이 없습니다. (체크하지 않았거나 금액이 0)");
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/accounting/dues/deposits/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, date, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      setInfo(`저장 완료 — 신규 ${data.created}건 · 중복 건너뜀 ${data.skipped}건`);
      // 새로 로드해서 paid 상태 갱신
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  // 합계 계산
  const selectedTotal = members.reduce((s, m) => {
    const row = matrix[m.id] || {};
    for (const mo of MONTHS) {
      const c = row[mo];
      if (c && !c.paid && c.checked) {
        s += parseInt(c.amount.replace(/[^\d]/g, ""), 10) || 0;
      }
    }
    return s;
  }, 0);

  const selectedCount = members.reduce((n, m) => {
    const row = matrix[m.id] || {};
    for (const mo of MONTHS) {
      if (row[mo]?.checked && !row[mo].paid) n++;
    }
    return n;
  }, 0);

  const filteredMembers = filter
    ? members.filter(
        (m) => m.name.includes(filter) || String(m.memberNo).includes(filter),
      )
    : members;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-gray-800">{category} 월정입금 (일괄)</h1>
        <p className="text-xs text-gray-500 mt-1">
          입금일자를 선택하면 해당 연도의 입금 상태를 표시합니다. <strong>◯</strong> 는 이미
          입금된 월, 빈 셀은 체크박스로 입금 처리할 수 있습니다. <strong>체크하면 월정액이
          자동으로 채워지고</strong>, 키보드 ↑↓←→ 로 셀 이동, <kbd>Space</kbd> 로 체크 토글.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-700">
          {info}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">입금일자</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">회원 검색</label>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="이름 또는 번호"
            className="rounded border border-gray-300 px-2 py-1 text-sm w-40"
          />
        </div>
        <div className="text-xs text-gray-600 ml-2">
          선택 <strong className="text-blue-700">{selectedCount}</strong> 건 / 합계{" "}
          <strong className="text-blue-700 font-mono">{fmt(selectedTotal)}</strong> 원
        </div>
        <button
          type="button"
          onClick={saveSelected}
          disabled={saving || selectedCount === 0}
          className="ml-auto rounded bg-fuchsia-600 px-4 py-1.5 text-sm text-white font-semibold hover:bg-fuchsia-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "선택 저장"}
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">불러오는 중...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50 text-[11px] text-gray-600 sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left font-medium w-12">번호</th>
                <th className="px-2 py-1 text-left font-medium w-24">
                  이름 <span className="text-[10px] text-gray-400">/ 월정액</span>
                </th>
                {MONTHS.map((mo) => (
                  <th key={mo} className="px-1 py-1 text-center font-medium w-20">
                    <div className="mb-1">{mo}월</div>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleCol(mo, true)}
                        className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded border border-blue-300 hover:bg-blue-200 font-semibold"
                        title="이 월 전체 체크"
                      >
                        전체
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCol(mo, false)}
                        className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded border border-gray-300 hover:bg-gray-200"
                        title="이 월 전체 해제"
                      >
                        해제
                      </button>
                    </div>
                  </th>
                ))}
                <th className="px-1 py-1 text-center font-medium w-20">행</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((m, rowIdx) => {
                const row = matrix[m.id] || {};
                const rowSelectedAmt = MONTHS.reduce((s, mo) => {
                  const c = row[mo];
                  if (c && !c.paid && c.checked) {
                    return s + (parseInt(c.amount.replace(/[^\d]/g, ""), 10) || 0);
                  }
                  return s;
                }, 0);
                return (
                  <tr key={m.id} className="border-b last:border-b-0 hover:bg-blue-50/30">
                    <td className="px-2 py-1 font-mono text-gray-500">{m.memberNo}</td>
                    <td className="px-2 py-1">
                      <div className="font-medium text-gray-800">{m.name}</div>
                      {m.monthlyAmount ? (
                        <div className="text-[10px] text-gray-500 font-mono">
                          {fmt(m.monthlyAmount)}
                        </div>
                      ) : null}
                    </td>
                    {MONTHS.map((mo, colIdx) => {
                      const c = row[mo];
                      if (!c) return <td key={mo} />;
                      if (c.paid) {
                        return (
                          <td
                            key={mo}
                            className="px-1 py-1 text-center bg-green-50 text-green-700"
                            title="이미 입금됨"
                          >
                            <div className="text-base leading-none">◯</div>
                          </td>
                        );
                      }
                      return (
                        <td key={mo} className="px-1 py-1">
                          <div className="flex items-center gap-0.5">
                            <input
                              type="checkbox"
                              checked={c.checked}
                              onChange={(e) =>
                                toggleCell(m, mo, e.target.checked)
                              }
                              className="w-3.5 h-3.5 rounded border-gray-300 text-fuchsia-600"
                            />
                            <input
                              ref={(el) => {
                                cellRefs.current.set(`${m.id}:${mo}`, el);
                              }}
                              type="text"
                              inputMode="numeric"
                              value={
                                c.amount === ""
                                  ? ""
                                  : (parseInt(c.amount, 10) || 0).toLocaleString()
                              }
                              onChange={(e) =>
                                setCell(m.id, mo, {
                                  amount: e.target.value.replace(/[^\d]/g, ""),
                                })
                              }
                              onKeyDown={(e) => onCellKey(e, rowIdx, colIdx, filteredMembers)}
                              placeholder="0"
                              className={`w-full rounded border border-gray-200 px-1 py-0.5 text-right font-mono text-[11px] ${
                                c.checked ? "bg-yellow-50 border-yellow-300" : ""
                              }`}
                            />
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-1 py-1 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleRow(m.id, true)}
                          className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded border border-blue-300 hover:bg-blue-200 font-semibold"
                          title="이 행 전체 체크"
                        >
                          전체
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleRow(m.id, false)}
                          className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded border border-gray-300 hover:bg-gray-200"
                          title="이 행 전체 해제"
                        >
                          해제
                        </button>
                      </div>
                      {rowSelectedAmt > 0 && (
                        <div className="text-[10px] text-blue-700 font-mono mt-1">
                          {fmt(rowSelectedAmt)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={MONTHS.length + 3} className="px-3 py-8 text-center text-gray-400">
                    회원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
