"use client";

import { useEffect, useState } from "react";

interface BackupRow {
  id: number;
  operation: string;
  description: string;
  rowCount: number;
  restoredAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

const OP_LABEL: Record<string, string> = {
  "bulk-move": "게시글 일괄이동",
  "headnum-reorder": "헤드넘 재정렬",
};

export default function OperationBackupsPage() {
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/operation-backups");
      const data = await res.json();
      setBackups(data.backups || []);
    } catch {
      setBackups([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRestore(b: BackupRow) {
    if (b.restoredAt) {
      setMessage({ type: "err", text: "이미 복원된 백업입니다." });
      return;
    }
    if (
      !confirm(
        `"${b.description}"\n\n이 백업으로 ${b.rowCount}건의 글을 복원합니다. 백업 시점 이후의 변경은 ` +
          `덮어써집니다. 진행할까요?`
      )
    )
      return;

    setBusy(b.id);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/operation-backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupId: b.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "복원 실패");
      setMessage({
        type: "ok",
        text: `${data.restored}건 복원 완료.`,
      });
      load();
    } catch (e: unknown) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "복원 실패",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(b: BackupRow) {
    if (!confirm(`백업 #${b.id} (${b.description}) 을 삭제하시겠습니까?`)) return;
    setBusy(b.id);
    try {
      const res = await fetch(`/api/admin/operation-backups?id=${b.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      load();
    } catch (e: unknown) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "삭제 실패" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">작업 백업 / 복원</h1>
        <p className="mt-1 text-sm text-gray-500">
          게시글 일괄이동·헤드넘 재정렬 작업은 실행 직전 영향받는 글의 메타데이터(boardId·categoryId·headnum·arrangenum·depth)를 자동으로 백업합니다.
          잘못 실행됐다면 여기서 백업 시점으로 복원할 수 있습니다.
        </p>
      </div>

      {message && (
        <div
          className={`px-4 py-2.5 rounded-lg text-sm ${
            message.type === "ok"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-700">총 {backups.length}건 (최근 50)</div>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
          >
            {loading ? "로딩..." : "새로 고침"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-gray-600 text-xs">
                <th className="px-2 py-2 text-right font-medium w-14">ID</th>
                <th className="px-2 py-2 text-left font-medium w-28">작업</th>
                <th className="px-2 py-2 text-left font-medium">설명</th>
                <th className="px-2 py-2 text-right font-medium w-16">행 수</th>
                <th className="px-2 py-2 text-left font-medium w-32">생성</th>
                <th className="px-2 py-2 text-left font-medium w-36">생성 일시</th>
                <th className="px-2 py-2 text-left font-medium w-36">상태</th>
                <th className="px-2 py-2 text-center font-medium w-32">동작</th>
              </tr>
            </thead>
            <tbody>
              {backups.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    백업 기록이 없습니다.
                  </td>
                </tr>
              )}
              {backups.map((b) => (
                <tr key={b.id} className="border-b border-gray-100">
                  <td className="px-2 py-1.5 text-right text-gray-500 font-mono">{b.id}</td>
                  <td className="px-2 py-1.5">
                    <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                      {OP_LABEL[b.operation] || b.operation}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">{b.description}</td>
                  <td className="px-2 py-1.5 text-right text-gray-700 font-mono">{b.rowCount}</td>
                  <td className="px-2 py-1.5 text-gray-500">{b.createdBy || "-"}</td>
                  <td className="px-2 py-1.5 text-gray-500 text-xs">
                    {new Date(b.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    {b.restoredAt ? (
                      <span className="text-gray-400">
                        복원됨 ({new Date(b.restoredAt).toLocaleString("ko-KR")})
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-medium">복원 가능</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center space-x-1">
                    <button
                      onClick={() => handleRestore(b)}
                      disabled={busy === b.id || !!b.restoredAt}
                      className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-40"
                    >
                      복원
                    </button>
                    <button
                      onClick={() => handleDelete(b)}
                      disabled={busy === b.id}
                      className="px-2 py-1 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
