"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 전체 게시판의 비회원 댓글(grantComment=99) 일괄 ON/OFF 버튼.
 * - ON: grantComment=99 (비회원도 이름·비번으로 댓글 작성 가능)
 * - OFF: grantComment=10 (회원만 작성 가능)
 */
export default function GrantGuestCommentButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function run(action: "on" | "off") {
    const confirmMsg =
      action === "on"
        ? "전체 게시판에서 비회원 댓글을 허용합니다.\n\n비회원은 이름·비밀번호를 입력하고 댓글을 달 수 있습니다.\n\n계속할까요?"
        : "전체 게시판의 비회원 댓글을 차단합니다.\n\n회원만 댓글을 달 수 있게 됩니다.\n\n계속할까요?";
    if (!confirm(confirmMsg)) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/boards/grant-guest-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "처리 실패");
      } else {
        setMsg(data.message || "처리 완료");
        router.refresh();
      }
    } catch {
      setMsg("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => run("on")}
        disabled={busy}
        className="px-3 py-2 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
      >
        비회원 댓글 일괄 ON
      </button>
      <button
        onClick={() => run("off")}
        disabled={busy}
        className="px-3 py-2 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
      >
        OFF
      </button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </div>
  );
}
