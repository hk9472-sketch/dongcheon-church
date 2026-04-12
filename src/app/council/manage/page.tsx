"use client";

import { useEffect, useState, useCallback } from "react";
import HelpButton from "@/components/HelpButton";

interface Dept {
  id: number;
  name: string;
  sortOrder: number;
  groups: { id: number }[];
}

interface Group {
  id: number;
  deptId: number;
  name: string;
  sortOrder: number;
}

type Tab = "dept" | "group";

export default function CouncilManagePage() {
  const [tab, setTab] = useState<Tab>("dept");
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);

  // 구분 탭
  const [deptName, setDeptName] = useState("");
  const [deptSort, setDeptSort] = useState(0);
  const [editingDept, setEditingDept] = useState<Dept | null>(null);

  // 구분정보 탭
  const [selectedDeptId, setSelectedDeptId] = useState<number>(0);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupSort, setGroupSort] = useState(0);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);

  const loadDepts = useCallback(async () => {
    const res = await fetch("/api/council/depts");
    const data = await res.json();
    if (Array.isArray(data)) {
      setDepts(data);
      if (data.length > 0 && !selectedDeptId) {
        setSelectedDeptId(data[0].id);
      }
    }
    setLoading(false);
  }, [selectedDeptId]);

  useEffect(() => {
    loadDepts();
  }, [loadDepts]);

  // 구역 로드
  useEffect(() => {
    if (!selectedDeptId) return;
    fetch(`/api/council/groups?deptId=${selectedDeptId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setGroups(data);
      });
  }, [selectedDeptId]);

  // ---- 구분 CRUD ----
  const saveDept = async () => {
    if (!deptName.trim()) return;
    if (editingDept) {
      await fetch("/api/council/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingDept.id, name: deptName, sortOrder: deptSort }),
      });
      setEditingDept(null);
    } else {
      await fetch("/api/council/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deptName, sortOrder: deptSort }),
      });
    }
    setDeptName("");
    setDeptSort(0);
    loadDepts();
  };

  const deleteDept = async (id: number) => {
    if (!confirm("구분을 삭제하면 소속 구역과 출석 데이터가 모두 삭제됩니다. 진행하시겠습니까?")) return;
    await fetch("/api/council/manage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadDepts();
  };

  // ---- 구역 CRUD ----
  const saveGroup = async () => {
    if (!groupName.trim() || !selectedDeptId) return;
    if (editingGroup) {
      await fetch("/api/council/groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingGroup.id, name: groupName, sortOrder: groupSort }),
      });
      setEditingGroup(null);
    } else {
      await fetch("/api/council/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deptId: selectedDeptId, name: groupName, sortOrder: groupSort }),
      });
    }
    setGroupName("");
    setGroupSort(0);
    const res = await fetch(`/api/council/groups?deptId=${selectedDeptId}`);
    const data = await res.json();
    if (Array.isArray(data)) setGroups(data);
  };

  const deleteGroup = async (id: number) => {
    if (!confirm("구역을 삭제하면 출석 데이터가 모두 삭제됩니다. 진행하시겠습니까?")) return;
    await fetch("/api/council/groups", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const res = await fetch(`/api/council/groups?deptId=${selectedDeptId}`);
    const data = await res.json();
    if (Array.isArray(data)) setGroups(data);
  };

  if (loading) return <div className="py-12 text-center text-gray-400">로딩 중...</div>;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">권찰회 관리 <HelpButton slug="council-manage" /></h1>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {([
          ["dept", "구분"],
          ["group", "구분정보"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 구분 탭 */}
      {tab === "dept" && (
        <div>
          <div className="flex gap-2 mb-4 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">구분명</label>
              <input
                type="text" value={deptName} onChange={(e) => setDeptName(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm w-40"
                placeholder="예: 장년반"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">순서</label>
              <input
                type="number" value={deptSort} onChange={(e) => setDeptSort(Number(e.target.value))}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm w-20"
              />
            </div>
            <button onClick={saveDept} className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">
              {editingDept ? "수정" : "추가"}
            </button>
            {editingDept && (
              <button onClick={() => { setEditingDept(null); setDeptName(""); setDeptSort(0); }}
                className="px-3 py-1.5 bg-gray-200 text-gray-600 text-sm rounded hover:bg-gray-300">
                취소
              </button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-y border-gray-200">
                <th className="px-3 py-2 text-left">구분명</th>
                <th className="px-3 py-2 text-center w-20">순서</th>
                <th className="px-3 py-2 text-center w-20">구역수</th>
                <th className="px-3 py-2 text-center w-32">관리</th>
              </tr>
            </thead>
            <tbody>
              {depts.map((d) => (
                <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">{d.name}</td>
                  <td className="px-3 py-2 text-center">{d.sortOrder}</td>
                  <td className="px-3 py-2 text-center">{d.groups.length}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => { setEditingDept(d); setDeptName(d.name); setDeptSort(d.sortOrder); }}
                      className="text-blue-600 hover:underline text-xs mr-2"
                    >수정</button>
                    <button onClick={() => deleteDept(d.id)} className="text-red-600 hover:underline text-xs">삭제</button>
                  </td>
                </tr>
              ))}
              {depts.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">등록된 구분이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 구분정보 탭 */}
      {tab === "group" && (
        <div>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">구분 선택</label>
            <select value={selectedDeptId} onChange={(e) => setSelectedDeptId(Number(e.target.value))}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm">
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 mb-4 items-end flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 mb-1">구역명(반사)</label>
              <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm w-40" placeholder="예: 1구역" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">순서</label>
              <input type="number" value={groupSort} onChange={(e) => setGroupSort(Number(e.target.value))}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm w-20" />
            </div>
            <button onClick={saveGroup} className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">
              {editingGroup ? "수정" : "추가"}
            </button>
            {editingGroup && (
              <button onClick={() => { setEditingGroup(null); setGroupName(""); setGroupSort(0); }}
                className="px-3 py-1.5 bg-gray-200 text-gray-600 text-sm rounded hover:bg-gray-300">
                취소
              </button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-y border-gray-200">
                <th className="px-3 py-2 text-left">구역명(반사)</th>
                <th className="px-3 py-2 text-center w-20">순서</th>
                <th className="px-3 py-2 text-center w-32">관리</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">{g.name}</td>
                  <td className="px-3 py-2 text-center">{g.sortOrder}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => { setEditingGroup(g); setGroupName(g.name); setGroupSort(g.sortOrder); }}
                      className="text-blue-600 hover:underline text-xs mr-2"
                    >수정</button>
                    <button onClick={() => deleteGroup(g.id)} className="text-red-600 hover:underline text-xs">삭제</button>
                  </td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-8 text-center text-gray-400">등록된 구역이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
