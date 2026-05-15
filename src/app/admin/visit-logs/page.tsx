"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface VisitLog {
  id: number;
  ip: string;
  path: string;
  referer: string | null;
  userAgent: string | null;
  userId: number | null;
  createdAt: string;
}

function todayKstYmd(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function daysAgoKstYmd(days: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - days * 24 * 3600 * 1000)
    .toISOString().slice(0, 10);
}

function AdminVisitLogsContent() {
  const today = todayKstYmd();
  const searchParams = useSearchParams();

  // URL 쿼리 파라미터로 초기값 — 푸터에서 "현재/오늘/어제" 클릭으로 진입 시 사용
  const initRecent = parseInt(searchParams.get("recent") || "0", 10);
  const initFrom = searchParams.get("from") || (initRecent > 0 ? "" : daysAgoKstYmd(0));
  const initTo = searchParams.get("to") || (initRecent > 0 ? "" : today);

  // 필터 상태
  const [from, setFrom] = useState(initFrom);
  const [to, setTo] = useState(initTo);
  const [recent, setRecent] = useState(initRecent); // 분 단위. >0 이면 "최근 N분" 모드
  const [ip, setIp] = useState("");
  const [path, setPath] = useState("");
  const [ua, setUa] = useState("");
  const [referer, setReferer] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(100);

  // 결과
  const [rows, setRows] = useState<VisitLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    const sp = new URLSearchParams();
    if (recent > 0) {
      sp.set("recent", String(recent));
    } else {
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
    }
    if (ip) sp.set("ip", ip);
    if (path) sp.set("path", path);
    if (ua) sp.set("ua", ua);
    if (referer) sp.set("referer", referer);
    if (userId) sp.set("userId", userId);
    sp.set("page", String(page));
    sp.set("perPage", String(perPage));

    setLoading(true);
    fetch(`/api/admin/visit-logs?${sp}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows || []);
        setTotal(d.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to, recent, ip, path, ua, referer, userId, page, perPage]);

  // 첫 마운트 + 페이지 변경 시 자동 로드
  useEffect(() => {
    load();
  }, [page, perPage, load]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const resetFilters = () => {
    setIp("");
    setPath("");
    setUa("");
    setReferer("");
    setUserId("");
    setFrom(daysAgoKstYmd(0));
    setTo(today);
    setRecent(0);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="inline-block w-1 h-7 bg-blue-700 rounded-full" />
        <h1 className="text-xl font-bold text-gray-800">방문 로그</h1>
        <span className="text-xs text-gray-500">visit_logs — 사이트 전체 페이지 방문 기록</span>
      </div>

      {/* 필터 */}
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">시작일</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">종료일</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>

          {/* 빠른 기간 선택 */}
          <div className="flex items-end gap-1">
            {[
              { label: "오늘", days: 0 },
              { label: "7일", days: 6 },
              { label: "14일", days: 13 },
              { label: "30일", days: 29 },
            ].map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  setFrom(daysAgoKstYmd(q.days));
                  setTo(today);
                  setRecent(0);
                  setPage(1);
                }}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* recent 모드 표시 */}
          {recent > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              <span>최근 <strong>{recent}분</strong> 모드</span>
              <button
                type="button"
                onClick={() => { setRecent(0); setPage(1); }}
                className="text-amber-700 hover:underline"
                title="일자 기간 모드로 전환"
              >
                일자 모드로
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">IP (부분 일치)</label>
            <input
              type="text"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="예: 58.126."
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">path (부분 일치)</label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="예: /board/DcPds"
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">UA (부분 일치)</label>
            <input
              type="text"
              value={ua}
              onChange={(e) => setUa(e.target.value)}
              placeholder="예: Android"
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">referer (부분)</label>
            <input
              type="text"
              value={referer}
              onChange={(e) => setReferer(e.target.value)}
              placeholder="예: google.com"
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              회원 id <span className="text-gray-400">(0 = 비회원만)</span>
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="예: 12 또는 0"
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="px-4 py-1.5 text-sm bg-blue-700 text-white rounded hover:bg-blue-800"
          >
            조회
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            초기화
          </button>
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
            <label>페이지당</label>
            <select
              value={perPage}
              onChange={(e) => { setPerPage(parseInt(e.target.value, 10)); setPage(1); }}
              className="border border-gray-300 rounded px-1.5 py-0.5 text-xs"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
            <span>·</span>
            <span>총 <strong className="text-blue-700">{total.toLocaleString()}</strong> 건</span>
          </div>
        </div>
      </form>

      {/* 결과 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[65vh]">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-40">시각 (KST)</th>
                <th className="px-3 py-2 text-left font-medium w-32">IP</th>
                <th className="px-3 py-2 text-left font-medium">path</th>
                <th className="px-3 py-2 text-left font-medium w-32">referer</th>
                <th className="px-3 py-2 text-left font-medium">UA</th>
                <th className="px-3 py-2 text-right font-medium w-14">회원</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400">불러오는 중...</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="py-14 text-center text-gray-400">데이터 없음</td></tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-blue-50/30">
                  <td className="px-3 py-1.5 font-mono text-gray-700 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-gray-600 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => { setIp(r.ip); setPage(1); }}
                      className="hover:text-blue-700 hover:underline"
                      title="이 IP 로 필터"
                    >
                      {r.ip}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-gray-700 max-w-[300px] truncate">
                    <button
                      type="button"
                      onClick={() => { setPath(r.path); setPage(1); }}
                      className="hover:text-blue-700 hover:underline text-left"
                      title={r.path}
                    >
                      {r.path}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-gray-500 max-w-[200px] truncate" title={r.referer || ""}>
                    {r.referer || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-gray-400 max-w-[280px] truncate" title={r.userAgent || ""}>
                    {r.userAgent?.slice(0, 60) || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600">
                    {r.userId ?? <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-4 py-2 border-t border-gray-200 flex items-center justify-center gap-2 text-xs">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-30"
            >
              이전
            </button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-30"
            >
              다음
            </button>
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 leading-relaxed bg-gray-50 border border-gray-200 rounded-md p-3">
        <p className="font-semibold text-gray-700 mb-1">참고</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>날짜는 KST (한국 표준시) 기준. <strong>종료일</strong> 은 해당 일 끝(23:59:59) 까지 포함.</li>
          <li>같은 IP 가 하루에 여러 페이지 방문해도 모두 row 로 남음 (visitor_counts 의 카운트는 IP/일 1회만 증가).</li>
          <li>표의 IP·path 셀을 클릭하면 그 값으로 필터링.</li>
          <li>회원 id 칸에 <code>0</code> 을 입력하면 비회원 트래픽만 조회.</li>
        </ul>
      </div>
    </div>
  );
}

// Suspense boundary for useSearchParams
export default function AdminVisitLogsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">로딩 중...</div>}>
      <AdminVisitLogsContent />
    </Suspense>
  );
}
