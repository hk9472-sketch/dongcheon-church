"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GrantGuestWriteButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function run() {
    if (
      !confirm(
        "전체 게시판의 비회원 글쓰기/답글 권한을 활성화합니다.\n\n이후 비회원도 이름·비밀번호 입력으로 글쓰기·답글 작성이 가능하며,\n작성 시 입력한 비밀번호로 본인 글을 수정/삭제할 수 있습니다.\n\n계속할까요?"
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/boards/grant-guest-write", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "처리 실패");
      } else {
        setMsg(data.message || "활성화 완료");
        router.refresh();
      }
    } catch {
      setMsg("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={run}
        disabled={busy}
        className="px-3 py-2 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "처리 중…" : "비회원 글쓰기 일괄 허용"}
      </button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </div>
  );
}
