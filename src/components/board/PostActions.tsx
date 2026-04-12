"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface PostActionsProps {
  boardSlug: string;
  postId: number;
  currentVote: number;
  canEdit?: boolean;
  canDelete?: boolean;
  isGuestPost?: boolean;  // authorId=null인 비회원(ZeroBoard 이관) 글
}

export default function PostActions({ boardSlug, postId, currentVote, canEdit = false, canDelete = false, isGuestPost = false }: PostActionsProps) {
  const router = useRouter();
  const [vote, setVote] = useState(currentVote);
  const [voting, setVoting] = useState(false);

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

  async function handleDelete() {
    let password = "";
    if (canDelete) {
      if (!confirm("이 게시글을 삭제하시겠습니까?")) return;
    } else if (isGuestPost) {
      // 비회원 글: 비밀번호 확인
      const input = prompt("비밀번호를 입력하세요:");
      if (!input) return;
      password = input;
    } else {
      return; // 권한 없음 (버튼이 표시되지 않아야 하지만 방어 처리)
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
        {(canEdit || isGuestPost) && (
          <button
            onClick={() => router.push(`/board/${boardSlug}/write?mode=modify&no=${postId}`)}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-white transition-colors"
          >
            수정
          </button>
        )}
        {(canDelete || isGuestPost) && (
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm text-red-600 border border-gray-300 rounded hover:bg-white transition-colors"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
