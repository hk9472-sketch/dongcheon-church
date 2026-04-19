"use client";

import { useCallback, useEffect, useState } from "react";
import HelpButton from "@/components/HelpButton";

/* ───── types ───── */
interface OfferingMember {
  id: number;
  name: string;
  groupName: string | null;
  familyId: number | null;
  isActive: boolean;
  family: { id: number; name: string } | null;
  members: { id: number; name: string }[];
}

/* ───── component ───── */
export default function OfferingMembersPage() {
  const [members, setMembers] = useState<OfferingMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [groups, setGroups] = useState<string[]>([]);

  // modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formGroup, setFormGroup] = useState("");
  const [formFamilyId, setFormFamilyId] = useState<number | null>(null);
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [formId, setFormId] = useState("");
  const [deleting, setDeleting] = useState(false);

  // family lookup
  const [familyLookupName, setFamilyLookupName] = useState("");

  /* ---- fetch members ---- */
  const fetchMembers = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchName) params.set("name", searchName);
    if (filterGroup) params.set("groupName", filterGroup);
    fetch(`/api/accounting/offering/members?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          setMembers(d);
          // extract unique groups
          const gs = [...new Set(d.map((m: OfferingMember) => m.groupName).filter(Boolean))] as string[];
          gs.sort();
          setGroups(gs);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [searchName, filterGroup]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);


  /* ---- open modal ---- */
  function openCreate() {
    setEditId(null);
    setFormId("");
    setFormName("");
    setFormGroup("");
    setFormFamilyId(null);
    setFormActive(true);
    setFamilyLookupName("");
    setMessage(null);
    setShowModal(true);
  }

  function openEdit(m: OfferingMember) {
    setEditId(m.id);
    setFormName(m.name);
    setFormGroup(m.groupName || "");
    setFormFamilyId(m.familyId);
    setFormActive(m.isActive);
    setFamilyLookupName(m.family ? m.family.name : "");
    setMessage(null);
    setShowModal(true);
  }

  /* ---- save ---- */
  async function handleSave() {
    if (!formName.trim()) {
      setMessage({ type: "err", text: "성명을 입력하세요." });
      return;
    }
    setSaving(true);
    setMessage(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      name: formName.trim(),
      groupName: formGroup.trim() || null,
      familyId: formFamilyId,
      isActive: formActive,
    };
    // 신규 등록 시 번호 직접 지정
    if (!editId && formId.trim()) {
      payload.id = parseInt(formId.trim(), 10);
    }
    try {
      const url = editId
        ? `/api/accounting/offering/members/${editId}`
        : "/api/accounting/offering/members";
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "저장에 실패했습니다.");
      }
      setMessage({ type: "ok", text: editId ? "수정되었습니다." : "등록되었습니다." });
      setShowModal(false);
      fetchMembers();
    } catch (e: unknown) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "오류가 발생했습니다." });
    } finally {
      setSaving(false);
    }
  }

  /* ---- delete ---- */
  async function handleDelete() {
    if (!editId) return;
    if (!confirm(`${formName} (번호: ${editId})을(를) 삭제하시겠습니까?\n연보 내역이 있으면 삭제할 수 없습니다.`)) return;
    setDeleting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/accounting/offering/members/${editId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "삭제에 실패했습니다.");
      }
      setMessage({ type: "ok", text: "삭제되었습니다." });
      setShowModal(false);
      fetchMembers();
    } catch (e: unknown) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "오류가 발생했습니다." });
    } finally {
      setDeleting(false);
    }
  }

  /* ---- delete from list ---- */
  async function handleDeleteFromList(id: number, name: string) {
    if (!confirm(`${name} (번호: ${id})을(를) 삭제하시겠습니까?\n연보 내역이 있으면 삭제할 수 없습니다.`)) return;
    try {
      const res = await fetch(`/api/accounting/offering/members/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "삭제에 실패했습니다.");
      }
      setMessage({ type: "ok", text: "삭제되었습니다." });
      fetchMembers();
    } catch (e: unknown) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "오류가 발생했습니다." });
    }
  }

  /* ---- search handler ---- */
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchMembers();
  }

  /* ======== render ======== */
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">관리번호 관리 <HelpButton slug="offering-members" /></h1>

      {/* search bar */}
      <form onSubmit={handleSearch} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">이름 검색</label>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="이름"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">구역</label>
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 w-36"
            >
              <option value="">전체</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors"
          >
            검색
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors ml-auto"
          >
            + 신규등록
          </button>
        </div>
      </form>

      {/* message (outside modal) */}
      {!showModal && message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm ${
          message.type === "ok"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.text}
        </div>
      )}

      {/* table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-teal-50 text-teal-800">
                <th className="px-4 py-3 text-left font-medium w-20">번호</th>
                <th className="px-4 py-3 text-left font-medium">성명</th>
                <th className="px-4 py-3 text-left font-medium">구역</th>
                <th className="px-4 py-3 text-left font-medium w-24">공동번호</th>
                <th className="px-4 py-3 text-left font-medium">가족구성원</th>
                <th className="px-4 py-3 text-center font-medium w-20">상태</th>
                <th className="px-4 py-3 text-center font-medium w-16">삭제</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    로딩 중...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    등록된 멤버가 없습니다.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => openEdit(m)}
                    className="border-t border-gray-100 hover:bg-teal-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5 text-gray-600">{m.id}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{m.name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{m.groupName || "-"}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {m.familyId ? (
                        <span className="text-teal-600">{m.familyId}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {m.members.length > 0
                        ? m.members.map((fm) => fm.name).join(", ")
                        : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          m.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {m.isActive ? "사용" : "미사용"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFromList(m.id, m.name);
                        }}
                        className="text-red-400 hover:text-red-600 text-xs"
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
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 border-t">
          총 {members.length}명
        </div>
      </div>

      {/* modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">
              {editId ? "관리번호 수정" : "신규 등록"}
            </h2>

            {/* modal message */}
            {message && (
              <div className={`px-4 py-2.5 rounded-lg text-sm ${
                message.type === "ok"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {message.text}
              </div>
            )}

            {/* 번호 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                번호 {editId ? "" : "(미입력 시 자동 부여)"}
              </label>
              {editId ? (
                <input
                  type="text"
                  readOnly
                  value={editId}
                  className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500"
                />
              ) : (
                <input
                  type="number"
                  value={formId}
                  onChange={(e) => setFormId(e.target.value)}
                  placeholder="자동"
                  min={1}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              )}
            </div>

            {/* 성명 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">성명 *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="이름을 입력하세요"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            {/* 구역 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">구역</label>
              <input
                type="text"
                value={formGroup}
                onChange={(e) => setFormGroup(e.target.value)}
                placeholder="구역명"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            {/* 공동번호 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">공동번호 (가족 대표 번호)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={formFamilyId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormFamilyId(v ? parseInt(v, 10) : null);
                    setFamilyLookupName("");
                  }}
                  onBlur={() => {
                    // 번호 입력 후 이름 조회
                    if (formFamilyId && formFamilyId > 0) {
                      fetch(`/api/accounting/offering/members/${formFamilyId}`)
                        .then((r) => r.ok ? r.json() : Promise.reject())
                        .then((d) => setFamilyLookupName(d.name || "(없음)"))
                        .catch(() => setFamilyLookupName("(없음)"));
                    } else {
                      setFamilyLookupName("");
                    }
                  }}
                  placeholder="번호 입력"
                  min={1}
                  className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
                <span className="text-sm text-gray-600">{familyLookupName}</span>
                {formFamilyId && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormFamilyId(null);
                      setFamilyLookupName("");
                    }}
                    className="text-gray-400 hover:text-red-500 text-lg leading-none"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>

            {/* 사용여부 */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-600">사용여부</label>
              <button
                type="button"
                onClick={() => setFormActive(!formActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formActive ? "bg-teal-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formActive ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm text-gray-600">{formActive ? "사용" : "미사용"}</span>
            </div>

            {/* actions */}
            <div className="flex gap-2 pt-2">
              {editId && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "삭제 중..." : "삭제"}
                </button>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 text-sm text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
