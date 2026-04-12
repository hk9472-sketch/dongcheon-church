"use client";

import { useEffect, useState, useCallback } from "react";

interface Dept {
  id: number;
  name: string;
}

interface Group {
  id: number;
  name: string;
}

interface AttRow {
  memberName: string;
  att1: number; att2: number; att3: number; att4: number; att5: number;
  rt1: number; rt2: number; rt3: number; rt4: number; rt5: number;
  note: string;
  toDelete: boolean;
}

const ATT_COLS = ["주전", "주후", "삼야", "오야", "새벽"];

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sumAtt(row: AttRow) {
  return row.att1 + row.att2 + row.att3 + row.att4 + row.att5;
}

function sumRt(row: AttRow) {
  return row.rt1 + row.rt2 + row.rt3 + row.rt4 + row.rt5;
}

function emptyRow(memberName: string): AttRow {
  return { memberName, att1: 0, att2: 0, att3: 0, att4: 0, att5: 0, rt1: 0, rt2: 0, rt3: 0, rt4: 0, rt5: 0, note: "", toDelete: false };
}

export default function GradePage() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<number>(0);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number>(0);
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<AttRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  // 구분 로드
  useEffect(() => {
    fetch("/api/council/depts")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setDepts(data);
          if (data.length > 0) setSelectedDeptId(data[0].id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 구역 로드 (구분 변경 시)
  useEffect(() => {
    if (!selectedDeptId) return;
    fetch(`/api/council/groups?deptId=${selectedDeptId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setGroups(data);
          if (data.length > 0) setSelectedGroupId(data[0].id);
          else setSelectedGroupId(0);
        }
      });
  }, [selectedDeptId]);

  // 출석 데이터 로드
  const loadAttendance = useCallback(async () => {
    if (!selectedGroupId || !date) { setRows([emptyRow("")]); return; }

    const res = await fetch(`/api/council/attendance?groupId=${selectedGroupId}&date=${date}`);
    const saved = await res.json();
    const savedArr = Array.isArray(saved) ? saved : [];

    if (savedArr.length > 0) {
      const newRows: AttRow[] = savedArr.map((s: Record<string, unknown>) => ({
        memberName: (s.memberName as string) || "",
        att1: s.att1 as number, att2: s.att2 as number, att3: s.att3 as number, att4: s.att4 as number, att5: s.att5 as number,
        rt1: s.rt1 as number, rt2: s.rt2 as number, rt3: s.rt3 as number, rt4: s.rt4 as number, rt5: s.rt5 as number,
        note: (s.note as string) || "",
        toDelete: false,
      }));
      setRows(newRows);
    } else {
      setRows([emptyRow("")]);
    }
  }, [selectedGroupId, date]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  // 행 값 변경
  const updateRow = (idx: number, field: keyof AttRow, value: number | string | boolean) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  // 줄 추가
  const addRow = () => {
    setRows((prev) => {
      const newRow = emptyRow("");
      // 빈 이름(집계) 행이 마지막에 있으면 그 앞에 추가
      const lastIdx = prev.length - 1;
      if (lastIdx >= 0 && !prev[lastIdx].memberName.trim()) {
        return [...prev.slice(0, lastIdx), newRow, prev[lastIdx]];
      }
      return [...prev, newRow];
    });
  };

  // 이전 명단 불러오기
  const loadPreviousNames = async () => {
    if (!selectedGroupId) return;
    const res = await fetch(`/api/council/attendance/previous-names?groupId=${selectedGroupId}`);
    const data = await res.json();
    if (data.names && data.names.length > 0) {
      const newRows: AttRow[] = data.names.map((name: string) => emptyRow(name));
      newRows.push(emptyRow("")); // 집계 행
      setRows(newRows);
      setMessage(`${data.date} 명단을 불러왔습니다.`);
      setTimeout(() => setMessage(""), 2000);
    } else {
      setMessage("이전 명단이 없습니다.");
      setTimeout(() => setMessage(""), 2000);
    }
  };

  // 저장
  const handleSave = async () => {
    if (!selectedGroupId || !date) return;

    // 삭제 체크된 행 제외
    const rowsToSave = rows.filter((r) => !r.toDelete);

    // 빈 이름 행 1개만 허용
    const blankRows = rowsToSave.filter((r) => !r.memberName.trim());
    if (blankRows.length > 1) {
      setMessage("빈 이름 행은 1개만 허용됩니다.");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/council/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: selectedGroupId,
          date,
          rows: rowsToSave.map((r) => ({
            memberName: r.memberName.trim() || null,
            att1: r.att1, att2: r.att2, att3: r.att3, att4: r.att4, att5: r.att5,
            rt1: r.rt1, rt2: r.rt2, rt3: r.rt3, rt4: r.rt4, rt5: r.rt5,
            note: r.note || null,
          })),
        }),
      });

      if (res.ok) {
        setMessage("저장되었습니다.");
        // 삭제된 행 제거하여 화면 갱신
        setRows(rows.filter((r) => !r.toDelete));
        setTimeout(() => setMessage(""), 2000);
      } else {
        const err = await res.json();
        setMessage(err.error || "저장 실패");
      }
    } catch {
      setMessage("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-gray-400">로딩 중...</div>;

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  return (
    <div className="flex gap-4 flex-col lg:flex-row">
      {/* 좌측: 구분 선택 + 구역 목록 */}
      <div className="lg:w-48 shrink-0">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 bg-indigo-50 border-b border-gray-200">
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(Number(e.target.value))}
              className="w-full text-sm font-bold text-indigo-800 bg-transparent border-0 focus:ring-0 p-0 cursor-pointer"
            >
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="divide-y divide-gray-100">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGroupId(g.id)}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                  selectedGroupId === g.id
                    ? "bg-indigo-100 text-indigo-800 font-medium"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <div className="font-medium">{g.name}</div>
              </button>
            ))}
            {groups.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">구역 없음</div>
            )}
          </div>
        </div>
      </div>

      {/* 우측: 출석 입력 */}
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-800">
                {selectedGroup ? selectedGroup.name : "구역을 선택하세요"}
              </h2>
              {selectedGroupId > 0 && (
                <button
                  onClick={loadPreviousNames}
                  className="px-2.5 py-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 transition-colors"
                >
                  이전 명단 불러오기
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>

          {selectedGroupId > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th rowSpan={2} className="border border-gray-300 px-2 py-1 text-center w-20 sticky left-0 bg-gray-100 z-10">성명</th>
                    <th colSpan={6} className="border border-gray-300 px-1 py-1 text-center bg-blue-50">출석</th>
                    <th colSpan={6} className="border border-gray-300 px-1 py-1 text-center bg-green-50">실시간</th>
                    <th rowSpan={2} className="border border-gray-300 px-2 py-1 text-center w-24">비고</th>
                    <th rowSpan={2} className="border border-gray-300 px-1 py-1 text-center w-10">삭제</th>
                  </tr>
                  <tr className="bg-gray-50">
                    {ATT_COLS.map((c) => <th key={`a-${c}`} className="border border-gray-300 px-1 py-1 text-center bg-blue-50 w-10">{c}</th>)}
                    <th className="border border-gray-300 px-1 py-1 text-center bg-blue-50 w-10">합계</th>
                    {ATT_COLS.map((c) => <th key={`r-${c}`} className="border border-gray-300 px-1 py-1 text-center bg-green-50 w-10">{c}</th>)}
                    <th className="border border-gray-300 px-1 py-1 text-center bg-green-50 w-10">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const isAgg = !row.memberName.trim();
                    return (
                      <tr key={idx} className={`${row.toDelete ? "bg-red-50 opacity-50" : isAgg ? "bg-yellow-50 font-semibold" : "hover:bg-gray-50"}`}>
                        {/* 성명 */}
                        <td className={`border border-gray-300 px-0 py-0 text-center sticky left-0 z-10 ${row.toDelete ? "bg-red-50" : isAgg ? "bg-yellow-50" : "bg-white"}`}>
                          <input
                            type="text"
                            value={row.memberName}
                            onChange={(e) => updateRow(idx, "memberName", e.target.value)}
                            className={`w-full px-2 py-1 text-xs border-0 bg-transparent text-center focus:ring-1 focus:ring-indigo-300 ${isAgg ? "placeholder:text-yellow-600" : ""}`}
                            placeholder={isAgg ? "(집계)" : ""}
                          />
                        </td>
                        {/* 출석 5개 */}
                        {(["att1", "att2", "att3", "att4", "att5"] as const).map((f) => (
                          <td key={f} className="border border-gray-300 px-0 py-0 text-center">
                            <input
                              type="number" min={0}
                              value={row[f]}
                              onChange={(e) => updateRow(idx, f, Number(e.target.value) || 0)}
                              className="w-full text-center py-1 text-xs border-0 bg-transparent focus:ring-1 focus:ring-indigo-300"
                            />
                          </td>
                        ))}
                        <td className="border border-gray-300 px-1 py-1 text-center bg-blue-50/50">{sumAtt(row)}</td>
                        {/* 실시간 5개 */}
                        {(["rt1", "rt2", "rt3", "rt4", "rt5"] as const).map((f) => (
                          <td key={f} className="border border-gray-300 px-0 py-0 text-center">
                            <input
                              type="number" min={0}
                              value={row[f]}
                              onChange={(e) => updateRow(idx, f, Number(e.target.value) || 0)}
                              className="w-full text-center py-1 text-xs border-0 bg-transparent focus:ring-1 focus:ring-green-300"
                            />
                          </td>
                        ))}
                        <td className="border border-gray-300 px-1 py-1 text-center bg-green-50/50">{sumRt(row)}</td>
                        {/* 비고 */}
                        <td className="border border-gray-300 px-0 py-0">
                          <input
                            type="text"
                            value={row.note}
                            onChange={(e) => updateRow(idx, "note", e.target.value)}
                            className="w-full px-1 py-1 text-xs border-0 bg-transparent focus:ring-1 focus:ring-gray-300"
                          />
                        </td>
                        {/* 삭제 체크 */}
                        <td className="border border-gray-300 px-0 py-0 text-center">
                          <input
                            type="checkbox"
                            checked={row.toDelete}
                            onChange={(e) => updateRow(idx, "toDelete", e.target.checked)}
                            className="w-4 h-4 accent-red-600"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {selectedGroupId > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={addRow}
                  className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 border border-gray-300 transition-colors"
                >
                  줄추가
                </button>
                {message && (
                  <span className={`text-sm ${message.includes("실패") || message.includes("오류") || message.includes("허용") ? "text-red-600" : "text-green-600"}`}>
                    {message}
                  </span>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
