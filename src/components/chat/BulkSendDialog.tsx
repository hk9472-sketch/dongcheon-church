"use client";

import { useEffect, useState } from "react";

interface Recipient {
  id: number;
  userId: string;
  name: string;
  hasEmail: boolean;
  isAdmin: boolean;
  isActive: boolean;
}

interface Props {
  onClose: () => void;
}

export default function BulkSendDialog({ onClose }: Props) {
  const [list, setList] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [content, setContent] = useState("");
  const [attach, setAttach] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);

  // 회원 목록 로드 (검색어 디바운스 없이 단순)
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      const sp = new URLSearchParams();
      if (q) sp.set("q", q);
      fetch(`/api/chat/recipients?${sp}`)
        .then((r) => r.json())
        .then((d) => setList(d.list || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const visible = activeOnly ? list.filter((r) => r.isActive) : list;

  const toggle = (id: number) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const ids = visible.map((r) => r.id);
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0) {
      alert("수신자를 선택하세요.");
      return;
    }
    if (!content.trim() && !attach) {
      alert("내용 또는 파일을 입력하세요.");
      return;
    }
    if (selectedIds.size > 50 && !confirm(`${selectedIds.size}명에게 발송합니다. 계속할까요?`)) {
      return;
    }
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("userIds", JSON.stringify(Array.from(selectedIds)));
      fd.append("content", content);
      if (attach) fd.append("attach", attach);
      const res = await fetch("/api/chat/bulk", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json();
        alert(err.message || "발송 실패");
        return;
      }
      const d = await res.json();
      alert(`${d.sent}명에게 발송 완료 (요청 ${d.requested}명).`);
      onClose();
    } finally {
      setSending(false);
    }
  };

  const selectedNames = list
    .filter((r) => selectedIds.has(r.id))
    .slice(0, 5)
    .map((r) => r.name)
    .join(", ");

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white rounded-t-lg">
          <h2 className="text-sm font-bold">📋 회원 선택 발송</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-indigo-700"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row gap-3 p-4 overflow-hidden">
          {/* 좌: 회원 목록 */}
          <div className="flex-1 min-w-0 flex flex-col bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-white border-b border-gray-200 space-y-1.5">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="이름·아이디 검색"
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-indigo-500"
              />
              <div className="flex items-center justify-between text-[11px]">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeOnly}
                    onChange={(e) => setActiveOnly(e.target.checked)}
                    className="w-3.5 h-3.5"
                  />
                  <span>현재 접속자만</span>
                </label>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-indigo-600 hover:underline"
                >
                  {visible.every((r) => selectedIds.has(r.id)) && visible.length > 0
                    ? "전체 해제"
                    : "전체 선택"}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading && (
                <div className="p-6 text-center text-gray-400 text-xs">불러오는 중...</div>
              )}
              {!loading && visible.length === 0 && (
                <div className="p-6 text-center text-gray-400 text-xs">결과 없음</div>
              )}
              <ul className="divide-y divide-gray-100">
                {visible.map((r) => {
                  const checked = selectedIds.has(r.id);
                  return (
                    <li key={r.id}>
                      <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-white cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(r.id)}
                          className="w-3.5 h-3.5"
                        />
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            r.isActive ? "bg-emerald-500" : "bg-gray-300"
                          }`}
                          title={r.isActive ? "접속 중" : "오프라인"}
                        />
                        <strong className="text-gray-800 truncate flex-1">
                          {r.name}
                        </strong>
                        <span className="text-gray-400 text-[10px]">{r.userId}</span>
                        {r.isAdmin && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded">관리</span>
                        )}
                        {!r.hasEmail && (
                          <span className="text-[10px] text-gray-400" title="이메일 없음">📧?</span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="px-3 py-1.5 bg-white border-t border-gray-200 text-[11px] text-gray-600">
              선택: <strong className="text-indigo-700">{selectedIds.size}</strong>명
              {selectedNames && <span className="ml-2 text-gray-400">({selectedNames}{selectedIds.size > 5 ? " 외" : ""})</span>}
            </div>
          </div>

          {/* 우: 메시지 작성 */}
          <form onSubmit={submit} className="lg:w-72 flex flex-col gap-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="메시지를 입력하세요..."
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-indigo-500 resize-none"
              maxLength={2000}
            />
            <label className="flex items-center gap-2 px-2 py-1.5 border border-gray-300 rounded cursor-pointer hover:bg-gray-50 text-xs">
              <span>📎</span>
              <span className="flex-1 truncate text-gray-600">
                {attach ? attach.name : "파일 첨부 (선택)"}
              </span>
              <input
                type="file"
                onChange={(e) => setAttach(e.target.files?.[0] || null)}
                className="hidden"
              />
              {attach && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setAttach(null); }}
                  className="text-red-500 hover:text-red-700"
                >
                  ✕
                </button>
              )}
            </label>
            <button
              type="submit"
              disabled={sending || selectedIds.size === 0 || (!content.trim() && !attach)}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending
                ? "발송 중..."
                : `${selectedIds.size}명에게 발송`}
            </button>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              비접속 수신자에게는 이메일로도 알림 발송 (이메일 인증된 경우).
              최대 200명까지 한 번에 발송 가능.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
