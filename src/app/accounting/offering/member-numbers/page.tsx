"use client";

import { useEffect, useState, useCallback } from "react";

interface Item {
  memberId: number;
  memberNo: number;
  name: string;
  groupName: string | null;
}

interface Edit {
  memberId: number;
  newMemberNo: string; // 입력 편의 위해 string
  originalNo: number;
  name: string;
}

const todayStr = () => {
  const d = new Date();
  const k = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return k.toISOString().slice(0, 10);
};

export default function MemberNumbersPage() {
  const [date, setDate] = useState(todayStr());
  const [items, setItems] = useState<Item[]>([]);
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/accounting/offering/member-numbers?date=${encodeURIComponent(date)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setItems(data.items || []);
      setEdits({}); // 새 일자 → 편집 초기화
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const setEdit = (memberId: number, newMemberNo: string, originalNo: number, name: string) => {
    setEdits((prev) => ({
      ...prev,
      [memberId]: { memberId, newMemberNo, originalNo, name },
    }));
  };

  const removeEdit = (memberId: number) => {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[memberId];
      return next;
    });
  };

  const dirtyEdits = Object.values(edits).filter((e) => {
    const n = parseInt(e.newMemberNo, 10);
    return Number.isFinite(n) && n > 0 && n !== e.originalNo;
  });

  const saveAll = async () => {
    if (dirtyEdits.length === 0) return;
    if (
      !confirm(
        `${date} 기준으로 ${dirtyEdits.length}명의 관리번호를 변경합니다.\n\n` +
          dirtyEdits
            .map((e) => `· ${e.name}: ${e.originalNo} → ${e.newMemberNo}`)
            .join("\n") +
          "\n\n계속하시겠습니까?",
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounting/offering/member-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          effectiveDate: date,
          changes: dirtyEdits.map((e) => ({
            memberId: e.memberId,
            memberNo: parseInt(e.newMemberNo, 10),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      alert(`${data.applied}건 적용됨.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  const filtered = items.filter((it) => {
    if (!filter.trim()) return true;
    const f = filter.trim();
    return (
      it.name.includes(f) ||
      String(it.memberNo).includes(f) ||
      String(it.memberId).includes(f) ||
      (it.groupName && it.groupName.includes(f))
    );
  });

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">관리번호 변경</h1>
        <p className="text-xs text-gray-500 mt-1">
          기준일자 D 부터 적용될 새 번호를 입력 후 일괄 저장. 기존 번호는 그 일자까지 유효.
          내부 일련번호(개인 ID)는 변하지 않으므로 과거 데이터와 자연스럽게 연결됨.
          과거 일자도 입력 가능 (마이그레이션용).
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">기준일자</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">검색</label>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="이름·번호·구역"
            className="rounded border border-gray-300 px-2 py-1 text-sm w-48"
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
          onClick={saveAll}
          disabled={loading || dirtyEdits.length === 0}
          className="ml-auto rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {dirtyEdits.length > 0
            ? `${dirtyEdits.length}건 일괄 저장`
            : "변경된 항목 없음"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-24">내부 ID</th>
              <th className="px-3 py-2 text-left font-medium">이름</th>
              <th className="px-3 py-2 text-left font-medium">구역</th>
              <th className="px-3 py-2 text-right font-medium w-32">현재 번호</th>
              <th className="px-3 py-2 text-right font-medium w-32">새 번호</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                  불러오는 중...
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                  결과 없음
                </td>
              </tr>
            )}
            {filtered.map((it) => {
              const e = edits[it.memberId];
              const dirty =
                e &&
                e.newMemberNo !== "" &&
                parseInt(e.newMemberNo, 10) !== it.memberNo;
              return (
                <tr
                  key={it.memberId}
                  className={`border-b last:border-b-0 ${dirty ? "bg-orange-50" : ""}`}
                >
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{it.memberId}</td>
                  <td className="px-3 py-2 text-gray-800">{it.name}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{it.groupName || "-"}</td>
                  <td className="px-3 py-2 text-right font-mono">{it.memberNo}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={e?.newMemberNo ?? ""}
                      onChange={(ev) =>
                        setEdit(
                          it.memberId,
                          ev.target.value.replace(/[^\d]/g, ""),
                          it.memberNo,
                          it.name,
                        )
                      }
                      placeholder={String(it.memberNo)}
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-right font-mono"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {dirty && (
                      <button
                        type="button"
                        onClick={() => removeEdit(it.memberId)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        취소
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500">
        ※ 새 번호 칸이 비어 있으면 그 사람의 번호는 변경되지 않음. 다른 번호 입력 시 주황색 표시.
        같은 변경 묶음에서 같은 번호를 두 사람에게 할당하면 거부됨 (서버 검증).
      </div>
    </div>
  );
}
