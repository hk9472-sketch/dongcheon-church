"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccountPerms } from "@/lib/useAccountPerms";
import HelpButton from "@/components/HelpButton";

interface DonorRow {
  id: number;
  name: string | null;
  groupName: string | null;
  residentNumber: string | null; // 마스킹됨
  hasResidentNumber: boolean;
  address: string | null;
  phone: string | null;
  donorEmail: string | null;
}

interface EditForm {
  memberId: number;
  residentNumber: string;
  address: string;
  phone: string;
  donorEmail: string;
  _reveal: boolean;
}

export default function DonorInfoPage() {
  const { hasMemberEdit, loading: permLoading } = useAccountPerms();
  const [rows, setRows] = useState<DonorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const fetchList = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/accounting/offering/donor-info?${params}`);
      const data = await res.json();
      if (res.ok) {
        setRows(data.rows || []);
        setTotal(data.total || 0);
      } else {
        setErr(data.error || "조회 실패");
        setRows([]);
      }
    } catch {
      setErr("네트워크 오류");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => {
    if (!permLoading) fetchList();
  }, [fetchList, permLoading]);

  async function openEdit(id: number) {
    setMsg("");
    setErr("");
    // 수정 진입 시 원본(주민번호 포함) 조회
    try {
      const res = await fetch(`/api/accounting/offering/donor-info?memberId=${id}&reveal=1`);
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "조회 실패");
        return;
      }
      setEditing({
        memberId: id,
        residentNumber: data.residentNumber || "",
        address: data.address || "",
        phone: data.phone || "",
        donorEmail: data.donorEmail || "",
        _reveal: true,
      });
    } catch {
      setErr("네트워크 오류");
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/accounting/offering/donor-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: editing.memberId,
          residentNumber: editing.residentNumber,
          address: editing.address,
          phone: editing.phone,
          donorEmail: editing.donorEmail,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg("저장되었습니다.");
        setEditing(null);
        await fetchList();
      } else {
        setErr(data.error || "저장 실패");
      }
    } catch {
      setErr("네트워크 오류");
    }
  }

  if (permLoading) {
    return <div className="text-gray-400 text-center py-12">권한 확인 중...</div>;
  }

  if (!hasMemberEdit) {
    return (
      <div className="max-w-lg mx-auto mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-sm text-yellow-800">
          기부자 정보 조회/수정에는 <strong>관리번호 수정 권한(accMemberEditAccess)</strong>이 필요합니다.
        </p>
        <p className="text-xs text-yellow-700 mt-2">
          관리자에게 문의하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">기부자 정보 <HelpButton slug="offering-donor-info" /></h1>
        <p className="text-xs text-gray-500 mt-1">
          기부금영수증(국세청 서식 29호) 발급용 기부자 정보. 주민등록번호는 목록에서 마스킹 표시되며 수정 화면에서만 원본 조회됩니다.
        </p>
      </div>

      {/* 검색 */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (setPage(1), fetchList())}
          placeholder="성명 또는 구역 검색"
          className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <button
          onClick={() => { setPage(1); fetchList(); }}
          className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          검색
        </button>
      </div>

      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 rounded px-3 py-2">{msg}</p>}
      {err && <p className="text-sm text-red-700 bg-red-50 rounded px-3 py-2">{err}</p>}

      {/* 목록 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-indigo-50 border-b border-gray-200 text-indigo-800">
                <th className="px-3 py-2 text-right font-medium w-16">번호</th>
                <th className="px-3 py-2 text-left font-medium w-24">성명</th>
                <th className="px-3 py-2 text-left font-medium w-24">구역</th>
                <th className="px-3 py-2 text-left font-medium w-36">주민등록번호</th>
                <th className="px-3 py-2 text-left font-medium">주소</th>
                <th className="px-3 py-2 text-left font-medium w-28">연락처</th>
                <th className="px-3 py-2 text-left font-medium w-40">이메일</th>
                <th className="px-3 py-2 text-center font-medium w-20">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={8} className="py-8 text-center text-gray-400">불러오는 중...</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-gray-400">결과가 없습니다.</td></tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-right text-gray-600">{r.id}</td>
                  <td className="px-3 py-2 text-gray-800">{r.name || "-"}</td>
                  <td className="px-3 py-2 text-gray-600">{r.groupName || "-"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">
                    {r.residentNumber || <span className="text-gray-300">미등록</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{r.address || <span className="text-gray-300">-</span>}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{r.phone || <span className="text-gray-300">-</span>}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs truncate max-w-[160px]">{r.donorEmail || <span className="text-gray-300">-</span>}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => openEdit(r.id)}
                      className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100"
                    >
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 text-xs text-gray-500">
            <span>총 {total}건</span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40"
              >
                이전
              </button>
              <span className="px-3 py-1">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 수정 모달 */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-5 py-3 bg-indigo-700 text-white">
              <h2 className="text-sm font-bold">기부자 정보 수정 (관리번호 {editing.memberId})</h2>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">주민등록번호 (선택)</label>
                <input
                  type="text"
                  value={editing.residentNumber}
                  onChange={(e) => setEditing({ ...editing, residentNumber: e.target.value })}
                  placeholder="000000-0000000"
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  개인정보보호법상 고유식별정보 — 본인 동의 후 수집/보관, 영수증 발급 목적 외 사용 금지.
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">주소</label>
                <input
                  type="text"
                  value={editing.address}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">연락처</label>
                <input
                  type="text"
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  placeholder="010-0000-0000"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">영수증 수령 이메일</label>
                <input
                  type="email"
                  value={editing.donorEmail}
                  onChange={(e) => setEditing({ ...editing, donorEmail: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={saveEdit}
                className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
