"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccountPerms } from "@/lib/useAccountPerms";
import HelpButton from "@/components/HelpButton";

interface BoardOption {
  id: number;
  slug: string;
  title: string;
  grantWrite: number;
}

interface ThanksEntry {
  id: number;
  date: string;
  memberId: number | null;
  memberNoAtDate?: number | null;
  member: { id: number; name: string; groupName: string | null } | null;
  amount: number;
  description: string | null;
}

function fmtAmount(n: number): string {
  return n.toLocaleString("ko-KR");
}

function todayStr() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function ThanksOfferingPage() {
  const { hasMemberEdit } = useAccountPerms();
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  // 인쇄 기준일자 — 단일 일자, 출력물 헤더에 표시.
  // 기본값은 종료일과 동일.
  const [printDate, setPrintDate] = useState(todayStr());
  const [entries, setEntries] = useState<ThanksEntry[]>([]);
  const [sortBy, setSortBy] = useState<"member" | "input">("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 게시판 등재
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [postBoardSlug, setPostBoardSlug] = useState("");
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<{ slug: string; postId: number; subject: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/accounting/offering/post-thanks");
        if (!res.ok) return;
        const data = await res.json();
        setBoards(Array.isArray(data.boards) ? data.boards : []);
      } catch {
        /* 게시판 목록 로드 실패는 무시 (등재 시 재검증) */
      }
    })();
  }, []);

  const postToBoard = async () => {
    if (!postBoardSlug) {
      setError("등재할 게시판을 선택하세요.");
      return;
    }
    const boardTitle = boards.find((b) => b.slug === postBoardSlug)?.title || postBoardSlug;
    if (!confirm(`기준일자(${printDate})의 감사연보 내역을\n"${boardTitle}" 게시판에 등재할까요?`)) return;
    setPosting(true);
    setError("");
    setPostResult(null);
    try {
      const res = await fetch("/api/accounting/offering/post-thanks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardSlug: postBoardSlug, date: printDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "등재에 실패했습니다.");
      setPostResult({ slug: data.boardSlug, postId: data.postId, subject: data.subject });
    } catch (err) {
      setError(err instanceof Error ? err.message : "등재에 실패했습니다.");
    } finally {
      setPosting(false);
    }
  };

  const sortedEntries = [...entries].sort((a, b) => {
    if (sortBy === "member") {
      const na = a.memberNoAtDate ?? a.memberId ?? 9_999_999;
      const nb = b.memberNoAtDate ?? b.memberId ?? 9_999_999;
      if (na !== nb) return na - nb;
    }
    return a.id - b.id;
  });

  const openPrint = (mode: "ad" | "list" | "handout") => {
    const url = `/accounting/offering/thanks/print?mode=${mode}&date=${encodeURIComponent(printDate)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        offeringType: "감사연보",
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/accounting/offering/entries?${params}`);
      if (!res.ok) throw new Error("데이터를 불러오지 못했습니다.");
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  const total = entries.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">감사연보현황 <HelpButton slug="offering-thanks" /></h1>

      {/* 필터 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">시작일</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">종료일</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <button
            onClick={fetchEntries}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
          >
            조회
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
          >
            인쇄(화면)
          </button>
        </div>

        {/* 인쇄 양식 — 기준일자 + 3종 버튼 */}
        <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">기준일자 (출력물에 표시)</label>
            <input
              type="date"
              value={printDate}
              onChange={(e) => setPrintDate(e.target.value)}
              className="px-3 py-2 border border-amber-300 bg-amber-50 rounded-lg text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => openPrint("ad")}
            className="px-4 py-2 bg-rose-600 text-white text-sm rounded-lg hover:bg-rose-700 font-semibold"
            title="광고용 — top 7개 + 안내문 3줄"
          >
            🖨 광고용
          </button>
          <button
            type="button"
            onClick={() => openPrint("list")}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 font-semibold"
            title="등재용 — 1단, 전체, 6번 후 구분선"
          >
            🖨 등재용
          </button>
          <button
            type="button"
            onClick={() => openPrint("handout")}
            className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 font-semibold"
            title="배부용 — 2단, 전체"
          >
            🖨 배부용
          </button>
          <p className="text-[11px] text-gray-500 ml-2">
            ※ 인쇄 대화상자에서 <strong>“헤더 및 바닥글”</strong> 옵션을 꺼야 양식이 깨끗하게 출력됩니다.
          </p>
        </div>

        {/* 게시판 등재 — 기준일자의 감사내역을 '등재용' 형식으로 모아 선택 게시판에 글 등록 */}
        <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">게시판 등재 (기준일자 내역)</label>
            <select
              value={postBoardSlug}
              onChange={(e) => {
                setPostBoardSlug(e.target.value);
                setPostResult(null);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-w-[12rem]"
            >
              <option value="">게시판 선택…</option>
              {boards.map((b) => (
                <option key={b.id} value={b.slug}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={postToBoard}
            disabled={posting || !postBoardSlug}
            className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-semibold disabled:opacity-50"
            title="기준일자의 감사연보 내역을 등재용 형식으로 선택한 게시판에 글로 등록합니다."
          >
            {posting ? "등재 중…" : "📝 게시판에 등재"}
          </button>
          <p className="text-[11px] text-gray-500 ml-1">
            제목 <strong>주일(yyyy년MM월dd일) 감사연보내역</strong> · 작성자 본인 · 기준일자 기준
          </p>
          {postResult && (
            <a
              href={`/board/${postResult.slug}/${postResult.postId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-emerald-700 font-semibold underline ml-1"
            >
              ✓ 등재 완료 — “{postResult.subject}” 보기
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">불러오는 중...</div>
      )}

      {/* 결과 */}
      {!loading && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* 정렬 */}
          {entries.length > 0 && (
            <div className="print:hidden flex items-center gap-4 px-4 py-2 border-b border-gray-100 text-sm">
              <span className="text-gray-500">정렬</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="radio" name="thanks-sort" checked={sortBy === "member"} onChange={() => setSortBy("member")} />
                개인번호별
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="radio" name="thanks-sort" checked={sortBy === "input"} onChange={() => setSortBy("input")} />
                입력순서별
              </label>
            </div>
          )}

          {/* 인쇄용 제목 */}
          <div className="hidden print:block text-center py-4">
            <h2 className="text-lg font-bold">감사연보현황</h2>
            <p className="text-sm text-gray-500">{dateFrom} ~ {dateTo}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-indigo-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-medium text-indigo-800 w-28">일자</th>
                  <th className="px-4 py-3 text-center font-medium text-indigo-800 w-12 print:w-12">No</th>
                  {hasMemberEdit && (
                    <>
                      <th className="px-4 py-3 text-left font-medium text-indigo-800 w-16 print:hidden">번호</th>
                      <th className="px-4 py-3 text-left font-medium text-indigo-800 w-24 print:hidden">성명</th>
                      <th className="px-4 py-3 text-left font-medium text-indigo-800 w-20 print:hidden">구역</th>
                      <th className="px-4 py-3 text-right font-medium text-indigo-800 w-28 print:hidden">금액</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-left font-medium text-indigo-800">감사연보내역</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={hasMemberEdit ? 7 : 3} className="px-4 py-8 text-center text-gray-400">
                      {dateFrom && dateTo ? "해당 기간에 감사연보 내역이 없습니다." : "조회 버튼을 눌러주세요."}
                    </td>
                  </tr>
                ) : (
                  sortedEntries.map((e, idx) => (
                    <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600">{formatDate(e.date)}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500">{idx + 1}</td>
                      {hasMemberEdit && (
                        <>
                          <td className="px-4 py-2.5 text-gray-600 print:hidden">{e.memberNoAtDate ?? e.memberId ?? "-"}</td>
                          <td className="px-4 py-2.5 text-gray-800 font-medium print:hidden">{e.member?.name ?? "(개인번호없음)"}</td>
                          <td className="px-4 py-2.5 text-gray-500 print:hidden">{e.member?.groupName || "-"}</td>
                          <td className="px-4 py-2.5 text-right text-blue-700 font-medium print:hidden">
                            {fmtAmount(e.amount)}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2.5 text-gray-700 whitespace-pre-line align-top">{e.description || ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {entries.length > 0 && hasMemberEdit && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-indigo-50 font-bold print:hidden">
                    <td className="px-4 py-3 text-indigo-800" colSpan={5}>
                      합계 ({entries.length}건)
                    </td>
                    <td className="px-4 py-3 text-right text-indigo-800">
                      {fmtAmount(total)}
                    </td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
