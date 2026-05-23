"use client";

import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react";

interface BoardInfo {
  id: number;
  slug: string;
  title: string;
}

interface BoardPermission {
  boardId: number;
  canEdit: boolean;
  canDelete: boolean;
  board: BoardInfo;
}

interface CouncilDept {
  id: number;
  name: string;
  groups: { id: number; name: string }[];
}

interface MemberData {
  id: number;
  userId: string;
  name: string;
  email: string | null;
  level: number;
  isAdmin: number;
  councilAccess: boolean;
  accountAccess: boolean;
  accLedgerAccess: boolean;
  accOfferingAccess: boolean;
  accDuesAccess: boolean;
  accMemberEditAccess: boolean;
  phone: string | null;
  createdAt: string;
  boardPermissions: BoardPermission[];
}

export default function AdminMemberEditPage() {
  const router = useRouter();
  const params = useParams();
  const memberId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [member, setMember] = useState<MemberData | null>(null);
  const [boards, setBoards] = useState<BoardInfo[]>([]);

  // 수정 가능한 필드 — level 은 isAdmin 등급에서 서버가 자동 계산하므로 UI 노출 X.
  const [isAdmin, setIsAdmin] = useState(3);
  const [councilAccess, setCouncilAccess] = useState(false);
  const [accLedgerAccess, setAccLedgerAccess] = useState(false);
  const [accOfferingAccess, setAccOfferingAccess] = useState(false);
  const [accDuesAccess, setAccDuesAccess] = useState(false);
  const [accMemberEditAccess, setAccMemberEditAccess] = useState(false);
  const [permissions, setPermissions] = useState<Record<number, { canEdit: boolean; canDelete: boolean }>>({});
  const [councilDepts, setCouncilDepts] = useState<CouncilDept[]>([]);
  const [groupAccessIds, setGroupAccessIds] = useState<number[]>([]);

  useEffect(() => {
    fetch(`/api/admin/members/${memberId}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((data: { user: MemberData; boards: BoardInfo[]; groupAccess: number[]; councilDepts: CouncilDept[] }) => {
        setMember(data.user);
        setBoards(data.boards);
        setIsAdmin(data.user.isAdmin);
        setCouncilAccess(data.user.councilAccess);
        setAccLedgerAccess(data.user.accLedgerAccess ?? data.user.accountAccess ?? false);
        setAccOfferingAccess(data.user.accOfferingAccess ?? data.user.accountAccess ?? false);
        setAccDuesAccess(data.user.accDuesAccess ?? false);
        setAccMemberEditAccess(data.user.accMemberEditAccess ?? false);
        setCouncilDepts(data.councilDepts || []);
        setGroupAccessIds(data.groupAccess || []);

        // 기존 권한을 맵으로 변환
        const permMap: Record<number, { canEdit: boolean; canDelete: boolean }> = {};
        for (const bp of data.user.boardPermissions) {
          permMap[bp.boardId] = { canEdit: bp.canEdit, canDelete: bp.canDelete };
        }
        setPermissions(permMap);
      })
      .catch(() => setError("회원 정보를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, [memberId]);

  function togglePermission(boardId: number, field: "canEdit" | "canDelete") {
    setPermissions((prev) => {
      const current = prev[boardId] || { canEdit: false, canDelete: false };
      return { ...prev, [boardId]: { ...current, [field]: !current[field] } };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    const boardPermissions = boards.map((b) => ({
      boardId: b.id,
      canEdit: permissions[b.id]?.canEdit || false,
      canDelete: permissions[b.id]?.canDelete || false,
    }));

    try {
      const res = await fetch(`/api/admin/members/${memberId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin, councilAccess, accLedgerAccess, accOfferingAccess, accDuesAccess, accMemberEditAccess, boardPermissions, groupAccessIds }),
      });

      if (res.ok) {
        setSuccess("저장되었습니다.");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const data = await res.json();
        setError(data.message || "저장에 실패했습니다.");
      }
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="py-12 text-center text-gray-400">로딩 중...</div>;
  if (!member) return <div className="py-12 text-center text-gray-400">회원을 찾을 수 없습니다.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">회원 편집</h1>
        <button
          type="button"
          onClick={() => router.push("/admin/members")}
          className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
        >
          목록으로
        </button>
      </div>

      {error && <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>}
      {success && <div className="px-4 py-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg">{success}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 기본 정보 (읽기 전용) */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">기본 정보</h2>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">아이디</label>
              <input type="text" value={member.userId} disabled
                className="w-full px-3 py-2 text-sm border bg-gray-50 border-gray-200 rounded text-gray-500 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">이름</label>
              <input type="text" value={member.name} disabled
                className="w-full px-3 py-2 text-sm border bg-gray-50 border-gray-200 rounded text-gray-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">이메일</label>
              <input type="text" value={member.email || "-"} disabled
                className="w-full px-3 py-2 text-sm border bg-gray-50 border-gray-200 rounded text-gray-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">가입일</label>
              <input type="text" value={new Date(member.createdAt).toLocaleDateString("ko-KR")} disabled
                className="w-full px-3 py-2 text-sm border bg-gray-50 border-gray-200 rounded text-gray-500" />
            </div>
          </div>
        </section>

        {/* 권한 설정 — 세 가지 진입권한을 카테고리로 분리해서 표시.
            1) 관리 진입권한   → /admin 전체 사용
            2) 권찰회 진입권한 → /council 전체 사용
            3) 행정실 진입권한 → /accounting 의 [전표입력/연보관리/월정관리] 각각 토글 */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">진입권한 설정</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              각 영역의 메뉴와 화면은 아래 권한에 따라 자동으로 표시·숨김됩니다.
            </p>
          </div>
          <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* ===== 1) 관리 진입권한 ===== */}
            <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-blue-700">관리 진입권한</h3>
                <span className="text-[10px] text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">/admin</span>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug">
                전체/그룹 관리자만 관리페이지 전체를 사용할 수 있습니다.
                게시판 권한 레벨도 등급에 따라 자동 부여됩니다.
              </p>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">관리자 등급</label>
                <select
                  value={isAdmin}
                  onChange={(e) => setIsAdmin(parseInt(e.target.value, 10))}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                >
                  <option value={1}>전체 관리자 (관리 진입 가능)</option>
                  <option value={2}>그룹 관리자 (관리 진입 가능)</option>
                  <option value={3}>일반 회원 (관리 진입 불가)</option>
                </select>
              </div>
              <p className="text-[10px] text-gray-400 leading-snug pt-1 border-t border-blue-100">
                현재 게시판 권한 레벨:{" "}
                <strong className="text-gray-600 font-mono">
                  {isAdmin === 1 ? "1" : isAdmin === 2 ? "2" : member.level ?? 10}
                </strong>{" "}
                — 등급 변경 시 저장하면 자동 갱신됩니다.
              </p>
            </div>

            {/* ===== 2) 권찰회 진입권한 ===== */}
            <div className="border border-emerald-200 bg-emerald-50/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-emerald-700">권찰회 진입권한</h3>
                <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">/council</span>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug">
                체크하면 권찰회 전체 메뉴(출석·보고서·구역 등)를 사용할 수 있습니다.
                관리자 등급(전체/그룹) 은 자동 허용.
              </p>
              <label className="flex items-center gap-2 px-2 py-2 cursor-pointer bg-white rounded border border-emerald-200">
                <input
                  type="checkbox"
                  checked={councilAccess}
                  onChange={(e) => setCouncilAccess(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-700 font-medium">권찰회 진입 허용</span>
              </label>
              {isAdmin > 2 && councilAccess && (
                <p className="text-[10px] text-emerald-700 leading-snug">
                  아래 <strong>권찰회 구역 접근 권한</strong> 에서 체크한 구역만 입력/조회 가능합니다.
                </p>
              )}
            </div>

            {/* ===== 3) 행정실 진입권한 ===== */}
            <div className="border border-teal-200 bg-teal-50/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-teal-700">행정실 진입권한</h3>
                <span className="text-[10px] text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded">/accounting</span>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug">
                체크한 항목의 메뉴와 화면만 표시됩니다. 셋 다 미체크면 행정실 자체에 진입 불가.
                관리자 등급(전체/그룹) 은 자동으로 셋 다 허용.
              </p>
              <div className="space-y-1.5 bg-white rounded border border-teal-200 p-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accLedgerAccess}
                    onChange={(e) => setAccLedgerAccess(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">
                    <strong>행정실 (전표입력)</strong>
                    <span className="block text-[10px] text-gray-400">
                      전표입력·전표현황·월별/계정별/일자별 보고서·결산·마감·설정
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accOfferingAccess}
                    onChange={(e) => setAccOfferingAccess(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">
                    <strong>연보관리</strong>
                    <span className="block text-[10px] text-gray-400">
                      연보입력·연보내역·연보집계·감사연보·기부금영수증
                    </span>
                  </span>
                </label>
                <label className={`flex items-start gap-2 cursor-pointer pl-6 ${!accOfferingAccess ? "opacity-50" : ""}`}>
                  <input
                    type="checkbox"
                    checked={accMemberEditAccess}
                    onChange={(e) => setAccMemberEditAccess(e.target.checked)}
                    disabled={!accOfferingAccess}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                  />
                  <span className={`text-sm ${accOfferingAccess ? "text-gray-700" : "text-gray-400"}`}>
                    └ 관리번호 입력/수정
                    <span className="block text-[10px] text-gray-400">
                      성명 조회·관리상세·소속증명서 추가 노출
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accDuesAccess}
                    onChange={(e) => setAccDuesAccess(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500"
                  />
                  <span className="text-sm text-gray-700">
                    <strong>월정관리</strong>
                    <span className="block text-[10px] text-gray-400">
                      전도회·건축 월정회원·월정액·입금
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* 권찰회 구역 접근 권한 */}
        {councilAccess && councilDepts.length > 0 && (
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-bold text-gray-700">권찰회 구역 접근 권한</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {isAdmin <= 2
                  ? "관리자는 모든 구역에 자동 접근됩니다."
                  : "체크한 구역만 권찰보고서에서 입력/조회할 수 있습니다."}
              </p>
            </div>
            {isAdmin <= 2 ? (
              <div className="p-4 text-sm text-gray-500">관리자 등급이므로 모든 구역에 접근 가능합니다.</div>
            ) : (
              <div className="p-4">
                {councilDepts.map((dept) => (
                  <div key={dept.id} className="mb-3 last:mb-0">
                    <div className="text-xs font-semibold text-gray-500 mb-1.5">{dept.name}</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pl-2">
                      {dept.groups.map((g) => (
                        <label key={g.id} className="flex items-center gap-1.5 cursor-pointer text-sm hover:bg-gray-50 px-1.5 py-0.5 rounded">
                          <input
                            type="checkbox"
                            checked={groupAccessIds.includes(g.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setGroupAccessIds([...groupAccessIds, g.id]);
                              } else {
                                setGroupAccessIds(groupAccessIds.filter((id) => id !== g.id));
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-gray-700">{g.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 게시판별 권한 */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">게시판별 권한</h2>
            <p className="text-xs text-gray-400 mt-0.5">다른 사용자가 작성한 글에 대한 수정/삭제 권한을 설정합니다.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th className="py-2.5 px-4 text-left font-medium">게시판</th>
                  <th className="py-2.5 px-4 text-center font-medium w-24">수정 권한</th>
                  <th className="py-2.5 px-4 text-center font-medium w-24">삭제 권한</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {boards.map((board) => (
                  <tr key={board.id} className="hover:bg-gray-50">
                    <td className="py-2 px-4">
                      <span className="text-gray-800">{board.title}</span>
                      <span className="ml-2 text-xs text-gray-400 font-mono">{board.slug}</span>
                    </td>
                    <td className="py-2 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={permissions[board.id]?.canEdit || false}
                        onChange={() => togglePermission(board.id, "canEdit")}
                        className="rounded border-gray-300 text-blue-600"
                      />
                    </td>
                    <td className="py-2 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={permissions[board.id]?.canDelete || false}
                        onChange={() => togglePermission(board.id, "canDelete")}
                        className="rounded border-gray-300 text-blue-600"
                      />
                    </td>
                  </tr>
                ))}
                {boards.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-gray-400">
                      등록된 게시판이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 제출 */}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-800 transition-colors disabled:opacity-50"
          >
            {submitting ? "저장 중..." : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
