"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface PostItem {
  id: number;
  subject: string;
  authorName: string | null;
  createdAt: string; // ISO string
  hit: number;
  vote: number;
  totalComment: number;
  isSecret: boolean;
  isNotice: boolean;
  depth: number;
  hasAttachment: boolean;
  categoryName?: string | null;
  hasRecentComment?: boolean;
}

interface Props {
  boardSlug: string;
  notices: PostItem[];
  posts: PostItem[];
  isAdmin: boolean;
  useCategory: boolean;
  cutLength: number;
  toggleDesc: string;
  currentSort?: string;
  currentDesc?: string;
  totalPosts: number;
  currentPage: number;
  postsPerPage: number;
  keyword?: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function truncateSubject(subject: string, maxLength: number): string {
  if (maxLength <= 0 || subject.length <= maxLength) return subject;
  return subject.substring(0, maxLength) + "...";
}

export default function BoardListTable({
  boardSlug,
  notices,
  posts,
  isAdmin,
  useCategory,
  cutLength,
  toggleDesc,
  currentSort = "headnum",
  currentDesc = "desc",
  totalPosts,
  currentPage,
  postsPerPage,
  keyword,
}: Props) {
  const sortArrow = (column: string) =>
    column === currentSort ? (currentDesc === "asc" ? " ▲" : " ▼") : "";
  const router = useRouter();
  const [manageMode, setManageMode] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // 전체 게시글 ID (공지 + 일반)
  const allIds = [...notices.map((p) => p.id), ...posts.map((p) => p.id)];
  const allChecked = allIds.length > 0 && allIds.every((id) => checked.has(id));

  const toggleOne = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) {
      setChecked(new Set());
    } else {
      setChecked(new Set(allIds));
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...checked];
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}개 게시글을 삭제하시겠습니까?`)) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/board/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postIds: ids, boardSlug }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`${data.deletedCount}개 게시글이 삭제되었습니다.`);
        setChecked(new Set());
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.message || "삭제에 실패했습니다.");
      }
    } catch {
      alert("서버 연결에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const colCount = manageMode ? 7 : 6;

  const exitManageMode = () => {
    setManageMode(false);
    setChecked(new Set());
  };

  return (
    <>
      {isAdmin && (
        <div className="flex justify-end mb-2">
          {manageMode ? (
            <button
              onClick={exitManageMode}
              className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-100 transition-colors"
            >
              관리 종료
            </button>
          ) : (
            <button
              onClick={() => setManageMode(true)}
              className="px-3 py-1.5 text-xs border border-blue-300 text-blue-600 rounded hover:bg-blue-50 transition-colors"
            >
              게시글 관리
            </button>
          )}
        </div>
      )}
      <div className="bg-white rounded-lg shadow-sm border border-gray-400 overflow-hidden skin-card">
        <table className="w-full text-sm skin-table">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-400 text-gray-600">
              {manageMode && (
                <th className="w-10 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                  />
                </th>
              )}
              <th className="w-16 py-2.5 text-center font-medium">
                <Link href={`/board/${boardSlug}?select_arrange=headnum&desc=${toggleDesc}`}>
                  번호{sortArrow("headnum")}
                </Link>
              </th>
              <th className="py-2.5 text-left font-medium">
                <Link href={`/board/${boardSlug}?select_arrange=subject&desc=${toggleDesc}`}>
                  제목{sortArrow("subject")}
                </Link>
              </th>
              <th className="w-24 py-2.5 text-center font-medium hidden sm:table-cell">
                <Link href={`/board/${boardSlug}?select_arrange=name&desc=${toggleDesc}`}>
                  작성자{sortArrow("name")}
                </Link>
              </th>
              <th className="w-24 py-2.5 text-center font-medium hidden md:table-cell">
                <Link href={`/board/${boardSlug}?select_arrange=reg_date&desc=${toggleDesc}`}>
                  날짜{sortArrow("reg_date")}
                </Link>
              </th>
              <th className="w-16 py-2.5 text-center font-medium hidden md:table-cell">
                <Link href={`/board/${boardSlug}?select_arrange=hit&desc=${toggleDesc}`}>
                  조회{sortArrow("hit")}
                </Link>
              </th>
              <th className="w-14 py-2.5 text-center font-medium hidden lg:table-cell">
                <Link href={`/board/${boardSlug}?select_arrange=vote&desc=${toggleDesc}`}>
                  추천{sortArrow("vote")}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {/* 공지사항 */}
            {notices.map((post) => (
              <tr key={`notice-${post.id}`} className="bg-blue-50/50 hover:bg-blue-50">
                {manageMode && (
                  <td className="py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={checked.has(post.id)}
                      onChange={() => toggleOne(post.id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    />
                  </td>
                )}
                <td className="py-2.5 text-center">
                  <span className="inline-block px-1.5 py-0.5 text-xs font-bold text-white bg-blue-600 rounded">
                    공지
                  </span>
                </td>
                <td className="py-2.5 px-2">
                  <Link
                    href={`/board/${boardSlug}/${post.id}`}
                    className="text-gray-900 font-medium hover:text-blue-700"
                  >
                    {useCategory && post.categoryName && (
                      <span className="text-xs text-blue-600 font-normal mr-1.5">[{post.categoryName}]</span>
                    )}
                    {post.subject}
                    {post.totalComment > 0 && (
                      <span className="ml-1.5 text-xs text-orange-500 font-bold">
                        [{post.totalComment}]
                      </span>
                    )}
                    {post.hasRecentComment && (
                      <span className="text-red-500 text-[10px] ml-0.5 font-bold">[c]</span>
                    )}
                    {post.isSecret && (
                      <span className="ml-1 text-xs text-gray-400" title="비밀글">🔒</span>
                    )}
                  </Link>
                </td>
                <td className="py-2.5 text-center text-gray-600 hidden sm:table-cell">
                  {post.authorName}
                </td>
                <td className="py-2.5 text-center text-gray-500 hidden md:table-cell">
                  {formatDate(post.createdAt)}
                </td>
                <td className="py-2.5 text-center text-gray-500 hidden md:table-cell">
                  {post.hit}
                </td>
                <td className="py-2.5 text-center text-gray-500 hidden lg:table-cell">
                  {post.vote > 0 ? post.vote : "-"}
                </td>
              </tr>
            ))}

            {/* 일반 게시글 */}
            {posts.map((post, index) => {
              const virtualNo = totalPosts - (currentPage - 1) * postsPerPage - index;
              const depthPad = post.depth > 0 ? post.depth * 16 : 0;
              const subjectText = cutLength > 0 ? truncateSubject(post.subject, cutLength) : post.subject;

              return (
                <tr key={post.id} className="hover:bg-gray-50 transition-colors">
                  {manageMode && (
                    <td className="py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={checked.has(post.id)}
                        onChange={() => toggleOne(post.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="py-2.5 text-center text-gray-500">
                    {virtualNo}
                  </td>
                  <td className="py-2.5 px-2">
                    <div style={{ paddingLeft: depthPad }}>
                      {post.depth > 0 && (
                        <span className="text-gray-400 text-xs mr-1">└</span>
                      )}
                      <Link
                        href={`/board/${boardSlug}/${post.id}`}
                        className="text-gray-800 hover:text-blue-700"
                      >
                        {useCategory && post.categoryName && (
                          <span className="text-xs text-blue-600 mr-1.5">[{post.categoryName}]</span>
                        )}
                        {subjectText}
                        {post.totalComment > 0 && (
                          <span className="ml-1.5 text-xs text-orange-500 font-bold">
                            [{post.totalComment}]
                          </span>
                        )}
                        {post.hasRecentComment && (
                          <span className="text-red-500 text-[10px] ml-0.5 font-bold">[c]</span>
                        )}
                        {post.isSecret && (
                          <span className="ml-1 text-xs text-gray-400" title="비밀글">🔒</span>
                        )}
                        {post.hasAttachment && (
                          <span className="ml-1 text-xs text-gray-400" title="첨부파일">📎</span>
                        )}
                      </Link>
                    </div>
                  </td>
                  <td className="py-2.5 text-center text-gray-600 hidden sm:table-cell">
                    {post.authorName}
                  </td>
                  <td className="py-2.5 text-center text-gray-500 text-xs hidden md:table-cell">
                    {formatDate(post.createdAt)}
                  </td>
                  <td className="py-2.5 text-center text-gray-500 hidden md:table-cell">
                    {post.hit}
                  </td>
                  <td className="py-2.5 text-center text-gray-500 hidden lg:table-cell">
                    {post.vote > 0 ? post.vote : "-"}
                  </td>
                </tr>
              );
            })}

            {/* 게시글 없음 */}
            {posts.length === 0 && notices.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-16 text-center text-gray-400">
                  {keyword
                    ? `"${keyword}" 검색 결과가 없습니다.`
                    : "등록된 게시글이 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 관리자: 선택 삭제 버튼 */}
      {manageMode && checked.size > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            {checked.size}개 선택
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={deleting}
            className="px-4 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {deleting ? "삭제 중..." : "선택 삭제"}
          </button>
        </div>
      )}
    </>
  );
}
