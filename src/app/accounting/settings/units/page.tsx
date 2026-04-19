"use client";

import { useEffect, useState } from "react";
import HelpButton from "@/components/HelpButton";

interface AccUnit {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export default function AccUnitsPage() {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ code: "", name: "", sortOrder: 0, isActive: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchUnits = async () => {
    try {
      const res = await fetch("/api/accounting/units");
      const data = await res.json();
      setUnits(Array.isArray(data) ? data : data.units || []);
    } catch {
      setError("회계단위 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnits();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({ code: "", name: "", sortOrder: 0, isActive: true });
    setError("");
  };

  const handleEdit = (unit: AccUnit) => {
    setEditingId(unit.id);
    setForm({
      code: unit.code,
      name: unit.name,
      sortOrder: unit.sortOrder,
      isActive: unit.isActive,
    });
    setError("");
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("코드와 이름을 입력해주세요.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const url = editingId
        ? `/api/accounting/units/${editingId}`
        : "/api/accounting/units";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "저장에 실패했습니다.");
      }

      resetForm();
      await fetchUnits();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`/api/accounting/units/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "삭제에 실패했습니다.");
      }
      if (editingId === id) resetForm();
      await fetchUnits();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (unit: AccUnit) => {
    try {
      const res = await fetch(`/api/accounting/units/${unit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...unit, isActive: !unit.isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "변경에 실패했습니다.");
      }
      await fetchUnits();
    } catch (err: any) {
      setError(err.message);
    }
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
      <h1 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">회계단위 관리 <HelpButton slug="accounting-units" /></h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 목록 */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-teal-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-medium text-teal-800">코드</th>
                  <th className="px-4 py-3 text-left font-medium text-teal-800">이름</th>
                  <th className="px-4 py-3 text-center font-medium text-teal-800">정렬</th>
                  <th className="px-4 py-3 text-center font-medium text-teal-800">사용</th>
                  <th className="px-4 py-3 text-center font-medium text-teal-800">관리</th>
                </tr>
              </thead>
              <tbody>
                {units.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      등록된 회계단위가 없습니다.
                    </td>
                  </tr>
                ) : (
                  units.map((unit) => (
                    <tr
                      key={unit.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 ${
                        editingId === unit.id ? "bg-teal-50" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono text-gray-700">{unit.code}</td>
                      <td className="px-4 py-2.5 text-gray-800">{unit.name}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500">{unit.sortOrder}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => handleToggleActive(unit)}
                          className={`inline-block w-10 h-5 rounded-full transition-colors relative ${
                            unit.isActive ? "bg-teal-500" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              unit.isActive ? "left-5" : "left-0.5"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => handleEdit(unit)}
                          className="text-teal-600 hover:text-teal-800 mr-2 text-xs"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDelete(unit.id)}
                          className="text-red-500 hover:text-red-700 text-xs"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 입력 폼 */}
        <div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-4">
              {editingId ? "회계단위 수정" : "회계단위 추가"}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">코드</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="예: MAIN"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">이름</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="예: 일반회계"
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
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                />
                <label htmlFor="isActive" className="text-sm text-gray-600">
                  사용
                </label>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "저장 중..." : editingId ? "수정" : "추가"}
              </button>
              {editingId && (
                <button
                  onClick={resetForm}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
