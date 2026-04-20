"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { sanitizeHtml } from "@/lib/sanitize";
import CaptchaField from "@/components/CaptchaField";

const TipTapEditor = dynamic(() => import("@/components/board/TipTapEditor"), {
  ssr: false,
  loading: () => (
    <div className="border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-400 min-h-[100px]">
      에디터 로딩 중...
    </div>
  ),
});

interface Comment {
  id: number;
  authorName: string;
  content: string;
  isSecret: boolean;
  createdAt: string;
  authorId: number | null;
  parentId?: number | null;
}

interface CommentSectionProps {
  boardSlug: string;
  postId: number;
  commentPolicy: string;
  comments: Comment[];
  isAdmin?: boolean;
  currentUserId?: number | null;
  postAuthorId?: number | null;
}

export default function CommentSection({ boardSlug, postId, commentPolicy, comments, isAdmin, currentUserId, postAuthorId }: CommentSectionProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [content, setContent] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 댓글 수정 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editing, setEditing] = useState(false);

  // 답글 작성 상태 (parentId 별 인라인 폼)
  const [replyParentId, setReplyParentId] = useState<number | null>(null);
  const [replyName, setReplyName] = useState("");
  const [replyPassword, setReplyPassword] = useState("");
  const [replyContent, setReplyContent] = useState("");
  const [replyIsSecret, setReplyIsSecret] = useState(false);
  const [replySubmitting, setReplySubmitting] = useState(false);

  // 비로그인 CAPTCHA 상태 (쓰기 폼 · 답글 폼 각각)
  const isGuest = currentUserId == null;
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [replyCaptchaAnswer, setReplyCaptchaAnswer] = useState("");
  const [replyCaptchaToken, setReplyCaptchaToken] = useState("");

  // 댓글을 부모-답글 트리 순서로 정렬 — 최상위는 createdAt asc, 답글은 부모 바로 뒤에 createdAt asc.
  // id → comment 매핑 (답글의 부모 조회용)
  const commentById = new Map<number, Comment>();
  for (const c of comments) commentById.set(c.id, c);

  // 부모-자식 트리를 DFS 로 평탄화 + 각 댓글의 depth(0=최상위) 계산.
  // 깊이 제한 없음(손자·증손자 가능). 시각적 들여쓰기는 렌더에서 5단계까지만 적용.
  const { sortedComments, depthMap } = (() => {
    const childMap = new Map<number, Comment[]>();
    const orphans: Comment[] = [];
    for (const c of comments) {
      if (!c.parentId) continue;
      if (!commentById.has(c.parentId)) {
        orphans.push(c);
        continue;
      }
      if (!childMap.has(c.parentId)) childMap.set(c.parentId, []);
      childMap.get(c.parentId)!.push(c);
    }
    for (const arr of childMap.values()) {
      arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    const roots = comments
      .filter((c) => !c.parentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const out: Comment[] = [];
    const depth = new Map<number, number>();
    function dfs(c: Comment, d: number) {
      depth.set(c.id, d);
      out.push(c);
      const kids = childMap.get(c.id) || [];
      for (const k of kids) dfs(k, d + 1);
    }
    for (const r of roots) dfs(r, 0);
    for (const o of orphans) {
      if (!depth.has(o.id)) {
        depth.set(o.id, 0);
        out.push(o);
      }
    }
    return { sortedComments: out, depthMap: depth };
  })();

  // 부모 댓글 본문을 짧은 한 줄 프리뷰로 축약 (HTML 태그 제거 + 공백 정리 + 40자 컷).
  function previewFromHtml(html: string): string {
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return text.length > 40 ? text.slice(0, 40) + "…" : text;
  }

  function openReply(commentId: number) {
    setReplyParentId(commentId);
    setReplyContent("");
    setReplyName("");
    setReplyPassword("");
    setReplyIsSecret(false);
  }

  function cancelReply() {
    setReplyParentId(null);
    setReplyContent("");
  }

  async function handleReplySubmit(parentId: number) {
    const stripped = replyContent.replace(/<[^>]*>/g, "").trim();
    if (!stripped) {
      alert("내용을 입력하세요.");
      return;
    }
    if (isGuest && (!replyCaptchaAnswer.trim() || !replyCaptchaToken)) {
      alert("자동 입력 방지 숫자를 입력하세요.");
      return;
    }
    setReplySubmitting(true);
    try {
      const res = await fetch("/api/board/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardSlug,
          postId,
          parentId,
          name: replyName || "익명",
          password: replyPassword,
          content: replyContent,
          isSecret: replyIsSecret,
          captchaAnswer: isGuest ? replyCaptchaAnswer : undefined,
          captchaToken: isGuest ? replyCaptchaToken : undefined,
        }),
      });
      if (res.ok) {
        cancelReply();
        setReplyCaptchaAnswer("");
        setReplyCaptchaToken("");
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.message || "답글 등록에 실패했습니다.");
      }
    } catch {
      alert("답글 등록에 실패했습니다.");
    } finally {
      setReplySubmitting(false);
    }
  }

  // 관리자 일괄 삭제 상태
  const [manageMode, setManageMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TipTap 은 빈 내용일 때 <p></p> 를 반환하므로 태그 제거 후 확인
    const stripped = content.replace(/<[^>]*>/g, "").trim();
    if (!stripped) {
      alert("내용을 입력하세요.");
      return;
    }
    if (isGuest && (!captchaAnswer.trim() || !captchaToken)) {
      alert("자동 입력 방지 숫자를 입력하세요.");
      return;
    }
    setSubmitting(true);

    try {
      const res = await fetch("/api/board/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardSlug,
          postId,
          name: name || "익명",
          password,
          content,
          isSecret,
          captchaAnswer: isGuest ? captchaAnswer : undefined,
          captchaToken: isGuest ? captchaToken : undefined,
        }),
      });

      if (res.ok) {
        setContent("");
        setIsSecret(false);
        setCaptchaAnswer("");
        setCaptchaToken("");
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.message || "댓글 등록에 실패했습니다.");
      }
    } catch {
      alert("댓글 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: number, requirePassword: boolean) {
    let pw = "";
    if (requirePassword) {
      const input = prompt("비밀번호를 입력하세요:");
      if (!input) return;
      pw = input;
    } else {
      if (!confirm("댓글을 삭제하시겠습니까?")) return;
    }

    try {
      const res = await fetch("/api/board/comment", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, password: pw }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.message || "삭제에 실패했습니다.");
      }
    } catch {
      alert("삭제에 실패했습니다.");
    }
  }

  function startEdit(comment: Comment) {
    setEditingId(comment.id);
    setEditContent(comment.content);
    setEditPassword("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditContent("");
    setEditPassword("");
  }

  async function handleEdit(commentId: number, requirePassword: boolean) {
    if (requirePassword && !editPassword) {
      alert("비밀번호를 입력하세요.");
      return;
    }
    const stripped = editContent.replace(/<[^>]*>/g, "").trim();
    if (!stripped) {
      alert("내용을 입력하세요.");
      return;
    }
    setEditing(true);
    try {
      const res = await fetch("/api/board/comment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentId,
          password: editPassword,
          content: editContent,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        setEditContent("");
        setEditPassword("");
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.message || "수정에 실패했습니다.");
      }
    } catch {
      alert("수정에 실패했습니다.");
    } finally {
      setEditing(false);
    }
  }

  function toggleCheck(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (checkedIds.size === comments.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(comments.map((c) => c.id)));
    }
  }

  async function handleBulkDelete() {
    if (checkedIds.size === 0) return;
    if (!confirm(`선택한 ${checkedIds.size}개의 댓글을 삭제하시겠습니까?`)) return;

    setBulkDeleting(true);
    try {
      const res = await fetch("/api/board/comment/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentIds: [...checkedIds] }),
      });
      if (res.ok) {
        setCheckedIds(new Set());
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.message || "삭제에 실패했습니다.");
      }
    } catch {
      alert("삭제에 실패했습니다.");
    } finally {
      setBulkDeleting(false);
    }
  }

  function exitManageMode() {
    setManageMode(false);
    setCheckedIds(new Set());
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* 댓글 헤더 */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {manageMode && comments.length > 0 && (
              <input
                type="checkbox"
                checked={checkedIds.size === comments.length && comments.length > 0}
                onChange={toggleAll}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600"
                title="전체 선택"
              />
            )}
            <h3 className="text-sm font-medium text-gray-700">
              댓글 <span className="text-blue-700">{comments.length}</span>
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {manageMode && checkedIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="px-3 py-1 text-xs text-white bg-red-500 hover:bg-red-600 rounded transition-colors disabled:opacity-50"
              >
                {bulkDeleting ? "삭제 중..." : `선택 삭제 (${checkedIds.size})`}
              </button>
            )}
            {commentPolicy === "DISABLED" && (
              <span className="text-xs text-gray-400">댓글이 막힌 게시글입니다</span>
            )}
            {isAdmin && comments.length > 0 && (
              manageMode ? (
                <button
                  onClick={exitManageMode}
                  className="px-2.5 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-100 transition-colors"
                >
                  관리 종료
                </button>
              ) : (
                <button
                  onClick={() => setManageMode(true)}
                  className="px-2.5 py-1 text-xs border border-blue-300 text-blue-600 rounded hover:bg-blue-50 transition-colors"
                >
                  댓글 관리
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* 댓글 목록 */}
      {comments.length > 0 && (
        <ul>
          {sortedComments.map((comment, rowIdx) => {
            const isReply = !!comment.parentId;
            const depth = depthMap.get(comment.id) ?? 0;
            // 시각적 들여쓰기는 5단계까지만 — 그 이상 깊어도 같은 위치에서 스택
            const visualDepth = Math.min(depth, 5);
            const indentPx = visualDepth * 24;
            // 이 댓글이 '새로운 그룹의 시작' 인지 판정
            //   - 현재 댓글이 최상위(root) 이고 이전 댓글이 없거나 아니면 그룹 시작
            //   - 답글이면 그룹의 중간/끝이므로 위쪽 구분선 없이 부모에 붙여 표시
            const prev = rowIdx > 0 ? sortedComments[rowIdx - 1] : null;
            const startsNewGroup = !isReply && (!prev || true);
            const rowBorder = startsNewGroup && rowIdx > 0 ? "border-t border-gray-200" : "";
            // 비밀댓글 열람 권한: 관리자, 글 작성자, 댓글 작성자
            const canViewSecret = !comment.isSecret ||
              isAdmin ||
              (currentUserId != null && currentUserId === postAuthorId) ||
              (currentUserId != null && currentUserId === comment.authorId);

            const isOwnComment = currentUserId != null && currentUserId === comment.authorId;
            const isGuestComment = comment.authorId === null;

            // 삭제 버튼: 관리자, 본인, 비회원 댓글(비번 확인)만 노출
            const canShowDelete =
              commentPolicy !== "DISABLED" &&
              (isAdmin || isOwnComment || isGuestComment);

            // 수정 버튼:
            //   - 관리자: 정책 무관 항상 허용 (Legacy 게시글의 ALLOW 정책에도 관리자 편집 가능)
            //   - 본인 회원 댓글: DISABLED 아니면 허용 (ALLOW/ALLOW_EDIT 모두)
            //   - 비회원 댓글: ALLOW_EDIT 에서만 (비번 확인)
            const canShowEdit =
              canViewSecret &&
              editingId !== comment.id &&
              (
                isAdmin ||
                (isOwnComment && commentPolicy !== "DISABLED") ||
                (isGuestComment && commentPolicy === "ALLOW_EDIT")
              );

            // 수정 시 비밀번호가 필요한 경우: 비회원 댓글만
            const editRequiresPassword = isGuestComment;

            // 답글이면 부모 댓글 정보 준비 (비밀댓글은 부모도 가려야 하므로 canViewSecret 와 무관하게
            // 부모가 secret 이고 내가 권한 없으면 내용 숨김)
            const parent = isReply && comment.parentId ? commentById.get(comment.parentId) : null;
            const canSeeParentContent =
              parent &&
              (
                !parent.isSecret ||
                isAdmin ||
                (currentUserId != null && currentUserId === postAuthorId) ||
                (currentUserId != null && currentUserId === parent.authorId)
              );
            return (
              <li
                key={comment.id}
                // display: flow-root (flow-root Tailwind 클래스) 로 각 댓글을 BFC(block formatting context) 로
                // 만들어 내부 이미지의 float 가 다음 댓글로 흘러나가지 않도록 고정.
                className={`flow-root py-3 ${rowBorder} ${
                  isReply
                    ? "pl-4 pr-4 border-l-[3px] border-blue-300 bg-blue-50/40"
                    : "px-4"
                }`}
                style={isReply ? { marginLeft: `${indentPx}px` } : undefined}
              >
                {/* 부모 댓글 정보 배지 — 어느 댓글의 답글인지 한눈에 */}
                {isReply && parent && (
                  <div className="mb-1.5 flex items-start gap-1 text-[11px] text-gray-500 bg-white border border-gray-200 rounded px-2 py-1">
                    <span className="text-blue-500">↪</span>
                    <span className="shrink-0">
                      <strong className="text-gray-700">{parent.authorName}</strong> 님의 댓글:
                    </span>
                    <span className="truncate text-gray-500 italic">
                      {canSeeParentContent ? previewFromHtml(parent.content) : "(비밀댓글)"}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 text-sm">
                    {isReply && <span className="text-blue-500 text-xs">└</span>}
                    {manageMode && (
                      <input
                        type="checkbox"
                        checked={checkedIds.has(comment.id)}
                        onChange={() => toggleCheck(comment.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600"
                      />
                    )}
                    <strong className="text-gray-700">{comment.authorName}</strong>
                    {comment.isSecret && (
                      <span className="text-[11px] text-gray-400" title="비밀댓글">🔒</span>
                    )}
                    <span className="text-gray-400 text-xs">{formatTime(comment.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* 답글: 모든 깊이에 허용 (손자·증손자 가능). 비밀댓글 볼 권한 있을 때만, 댓글 미허용 아닐 때 */}
                    {canViewSecret && commentPolicy !== "DISABLED" && editingId !== comment.id && (
                      <button
                        onClick={() =>
                          replyParentId === comment.id ? cancelReply() : openReply(comment.id)
                        }
                        className="px-2.5 py-1 text-sm border border-gray-300 text-gray-600 rounded hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 transition-colors"
                        title="답글"
                      >
                        {replyParentId === comment.id ? "답글취소" : "답글"}
                      </button>
                    )}
                    {canShowEdit && (
                      <button
                        onClick={() => startEdit(comment)}
                        className="px-2.5 py-1 text-sm border border-gray-300 text-gray-600 rounded hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-colors"
                        title="수정"
                      >
                        수정
                      </button>
                    )}
                    {canShowDelete && (
                      <button
                        onClick={() => handleDelete(comment.id, isGuestComment)}
                        className="px-2.5 py-1 text-sm border border-gray-300 text-gray-600 rounded hover:bg-red-50 hover:border-red-400 hover:text-red-700 transition-colors"
                        title="삭제"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>

                {canViewSecret ? (
                  editingId === comment.id ? (
                    /* 인라인 수정 폼 */
                    <div className="space-y-2">
                      <TipTapEditor
                        content={editContent}
                        onChange={setEditContent}
                        placeholder="댓글을 입력하세요"
                        minHeight="60px"
                        boardSlug={boardSlug}
                      />
                      <div className="flex items-center gap-2">
                        {editRequiresPassword && (
                          <input
                            type="password"
                            placeholder="비밀번호"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            className="w-28 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                          />
                        )}
                        <button
                          onClick={() => handleEdit(comment.id, editRequiresPassword)}
                          disabled={editing}
                          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {editing ? "수정 중..." : "수정"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    // whitespace-pre-wrap 는 legacy 제로보드 댓글(평문 + \n) 과
                    // 새 TipTap 댓글(<p>/<br>) 모두에서 줄바꿈이 보이도록 보장.
                    <div
                      className="prose prose-sm max-w-none text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(comment.content) }}
                    />
                  )
                ) : (
                  <div className="text-sm text-gray-400 italic">
                    비밀댓글입니다.
                  </div>
                )}

                {/* 인라인 답글 폼 */}
                {replyParentId === comment.id && (
                  <div className="mt-3 pl-4 border-l-2 border-blue-200 space-y-2">
                    <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1">
                      <strong>{comment.authorName}</strong> 님의 댓글에 답글 작성 중
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <input
                        type="text"
                        placeholder="이름"
                        value={replyName}
                        onChange={(e) => setReplyName(e.target.value)}
                        className="w-28 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                      />
                      <input
                        type="password"
                        placeholder="비밀번호"
                        value={replyPassword}
                        onChange={(e) => setReplyPassword(e.target.value)}
                        className="w-28 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                      />
                      {currentUserId != null && (
                        <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={replyIsSecret}
                            onChange={(e) => setReplyIsSecret(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600"
                          />
                          🔒 비밀
                        </label>
                      )}
                      {isGuest && (
                        <div className="ml-auto">
                          <CaptchaField
                            compact
                            onAnswer={(a, t) => {
                              setReplyCaptchaAnswer(a);
                              setReplyCaptchaToken(t);
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <TipTapEditor
                      content={replyContent}
                      onChange={setReplyContent}
                      placeholder="답글을 입력하세요"
                      minHeight="60px"
                      boardSlug={boardSlug}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelReply}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReplySubmit(comment.id)}
                        disabled={replySubmitting}
                        className="px-4 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors disabled:opacity-50"
                      >
                        {replySubmitting ? "등록 중..." : "답글 등록"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 댓글 작성 폼 (댓글막음이 아니고 수정 중이 아닐 때만 표시) */}
      {commentPolicy !== "DISABLED" && editingId === null && (
        <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4">
          <div className="flex flex-wrap gap-2 mb-2 items-center">
            <input
              type="text"
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-28 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-28 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
            {currentUserId != null && (
              <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isSecret}
                  onChange={(e) => setIsSecret(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600"
                />
                🔒 비밀댓글
              </label>
            )}
            {isGuest && (
              <div className="ml-auto">
                <CaptchaField
                  compact
                  onAnswer={(a, t) => {
                    setCaptchaAnswer(a);
                    setCaptchaToken(t);
                  }}
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <TipTapEditor
              content={content}
              onChange={setContent}
              placeholder="댓글을 입력하세요"
              minHeight="60px"
              boardSlug={boardSlug}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {submitting ? "등록 중..." : "등록"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
