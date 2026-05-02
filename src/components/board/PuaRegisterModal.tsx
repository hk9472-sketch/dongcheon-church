"use client";

import { useState, useEffect } from "react";
import type { UnmappedSample } from "@/lib/hwpPuaMap";

interface Props {
  samples: UnmappedSample[];
  /** 등록 성공 시 부모에게 코드 → 글자 매핑 통지. 부모가 본문 치환·캐시 갱신. */
  onRegistered: (newMap: Record<number, string>) => void;
  onClose: () => void;
}

interface RowState {
  code: number;
  context: string;
  input: string;
  status: "idle" | "saving" | "ok" | "error" | "exists";
  message?: string;
}

export default function PuaRegisterModal({ samples, onRegistered, onClose }: Props) {
  const [rows, setRows] = useState<RowState[]>(() =>
    samples.map((s) => ({ code: s.code, context: s.context, input: "", status: "idle" })),
  );

  // ESC 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const updateRow = (idx: number, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const submitOne = async (idx: number) => {
    const row = rows[idx];
    const char = row.input.trim();
    if (!char) {
      updateRow(idx, { status: "error", message: "글자를 입력해주세요." });
      return;
    }
    updateRow(idx, { status: "saving", message: undefined });
    try {
      const res = await fetch("/api/board/pua-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: row.code, char, context: row.context }),
      });
      const data = await res.json();
      if (res.ok) {
        updateRow(idx, { status: "ok", message: `등록됨 → ${char}` });
        onRegistered({ [row.code]: char });
      } else if (res.status === 409) {
        updateRow(idx, {
          status: "exists",
          input: data.existing || "",
          message: `이미 ${data.existing} 로 등록됨`,
        });
        if (data.existing) onRegistered({ [row.code]: data.existing });
      } else {
        updateRow(idx, { status: "error", message: data.error || "등록 실패" });
      }
    } catch {
      updateRow(idx, { status: "error", message: "네트워크 오류" });
    }
  };

  const submitAll = async () => {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].status === "ok" || rows[i].status === "exists") continue;
      await submitOne(i);
    }
  };

  const fmtCode = (c: number) => `U+${c.toString(16).toUpperCase().padStart(4, "0")}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">한컴 전용 특수문자 등록</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-3 text-sm text-gray-600">
          한글 워드프로세서에서 복사한 본문에 표준 unicode 가 아닌 특수문자가 있어.
          이 컴퓨터에 한글이 설치돼 있다면 <strong>아래 [□] 자리에 본인 화면에서 보이는 글자</strong>를
          그대로 입력해줘. 한 번 등록하면 모든 사용자가 같은 글자로 보게 돼.
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-5 pb-3">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-gray-500">
              <tr>
                <th className="py-2 font-medium">코드</th>
                <th className="py-2 font-medium">본인 화면 표시</th>
                <th className="py-2 font-medium">입력</th>
                <th className="py-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.code} className="border-b last:border-b-0">
                  <td className="py-2 font-mono text-xs text-gray-500">{fmtCode(r.code)}</td>
                  <td className="py-2 text-xs text-gray-700">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">
                      {r.context || "—"}
                    </span>
                  </td>
                  <td className="py-2">
                    <input
                      type="text"
                      value={r.input}
                      maxLength={8}
                      onChange={(e) => updateRow(i, { input: e.target.value, status: "idle" })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitOne(i);
                        }
                      }}
                      disabled={r.status === "saving" || r.status === "ok"}
                      placeholder="예: ①"
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-center font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
                    />
                  </td>
                  <td className="py-2 text-xs">
                    {r.status === "saving" && <span className="text-gray-500">저장 중...</span>}
                    {r.status === "ok" && <span className="text-green-600">✓ {r.message}</span>}
                    {r.status === "exists" && (
                      <span className="text-blue-600">✓ {r.message}</span>
                    )}
                    {r.status === "error" && <span className="text-red-600">{r.message}</span>}
                    {r.status === "idle" && (
                      <button
                        type="button"
                        onClick={() => submitOne(i)}
                        className="rounded bg-indigo-600 px-2 py-0.5 text-white hover:bg-indigo-700"
                      >
                        등록
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2 border-t bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={submitAll}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-700"
          >
            모두 등록
          </button>
        </div>
      </div>
    </div>
  );
}
