"use client";

import { useEffect, useState, useCallback } from "react";
import HelpButton from "@/components/HelpButton";

interface AccUnit {
  id: number;
  code: string;
  name: string;
}

interface AccAccount {
  id: number;
  unitId: number;
  code: string;
  name: string;
  type: "D" | "C"; // D=수입(Debit), C=지출(Credit)
  parentId: number | null;
  level: number;
  sortOrder: number;
  description: string;
  isActive: boolean;
  children?: AccAccount[];
}

export default function AccAccountsPage() {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<AccAccount[]>([]);
  const [flatAccounts, setFlatAccounts] = useState<AccAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const emptyForm = {
    code: "",
    name: "",
    type: "D" as "D" | "C",
    parentId: null as number | null,
    level: 1,
    sortOrder: 0,
    description: "",
    isActive: true,
  };
  const [form, setForm] = useState(emptyForm);

  // 단위 목록 로드
  useEffect(() => {
    fetch("/api/accounting/units")
      .then((r) => r.json())
      .then((d) => {
        const all = Array.isArray(d) ? d : d.units || [];
        const activeUnits = all.filter((u: AccUnit & { isActive: boolean }) => u.isActive);
        setUnits(activeUnits);
        if (activeUnits.length > 0 && !selectedUnitId) {
          setSelectedUnitId(activeUnits[0].id);
        }
      })
      .catch(() => setError("회계단위를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  // 계정과목 로드
  const fetchAccounts = useCallback(async () => {
    if (!selectedUnitId) return;
    try {
      const res = await fetch(`/api/accounting/accounts?unitId=${selectedUnitId}`);
      const data = await res.json();
      const flat: AccAccount[] = Array.isArray(data) ? data : data.accounts || [];
      setFlatAccounts(flat);
      setAccounts(buildTree(flat));
    } catch {
      setError("계정과목을 불러올 수 없습니다.");
    }
  }, [selectedUnitId]);

  useEffect(() => {
    if (selectedUnitId) {
      fetchAccounts();
      resetForm();
    }
  }, [selectedUnitId, fetchAccounts]);

  // 트리 구조 변환
  const buildTree = (items: AccAccount[]): AccAccount[] => {
    const map = new Map<number, AccAccount>();
    const roots: AccAccount[] = [];

    items.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });

    items.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortNodes = (nodes: AccAccount[]): AccAccount[] => {
      nodes.sort((a, b) => a.sortOrder - b.sortOrder);
      nodes.forEach((n) => {
        if (n.children && n.children.length > 0) sortNodes(n.children);
      });
      return nodes;
    };

    return sortNodes(roots);
  };

  const resetForm = () => {
    setSelectedId(null);
    setForm(emptyForm);
    setError("");
  };

  const handleSelect = (account: AccAccount) => {
    setSelectedId(account.id);
    setForm({
      code: account.code,
      name: account.name,
      type: account.type,
      parentId: account.parentId,
      level: account.level,
      sortOrder: account.sortOrder,
      description: account.description || "",
      isActive: account.isActive,
    });
    setError("");
  };

  const handleAddChild = () => {
    if (!selectedId) return;
    const parent = flatAccounts.find((a) => a.id === selectedId);
    if (!parent) return;

    setSelectedId(null);
    setForm({
      ...emptyForm,
      parentId: parent.id,
      type: parent.type,
      level: parent.level + 1,
      code: parent.code + "-",
    });
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedUnitId) return;
    if (!form.code.trim() || !form.name.trim()) {
      setError("코드와 이름을 입력해주세요.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const url = selectedId
        ? `/api/accounting/accounts/${selectedId}`
        : "/api/accounting/accounts";
      const method = selectedId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, unitId: selectedUnitId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "저장에 실패했습니다.");
      }

      resetForm();
      await fetchAccounts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!confirm("정말 삭제하시겠습니까? 하위 계정과목이 있으면 삭제할 수 없습니다.")) return;

    try {
      const res = await fetch(`/api/accounting/accounts/${selectedId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "삭제에 실패했습니다.");
      }
      resetForm();
      await fetchAccounts();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // 트리 노드 렌더링
  const renderTreeNode = (node: AccAccount, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedId === node.id;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded transition-colors text-sm ${
            isSelected
              ? "bg-teal-100 text-teal-800"
              : "hover:bg-gray-100 text-gray-700"
          } ${!node.isActive ? "opacity-50" : ""}`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => handleSelect(node)}
        >
          {/* 확장/축소 버튼 */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <span className="w-5" />
          )}

          {/* 코드 + 이름 */}
          <span className="font-mono text-xs text-gray-400 mr-1">{node.code}</span>
          <span className={node.type === "D" ? "text-blue-700" : "text-red-600"}>
            {node.name}
          </span>
        </div>

        {/* 하위 노드 */}
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        불러오는 중...
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">계정과목 관리 <HelpButton slug="accounting-accounts" /></h1>

      {/* 회계단위 선택 */}
      <div className="mb-4">
        <select
          value={selectedUnitId || ""}
          onChange={(e) => setSelectedUnitId(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
        >
          {units.length === 0 && <option value="">회계단위 없음</option>}
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name} ({unit.code})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 트리 뷰 */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-teal-50 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-teal-800">계정과목 트리</h2>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-blue-700">&#9679; 수입(D)</span>
                <span className="text-red-600">&#9679; 지출(C)</span>
              </div>
            </div>
            <div className="p-2 max-h-[600px] overflow-y-auto">
              {accounts.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  등록된 계정과목이 없습니다.
                </div>
              ) : (
                accounts.map((node) => renderTreeNode(node))
              )}
            </div>
          </div>
        </div>

        {/* 상세 폼 */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-4">
              {selectedId ? "계정과목 수정" : "계정과목 추가"}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">코드</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="예: 100"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">이름</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="예: 십일조"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">구분</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="type"
                      value="D"
                      checked={form.type === "D"}
                      onChange={() => setForm({ ...form, type: "D" })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-blue-700">수입(D)</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="type"
                      value="C"
                      checked={form.type === "C"}
                      onChange={() => setForm({ ...form, type: "C" })}
                      className="text-red-600 focus:ring-red-500"
                    />
                    <span className="text-red-600">지출(C)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">상위 계정</label>
                <select
                  value={form.parentId ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      parentId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">없음 (최상위)</option>
                  {flatAccounts
                    .filter((a) => a.id !== selectedId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {"  ".repeat(a.level - 1)}
                        {a.code} - {a.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">레벨</label>
                  <input
                    type="number"
                    value={form.level}
                    onChange={(e) => setForm({ ...form, level: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    min={1}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">정렬순서</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">설명</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  rows={2}
                  placeholder="선택 사항"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActiveAccount"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                />
                <label htmlFor="isActiveAccount" className="text-sm text-gray-600">
                  사용
                </label>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex flex-wrap gap-2 mt-5">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "저장 중..." : selectedId ? "수정" : "추가"}
              </button>
              {selectedId && (
                <>
                  <button
                    onClick={handleAddChild}
                    className="px-4 py-2 bg-blue-50 text-blue-700 text-sm rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    하위추가
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-50 text-red-600 text-sm rounded-lg hover:bg-red-100 transition-colors"
                  >
                    삭제
                  </button>
                </>
              )}
              {(selectedId || form.code) && (
                <button
                  onClick={resetForm}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                >
                  초기화
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
