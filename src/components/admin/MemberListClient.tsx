"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface MemberUser {
  id: number;
  userId: string;
  name: string;
  email: string | null;
  level: number;
  isAdmin: number;
  phone: string | null;
  createdAt: string;
  _count: { posts: number; comments: number };
}

interface MemberListClientProps {
  users: MemberUser[];
  total: number;
  page: number;
  totalPages: number;
  keyword: string;
  levelFilter: string;
  sortField: string;
  sortOrder: "asc" | "desc";
}

export default function MemberListClient({
  users,
  total,
  page,
  totalPages,
  keyword,
  levelFilter,
  sortField,
  sortOrder,
}: MemberListClientProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showLevelForm, setShowLevelForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newLevel, setNewLevel] = useState("10");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const allSelected =
    users.length > 0 && users.every((u) => selectedIds.has(u.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(users.map((u) => u.id)));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 정렬 URL 생성
  function sortUrl(field: string) {
    const newOrder = sortField === field && sortOrder === "asc" ? "desc" : "asc";
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (levelFilter) params.set("level", levelFilter);
    params.set("sort", field);
    params.set("order", newOrder);
    params.set("page", "1");
    return `/admin/members?${params.toString()}`;
  }

  function sortIcon(field: string) {
    if (sortField !== field) return <span className="text-gray-300 ml-0.5">&#x21C5;</span>;
    return sortOrder === "asc"
      ? <span className="text-blue-600 ml-0.5">&#x25B2;</span>
      : <span className="text-blue-600 ml-0.5">&#x25BC;</span>;
  }

  const handleResetPassword = async () => {
    if (selectedIds.size === 0) {
      showToast("변경할 회원을 선택해주세요.", "error");
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      showToast("비밀번호는 4자 이상 입력해주세요.", "error");
      return;
    }

    const confirmed = window.confirm(
      `선택한 ${selectedIds.size}명의 비밀번호를 일괄 변경하시겠습니까?`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/members/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: Array.from(selectedIds),
          newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        showToast(data.message || "비밀번호가 변경되었습니다.", "success");
        setNewPassword("");
        setShowPasswordForm(false);
        setSelectedIds(new Set());
      } else {
        showToast(data.error || "비밀번호 변경에 실패했습니다.", "error");
      }
    } catch {
      showToast("서버 오류가 발생했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleChangeLevel = async () => {
    if (selectedIds.size === 0) {
      showToast("변경할 회원을 선택해주세요.", "error");
      return;
    }

    const lv = parseInt(newLevel, 10);
    if (isNaN(lv) || lv < 1 || lv > 99) {
      showToast("레벨은 1~99 사이여야 합니다.", "error");
      return;
    }

    const confirmed = window.confirm(
      `선택한 ${selectedIds.size}명의 레벨을 ${lv}로 변경하시겠습니까?`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/members/change-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: Array.from(selectedIds),
          newLevel: lv,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        showToast(data.message || "레벨이 변경되었습니다.", "success");
        setShowLevelForm(false);
        setSelectedIds(new Set());
        window.location.reload();
      } else {
        showToast(data.error || "레벨 변경에 실패했습니다.", "error");
      }
    } catch {
      showToast("서버 오류가 발생했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMembers = async () => {
    if (selectedIds.size === 0) {
      showToast("삭제할 회원을 선택해주세요.", "error");
      return;
    }

    const confirmed = window.confirm(
      `선택한 ${selectedIds.size}명의 회원을 삭제하시겠습니까?\n\n삭제된 회원의 게시글과 댓글은 유지되지만, 로그인 및 권한 정보가 삭제됩니다.\n\n※ 최고관리자 및 본인 계정은 삭제되지 않습니다.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/members/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selectedIds) }),
      });

      const data = await res.json();

      if (res.ok) {
        showToast(data.message || "삭제되었습니다.", "success");
        setSelectedIds(new Set());
        router.refresh();
      } else {
        showToast(data.error || "삭제에 실패했습니다.", "error");
      }
    } catch {
      showToast("서버 오류가 발생했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  const levelLabel = (level: number, isAdmin: number) => {
    if (isAdmin === 1) return "최고관리자";
    if (isAdmin === 2) return "그룹관리자";
    return `레벨${level}`;
  };

  const levelColor = (isAdmin: number) => {
    if (isAdmin === 1) return "bg-red-100 text-red-700";
    if (isAdmin === 2) return "bg-orange-100 text-orange-700";
    return "bg-gray-100 text-gray-600";
  };

  // 페이지네이션 URL
  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (levelFilter) params.set("level", levelFilter);
    if (sortField && sortField !== "createdAt") params.set("sort", sortField);
    if (sortOrder === "asc") params.set("order", sortOrder);
    params.set("page", String(p));
    return `/admin/members?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">회원 관리</h1>
        <span className="text-sm text-gray-500">
          총 <strong>{total}</strong>명
        </span>
      </div>

      {/* 검색 */}
      <form className="flex flex-wrap gap-2" method="GET">
        <input
          type="text"
          name="keyword"
          defaultValue={keyword}
          placeholder="이름, 아이디, 이메일 검색"
          className="w-64 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
        />
        <select
          name="level"
          defaultValue={levelFilter}
          className="px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
        >
          <option value="">전체 레벨</option>
          <option value="1">레벨 1 (최고관리자)</option>
          <option value="2">레벨 2 (그룹관리자)</option>
          <option value="3">레벨 3</option>
          <option value="4">레벨 4</option>
          <option value="5">레벨 5</option>
          <option value="10">레벨 10 (일반회원)</option>
          <option value="99">레벨 99 (비회원)</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 text-sm bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors"
        >
          검색
        </button>
      </form>

      {/* 툴바 */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={selectedIds.size === 0}
          onClick={() => { setShowPasswordForm((prev) => !prev); setShowLevelForm(false); }}
          className={`px-4 py-2 text-sm rounded transition-colors ${
            selectedIds.size > 0
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          비밀번호 일괄 변경
          {selectedIds.size > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-blue-500 rounded">
              {selectedIds.size}
            </span>
          )}
        </button>
        <button
          type="button"
          disabled={selectedIds.size === 0}
          onClick={() => { setShowLevelForm((prev) => !prev); setShowPasswordForm(false); }}
          className={`px-4 py-2 text-sm rounded transition-colors ${
            selectedIds.size > 0
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          레벨 일괄 변경
          {selectedIds.size > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-green-500 rounded">
              {selectedIds.size}
            </span>
          )}
        </button>
        <button
          type="button"
          disabled={selectedIds.size === 0 || loading}
          onClick={handleDeleteMembers}
          className={`px-4 py-2 text-sm rounded transition-colors ${
            selectedIds.size > 0
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          일괄 삭제
          {selectedIds.size > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-500 rounded">
              {selectedIds.size}
            </span>
          )}
        </button>
      </div>

      {/* 비밀번호 변경 폼 */}
      {showPasswordForm && selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-blue-800">
              선택한 {selectedIds.size}명의 비밀번호를 변경합니다
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="새 비밀번호 (4자 이상)"
              className="w-64 px-3 py-2 text-sm border border-blue-300 rounded focus:outline-none focus:border-blue-500"
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={loading || !newPassword}
              className={`px-4 py-2 text-sm rounded transition-colors ${
                loading || !newPassword
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              {loading ? "처리중..." : "변경하기"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPasswordForm(false);
                setNewPassword("");
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              disabled={loading}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 레벨 변경 폼 */}
      {showLevelForm && selectedIds.size > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-green-800">
              선택한 {selectedIds.size}명의 레벨을 변경합니다
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={newLevel}
              onChange={(e) => setNewLevel(e.target.value)}
              className="px-3 py-2 text-sm border border-green-300 rounded focus:outline-none focus:border-green-500 bg-white"
              disabled={loading}
            >
              <option value="1">레벨 1 (최고관리자)</option>
              <option value="2">레벨 2 (그룹관리자)</option>
              <option value="3">레벨 3</option>
              <option value="4">레벨 4</option>
              <option value="5">레벨 5</option>
              <option value="10">레벨 10 (일반회원)</option>
              <option value="99">레벨 99 (비회원)</option>
            </select>
            <button
              type="button"
              onClick={handleChangeLevel}
              disabled={loading}
              className={`px-4 py-2 text-sm rounded transition-colors ${
                loading
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              {loading ? "처리중..." : "변경하기"}
            </button>
            <button
              type="button"
              onClick={() => setShowLevelForm(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              disabled={loading}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 회원 목록 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs">
              <th className="py-2.5 px-3 text-center font-medium w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  title="전체선택"
                />
              </th>
              <th className="py-2.5 px-3 text-left font-medium">
                <Link href={sortUrl("id")} className="hover:text-blue-600 inline-flex items-center">
                  #{sortIcon("id")}
                </Link>
              </th>
              <th className="py-2.5 px-3 text-left font-medium">
                <Link href={sortUrl("userId")} className="hover:text-blue-600 inline-flex items-center">
                  아이디{sortIcon("userId")}
                </Link>
              </th>
              <th className="py-2.5 px-3 text-left font-medium">
                <Link href={sortUrl("name")} className="hover:text-blue-600 inline-flex items-center">
                  이름{sortIcon("name")}
                </Link>
              </th>
              <th className="py-2.5 px-3 text-left font-medium hidden md:table-cell">
                이메일
              </th>
              <th className="py-2.5 px-3 text-center font-medium">
                <Link href={sortUrl("level")} className="hover:text-blue-600 inline-flex items-center justify-center">
                  레벨{sortIcon("level")}
                </Link>
              </th>
              <th className="py-2.5 px-3 text-center font-medium hidden lg:table-cell">
                글/댓글
              </th>
              <th className="py-2.5 px-3 text-center font-medium hidden md:table-cell">
                <Link href={sortUrl("createdAt")} className="hover:text-blue-600 inline-flex items-center justify-center">
                  가입일{sortIcon("createdAt")}
                </Link>
              </th>
              <th className="py-2.5 px-3 text-center font-medium">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr
                key={u.id}
                className={`hover:bg-gray-50 ${
                  selectedIds.has(u.id) ? "bg-blue-50" : ""
                }`}
              >
                <td className="py-2 px-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(u.id)}
                    onChange={() => toggleSelect(u.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </td>
                <td className="py-2 px-3 text-gray-400 text-xs">{u.id}</td>
                <td className="py-2 px-3 font-mono text-xs text-gray-700">
                  {u.userId}
                </td>
                <td className="py-2 px-3 text-gray-800">{u.name}</td>
                <td className="py-2 px-3 text-gray-500 text-xs hidden md:table-cell">
                  {u.email || "-"}
                </td>
                <td className="py-2 px-3 text-center">
                  <span
                    className={`px-1.5 py-0.5 text-xs rounded ${levelColor(u.isAdmin)}`}
                  >
                    {levelLabel(u.level, u.isAdmin)}
                  </span>
                </td>
                <td className="py-2 px-3 text-center text-xs text-gray-500 hidden lg:table-cell">
                  {u._count.posts} / {u._count.comments}
                </td>
                <td className="py-2 px-3 text-center text-xs text-gray-500 hidden md:table-cell">
                  {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                </td>
                <td className="py-2 px-3 text-center">
                  <Link
                    href={`/admin/members/${u.id}/edit`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    편집
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="py-12 text-center text-gray-400 text-sm">
            {keyword
              ? `"${keyword}" 검색 결과가 없습니다.`
              : "등록된 회원이 없습니다."}
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .slice(0, 20)
            .map((p) => (
              <Link
                key={p}
                href={pageUrl(p)}
                className={`px-3 py-1 text-sm rounded ${
                  p === page
                    ? "bg-blue-700 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {p}
              </Link>
            ))}
        </div>
      )}

      {/* 토스트 메시지 */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg shadow-lg text-sm text-white transition-all ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
