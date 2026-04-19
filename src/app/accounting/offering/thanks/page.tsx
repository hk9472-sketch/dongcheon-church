"use client";

import { useCallback, useState } from "react";
import { useAccountPerms } from "@/lib/useAccountPerms";
import HelpButton from "@/components/HelpButton";

interface ThanksEntry {
  id: number;
  date: string;
  memberId: number | null;
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

function monthStartStr() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
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
  const [dateFrom, setDateFrom] = useState(monthStartStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [entries, setEntries] = useState<ThanksEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    } catch (err: any) {
      setError(err.message);
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
            인쇄
          </button>
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
                  entries.map((e, idx) => (
                    <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600">{formatDate(e.date)}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500">{idx + 1}</td>
                      {hasMemberEdit && (
                        <>
                          <td className="px-4 py-2.5 text-gray-600 print:hidden">{e.memberId ?? "-"}</td>
                          <td className="px-4 py-2.5 text-gray-800 font-medium print:hidden">{e.member?.name ?? "(개인번호없음)"}</td>
                          <td className="px-4 py-2.5 text-gray-500 print:hidden">{e.member?.groupName || "-"}</td>
                          <td className="px-4 py-2.5 text-right text-blue-700 font-medium print:hidden">
                            {fmtAmount(e.amount)}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2.5 text-gray-700">{e.description || ""}</td>
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
