"use client";

import { useEffect, useState } from "react";

interface Item {
  code: number;
  hex: string;
  char: string;
  context: string | null;
  addedById: number | null;
  addedByName: string | null;
  createdAt: string;
}

export default function PuaMapAdminPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [busyCode, setBusyCode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pua-map", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (it: Item) =>
    setEditing((prev) => ({ ...prev, [it.code]: it.char }));
  const cancelEdit = (code: number) =>
    setEditing((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });

  const saveEdit = async (code: number) => {
    const char = (editing[code] ?? "").trim();
    if (!char) {
      alert("글자를 입력해주세요.");
      return;
    }
    setBusyCode(code);
    try {
      const res = await fetch("/api/admin/pua-map", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, char }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      cancelEdit(code);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "수정 실패");
    } finally {
      setBusyCode(null);
    }
  };

  const remove = async (code: number, hex: string, char: string) => {
    if (!confirm(`${hex} → ${char} 매핑을 삭제할까요?`)) return;
    setBusyCode(code);
    try {
      const res = await fetch(`/api/admin/pua-map?code=${code}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "삭제 실패");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">PUA 매핑 관리</h1>
        <button
          type="button"
          onClick={load}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          새로고침
        </button>
      </div>

      <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        한컴 글꼴(한컴바탕 등) 의 PUA 영역 코드포인트를 표준 unicode 글자로 매핑한 표.
        작성자가 게시글 작성 중 paste 모달에서 등록하거나, 여기서 직접 수정·삭제 가능.
        정적 매핑(<code className="rounded bg-white px-1">src/lib/hwpPuaMap.ts</code>) 보다 우선 적용됨.
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="rounded border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
          등록된 매핑이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2 font-medium">코드</th>
                <th className="px-3 py-2 font-medium">글자</th>
                <th className="px-3 py-2 font-medium">컨텍스트</th>
                <th className="px-3 py-2 font-medium">등록자</th>
                <th className="px-3 py-2 font-medium">등록일</th>
                <th className="px-3 py-2 font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const isEditing = editing[it.code] !== undefined;
                const busy = busyCode === it.code;
                return (
                  <tr key={it.code} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{it.hex}</td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editing[it.code]}
                          maxLength={8}
                          onChange={(e) =>
                            setEditing((p) => ({ ...p, [it.code]: e.target.value }))
                          }
                          className="w-20 rounded border border-gray-300 px-2 py-1 text-center font-mono"
                        />
                      ) : (
                        <span className="font-mono text-base">{it.char}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">
                      {it.context || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {it.addedByName || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {new Date(it.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => saveEdit(it.code)}
                              className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => cancelEdit(it.code)}
                              className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => startEdit(it)}
                              className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => remove(it.code, it.hex, it.char)}
                              className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              삭제
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
