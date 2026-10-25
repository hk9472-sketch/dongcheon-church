"use client";

import { useCallback, useEffect, useState } from "react";

interface AccUnit {
  id: number;
  name: string;
  isActive: boolean;
}

interface Fund {
  id: number;
  unitId: number;
  name: string;
  kind: string;
  bankName: string | null;
  accountNo: string | null;
  isDefault: boolean;
  sortOrder: number;
  isActive: boolean;
  description: string | null;
  unit: { id: number; name: string };
}

const KINDS = ["보통", "정기", "현금", "기타"];

const emptyForm = {
  unitId: 0,
  name: "",
  kind: "보통",
  bankName: "",
  accountNo: "",
  isDefault: false,
  sortOrder: 0,
  isActive: true,
  description: "",
};

export default function FundSettingsPage() {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const [u, f] = await Promise.all([
      fetch("/api/accounting/units").then((r) => r.json()),
      fetch("/api/accounting/funds").then((r) => r.json()),
    ]);
    const unitList: AccUnit[] = (Array.isArray(u) ? u : u.units || []).filter((x: AccUnit) => x.isActive);
    setUnits(unitList);
    setFunds(Array.isArray(f) ? f : []);
    setForm((p) => (p.unitId ? p : { ...p, unitId: unitList[0]?.id ?? 0 }));
  }, []);

  useEffect(() => {
    load().catch(() => setMsg({ type: "err", text: "목록을 불러오지 못했습니다." }));
  }, [load]);

  function startNew(unitId?: number) {
    setEditingId(null);
    setForm({ ...emptyForm, unitId: unitId ?? units[0]?.id ?? 0 });
    setMsg(null);
  }

  function startEdit(f: Fund) {
    setEditingId(f.id);
    setForm({
      unitId: f.unitId,
      name: f.name,
      kind: f.kind,
      bankName: f.bankName || "",
      accountNo: f.accountNo || "",
      isDefault: f.isDefault,
      sortOrder: f.sortOrder,
      isActive: f.isActive,
      description: f.description || "",
    });
    setMsg(null);
  }

  async function save() {
    if (!form.unitId || !form.name.trim()) {
      setMsg({ type: "err", text: "회계단위와 통장 이름은 필수입니다." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(editingId ? `/api/accounting/funds/${editingId}` : "/api/accounting/funds", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "저장 실패");
      setMsg({ type: "ok", text: editingId ? "수정했습니다." : "등록했습니다." });
      if (!editingId) startNew(form.unitId);
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId || !confirm("이 통장을 삭제할까요? (사용 내역이 있으면 삭제되지 않습니다)")) return;
    const res = await fetch(`/api/accounting/funds/${editingId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ type: "err", text: data.error || "삭제 실패" });
      return;
    }
    startNew(form.unitId);
    setMsg({ type: "ok", text: "삭제했습니다." });
    await load();
  }

  const input =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500";

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-2">통장관리</h1>
      <p className="text-sm text-gray-500 mb-6">
        회계단위마다 입출금 통장을 등록합니다. 전표는 통장을 선택해 입력하고, 통장 사이 이동은
        [통장현황·이체]에서 이체로 기록합니다. 계좌번호는 확인되는 대로 입력하면 됩니다.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-teal-50 text-teal-800">
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">통장</th>
                <th className="px-3 py-2 text-left font-medium">종류</th>
                <th className="px-3 py-2 text-left font-medium">은행 / 계좌번호</th>
                <th className="px-3 py-2 text-center font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const list = funds.filter((f) => f.unitId === u.id);
                return [
                  <tr key={`u${u.id}`} className="bg-gray-50 border-t border-gray-200">
                    <td colSpan={5} className="px-3 py-1.5 text-xs font-bold text-gray-600">
                      {u.name}
                      <button
                        onClick={() => startNew(u.id)}
                        className="ml-2 text-teal-600 font-normal hover:underline"
                      >
                        + 통장 추가
                      </button>
                    </td>
                  </tr>,
                  ...list.map((f) => (
                    <tr
                      key={f.id}
                      onClick={() => startEdit(f)}
                      className={`border-t border-gray-100 cursor-pointer hover:bg-teal-50 ${
                        editingId === f.id ? "bg-teal-50" : ""
                      } ${f.isActive ? "" : "text-gray-400"}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs">F{String(f.id).padStart(3, "0")}</td>
                      <td className="px-3 py-2">
                        {f.name}
                        {f.isDefault && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-teal-100 text-teal-700">기본</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{f.kind}</td>
                      <td className="px-3 py-2 text-xs">
                        {f.bankName || f.accountNo ? (
                          `${f.bankName || ""} ${f.accountNo || ""}`
                        ) : (
                          <span className="text-amber-600">계좌 미입력</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-xs">{f.isActive ? "사용" : "중지"}</td>
                    </tr>
                  )),
                  list.length === 0 && (
                    <tr key={`e${u.id}`}>
                      <td colSpan={5} className="px-3 py-2 text-xs text-gray-400">등록된 통장 없음</td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-3 h-fit">
          <h2 className="text-sm font-bold text-gray-700">{editingId ? "통장 수정" : "통장 등록"}</h2>
          {msg && (
            <div
              className={`px-3 py-2 rounded text-sm ${
                msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}
            >
              {msg.text}
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">회계단위</label>
            <select
              value={form.unitId}
              disabled={!!editingId}
              onChange={(e) => setForm({ ...form, unitId: Number(e.target.value) })}
              className={`${input} disabled:bg-gray-50`}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">통장 이름</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={input}
              placeholder="예: 일반회계 보통예금"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">종류</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={input}>
                {KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">정렬순서</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                className={input}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">은행</label>
              <input
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                className={input}
                placeholder="예: 농협"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">계좌번호</label>
              <input
                value={form.accountNo}
                onChange={(e) => setForm({ ...form, accountNo: e.target.value })}
                className={input}
                placeholder="나중에 입력 가능"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">설명</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={input}
            />
          </div>
          <div className="flex gap-4 text-sm text-gray-600">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              />
              기본 통장
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              사용
            </label>
          </div>
          <p className="text-[11px] text-gray-400">
            기본 통장: 통장을 따로 고르지 않은 전표(연보 자동반영 등)가 들어가는 통장. 회계단위마다 1개.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : editingId ? "수정" : "등록"}
            </button>
            {editingId && (
              <>
                <button onClick={remove} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">
                  삭제
                </button>
                <button
                  onClick={() => startNew(form.unitId)}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  취소
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
