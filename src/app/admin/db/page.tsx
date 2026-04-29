"use client";

import { useCallback, useEffect, useState } from "react";
import HelpButton from "@/components/HelpButton";

type Tab = "visitor-stats" | "site-settings" | "visit-logs";

interface VisitorStat {
  id: number;
  date: string;
  count: number;
}

interface SiteSetting {
  id: number;
  key: string;
  value: string;
}

interface VisitLogEntry {
  id: number;
  ip: string;
  path: string;
  referer: string | null;
  userAgent: string | null;
  userId: number | null;
  createdAt: string;
}

export default function AdminDbPage() {
  const [tab, setTab] = useState<Tab>("visitor-stats");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");

  // Data states
  const [visitorStats, setVisitorStats] = useState<VisitorStat[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSetting[]>([]);
  const [visitLogs, setVisitLogs] = useState<VisitLogEntry[]>([]);

  // Edit states
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newSettingKey, setNewSettingKey] = useState("");
  const [newSettingValue, setNewSettingValue] = useState("");
  const [message, setMessage] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tab,
        page: String(page),
        ...(keyword && tab === "visit-logs" ? { keyword } : {}),
      });
      const res = await fetch(`/api/admin/db?${params}`);
      const data = await res.json();

      if (tab === "visitor-stats") {
        setVisitorStats(data.records || []);
      } else if (tab === "site-settings") {
        setSiteSettings(data.records || []);
      } else if (tab === "visit-logs") {
        setVisitLogs(data.records || []);
      }
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setMessage("데이터 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [tab, page, keyword]);

  useEffect(() => {
    fetchData();
  }, [tab, page, fetchData]);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  };

  // -- 방문자 카운트 수정 --
  const handleUpdateCount = async (id: number) => {
    const res = await fetch("/api/admin/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update-visitor-count",
        id,
        count: parseInt(editValue, 10),
      }),
    });
    const data = await res.json();
    if (data.success) {
      setEditingId(null);
      showMessage("수정 완료");
      fetchData();
    } else {
      showMessage(data.error || "수정 실패");
    }
  };

  // -- 사이트 설정 추가/수정 --
  const handleUpsertSetting = async (key: string, value: string) => {
    const res = await fetch("/api/admin/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert-setting", key, value }),
    });
    const data = await res.json();
    if (data.success) {
      setEditingId(null);
      setNewSettingKey("");
      setNewSettingValue("");
      showMessage("저장 완료");
      fetchData();
    } else {
      showMessage(data.error || "저장 실패");
    }
  };

  // -- 삭제 --
  const handleDelete = async (tabName: string, ids: number[]) => {
    if (!confirm(`${ids.length}건을 삭제하시겠습니까?`)) return;
    const res = await fetch("/api/admin/db", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab: tabName, ids }),
    });
    const data = await res.json();
    if (data.success) {
      showMessage(`${data.count}건 삭제 완료`);
      fetchData();
    } else {
      showMessage(data.error || "삭제 실패");
    }
  };

  // -- 전체 로그 삭제 --
  const handleDeleteAllLogs = async () => {
    if (!confirm("모든 방문 로그를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."))
      return;
    const res = await fetch("/api/admin/db", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab: "visit-logs-all" }),
    });
    const data = await res.json();
    if (data.success) {
      showMessage(`${data.count}건 삭제 완료`);
      fetchData();
    } else {
      showMessage(data.error || "삭제 실패");
    }
  };


  const tabs: { key: Tab; label: string }[] = [
    { key: "visitor-stats", label: "방문자 통계" },
    { key: "site-settings", label: "사이트 설정" },
    { key: "visit-logs", label: "방문 로그" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">DB 관리 <HelpButton slug="admin-db" /></h1>

      {message && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded text-sm">
          {message}
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setPage(1);
              setKeyword("");
              setEditingId(null);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 방문자 통계 탭 */}
      {tab === "visitor-stats" && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">
              일별 방문자 카운트 ({total}건)
            </h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">로딩 중...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-xs">
                  <th className="py-2 px-4 text-left font-medium">ID</th>
                  <th className="py-2 px-4 text-left font-medium">날짜</th>
                  <th className="py-2 px-4 text-right font-medium">방문자 수</th>
                  <th className="py-2 px-4 text-center font-medium">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visitorStats.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="py-2 px-4 text-gray-400 text-xs">{r.id}</td>
                    <td className="py-2 px-4">{r.date}</td>
                    <td className="py-2 px-4 text-right">
                      {editingId === r.id ? (
                        <input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-24 border rounded px-2 py-1 text-right text-sm"
                        />
                      ) : (
                        r.count.toLocaleString()
                      )}
                    </td>
                    <td className="py-2 px-4 text-center space-x-1">
                      {editingId === r.id ? (
                        <>
                          <button
                            onClick={() => handleUpdateCount(r.id)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-gray-500 hover:underline"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(r.id);
                              setEditValue(String(r.count));
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDelete("visitor-stats", [r.id])}
                            className="text-xs text-red-500 hover:underline"
                          >
                            삭제
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {visitorStats.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-400">
                      데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* 사이트 설정 탭 */}
      {tab === "site-settings" && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">
              사이트 설정 ({total}건)
            </h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">로딩 중...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-xs">
                  <th className="py-2 px-4 text-left font-medium">ID</th>
                  <th className="py-2 px-4 text-left font-medium">키 (key)</th>
                  <th className="py-2 px-4 text-left font-medium">값 (value)</th>
                  <th className="py-2 px-4 text-center font-medium">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {siteSettings.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="py-2 px-4 text-gray-400 text-xs">{r.id}</td>
                    <td className="py-2 px-4 font-mono text-xs">{r.key}</td>
                    <td className="py-2 px-4">
                      {editingId === r.id ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full border rounded px-2 py-1 text-sm"
                        />
                      ) : (
                        <span className="break-all">{r.value}</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-center space-x-1">
                      {editingId === r.id ? (
                        <>
                          <button
                            onClick={() =>
                              handleUpsertSetting(r.key, editValue)
                            }
                            className="text-xs text-blue-600 hover:underline"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-gray-500 hover:underline"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(r.id);
                              setEditValue(r.value);
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            수정
                          </button>
                          <button
                            onClick={() =>
                              handleDelete("site-settings", [r.id])
                            }
                            className="text-xs text-red-500 hover:underline"
                          >
                            삭제
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {siteSettings.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-400">
                      설정이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* 새 설정 추가 */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
            <h3 className="text-xs font-bold text-gray-600 mb-2">새 설정 추가</h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="키"
                value={newSettingKey}
                onChange={(e) => setNewSettingKey(e.target.value)}
                className="border rounded px-2 py-1 text-sm flex-1"
              />
              <input
                type="text"
                placeholder="값"
                value={newSettingValue}
                onChange={(e) => setNewSettingValue(e.target.value)}
                className="border rounded px-2 py-1 text-sm flex-1"
              />
              <button
                onClick={() => {
                  if (newSettingKey.trim()) {
                    handleUpsertSetting(newSettingKey.trim(), newSettingValue);
                  }
                }}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 방문 로그 탭 */}
      {tab === "visit-logs" && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-bold text-gray-700">
              방문 로그 ({total.toLocaleString()}건)
            </h2>
            <div className="flex gap-2">
              <div className="flex">
                <input
                  type="text"
                  placeholder="IP, 경로, 리퍼러 검색"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setPage(1);
                      fetchData();
                    }
                  }}
                  className="border rounded-l px-2 py-1 text-sm w-48"
                />
                <button
                  onClick={() => {
                    setPage(1);
                    fetchData();
                  }}
                  className="px-3 py-1 bg-gray-600 text-white text-sm rounded-r hover:bg-gray-700"
                >
                  검색
                </button>
              </div>
              <button
                onClick={handleDeleteAllLogs}
                className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
              >
                전체 삭제
              </button>
            </div>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">로딩 중...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs">
                    <th className="py-2 px-3 text-left font-medium">ID</th>
                    <th className="py-2 px-3 text-left font-medium">IP</th>
                    <th className="py-2 px-3 text-left font-medium">경로</th>
                    <th className="py-2 px-3 text-left font-medium">리퍼러</th>
                    <th className="py-2 px-3 text-left font-medium">일시</th>
                    <th className="py-2 px-3 text-center font-medium">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visitLogs.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="py-1.5 px-3 text-gray-400 text-xs">
                        {r.id}
                      </td>
                      <td className="py-1.5 px-3 font-mono text-xs">
                        {r.ip}
                      </td>
                      <td
                        className="py-1.5 px-3 text-xs max-w-[200px] truncate"
                        title={r.path}
                      >
                        {r.path}
                      </td>
                      <td
                        className="py-1.5 px-3 text-xs max-w-[200px] truncate text-gray-500"
                        title={r.referer || ""}
                      >
                        {r.referer || "-"}
                      </td>
                      <td className="py-1.5 px-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString("ko-KR")}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <button
                          onClick={() => handleDelete("visit-logs", [r.id])}
                          className="text-xs text-red-500 hover:underline"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                  {visitLogs.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 text-center text-gray-400"
                      >
                        데이터가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

    </div>
  );
}


// 페이징 컴포넌트
function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 4);
  const end = Math.min(totalPages, page + 4);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-center gap-1 py-3 border-t border-gray-100">
      {page > 1 && (
        <button
          onClick={() => onPageChange(page - 1)}
          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
        >
          &lt;
        </button>
      )}
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`px-2 py-1 text-xs rounded ${
            p === page
              ? "bg-blue-600 text-white"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          {p}
        </button>
      ))}
      {page < totalPages && (
        <button
          onClick={() => onPageChange(page + 1)}
          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
        >
          &gt;
        </button>
      )}
    </div>
  );
}
