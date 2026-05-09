"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface PostActionsProps {
  boardSlug: string;
  postId: number;
  currentVote: number;
  canEdit?: boolean;
  canDelete?: boolean;
  isGuestPost?: boolean;     // authorId=null 인 글 (구 비회원/이관)
  hasPassword?: boolean;     // 글에 비밀번호가 설정돼 있어 비번 알면 수정/삭제 가능
}

export default function PostActions({
  boardSlug,
  postId,
  currentVote,
  canEdit = false,
  canDelete = false,
  isGuestPost = false,
  hasPassword = false,
}: PostActionsProps) {
  const router = useRouter();
  const [vote, setVote] = useState(currentVote);
  const [voting, setVoting] = useState(false);

  // 비번으로 수정/삭제 가능한 케이스 — 권한 없는데 비번이 설정돼 있을 때
  const canPasswordEdit = !canEdit && (isGuestPost || hasPassword);
  const canPasswordDelete = !canDelete && (isGuestPost || hasPassword);

  async function handleVote() {
    if (voting) return;
    setVoting(true);
    try {
      const res = await fetch("/api/board/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const data = await res.json();
      if (res.ok) {
        setVote(data.vote);
      } else if (res.status === 409) {
        alert(data.message || "이미 추천하셨습니다.");
      } else {
        alert(data.message || "추천에 실패했습니다.");
      }
    } catch {
      alert("추천에 실패했습니다.");
    } finally {
      setVoting(false);
    }
  }

  function handleEdit() {
    if (canEdit) {
      router.push(`/board/${boardSlug}/write?mode=modify&no=${postId}`);
      return;
    }
    if (canPasswordEdit) {
      // 비밀번호 검증 → 통과 시 수정 모드로
      const pw = prompt("작성 시 입력한 비밀번호를 입력하세요:");
      if (!pw) return;
      // 미리 한 번 검증해서 잘못된 경우 즉시 안내
      fetch("/api/board/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, password: pw }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d?.ok) {
            // 비번을 query param 으로 넘겨 write 페이지가 읽어 prefill / 검증
            router.push(
              `/board/${boardSlug}/write?mode=modify&no=${postId}&pw=${encodeURIComponent(pw)}`,
            );
          } else {
            alert(d?.message || "비밀번호가 일치하지 않습니다.");
          }
        })
        .catch(() => alert("검증에 실패했습니다."));
    }
  }

  async function handleDelete() {
    let password = "";
    if (canDelete) {
      if (!confirm("이 게시글을 삭제하시겠습니까?")) return;
    } else if (canPasswordDelete) {
      const input = prompt("비밀번호를 입력하세요:");
      if (!input) return;
      password = input;
    } else {
      return;
    }

    try {
      const res = await fetch("/api/board/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardSlug, postId, password }),
      });
      if (res.ok) {
        router.push(`/board/${boardSlug}`);
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.message || "삭제에 실패했습니다.");
      }
    } catch {
      alert("삭제에 실패했습니다.");
    }
  }

  const showEdit = canEdit || canPasswordEdit;
  const showDelete = canDelete || canPasswordDelete;

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-t border-gray-100">
      <button
        onClick={handleVote}
        disabled={voting}
        className="flex items-center gap-1.5 px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-white hover:border-blue-400 transition-colors disabled:opacity-50"
      >
        <span>👍</span>
        <span>추천</span>
        <strong className="text-blue-700">{vote}</strong>
      </button>

      <div className="flex items-center gap-2">
        {showEdit && (
          <button
            onClick={handleEdit}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-white transition-colors"
            title={canPasswordEdit && !canEdit ? "비밀번호 입력 후 수정" : "수정"}
          >
            수정
            {canPasswordEdit && !canEdit && <span className="ml-1 text-[10px] text-amber-600">🔑</span>}
          </button>
        )}
        {showDelete && (
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm text-red-600 border border-gray-300 rounded hover:bg-white transition-colors"
            title={canPasswordDelete && !canDelete ? "비밀번호 입력 후 삭제" : "삭제"}
          >
            삭제
            {canPasswordDelete && !canDelete && <span className="ml-1 text-[10px] text-amber-600">🔑</span>}
          </button>
        )}
      </div>
    </div>
  );
}
