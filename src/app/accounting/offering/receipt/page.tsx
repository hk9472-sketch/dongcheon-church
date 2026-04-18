"use client";

import { useEffect, useState } from "react";
import { useAccountPerms } from "@/lib/useAccountPerms";

/* ───── constants ───── */
const OFFERING_TYPES = ["주일연보", "감사", "특별", "절기", "오일"] as const;

/* ───── types ───── */
interface ReceiptData {
  memberId: number;          // 가족 대표(head)의 id
  memberName: string;        // 대표자 이름
  groupName: string | null;
  year: number;
  items: Record<string, number>;
  total: number;
  selectedMemberId?: number; // 사용자가 선택한 구성원 (head와 다르면 rollup 안내)
  familyMembers?: { id: number; name: string }[];
}

/* ───── helpers ───── */
function fmtAmount(n: number): string {
  return n.toLocaleString("ko-KR");
}

function currentYear(): number {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })).getFullYear();
}

/* ───── component ───── */
export default function OfferingReceiptPage() {
  const { hasMemberEdit } = useAccountPerms();
  const [year, setYear] = useState(currentYear());
  const [memberSearch, setMemberSearch] = useState("");
  const [memberCandidates, setMemberCandidates] = useState<{ id: number; name: string; groupName: string | null }[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [selectedMemberName, setSelectedMemberName] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(false);

  // church info (could come from settings API)
  const churchName = "동천교회";
  const churchRepresentative = "담임목사";

  /* ---- member search ---- */
  useEffect(() => {
    if (!memberSearch || memberSearch.length < 1) {
      setMemberCandidates([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/accounting/offering/members?name=${encodeURIComponent(memberSearch)}&activeOnly=true`)
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) {
            setMemberCandidates(
              d.map((m: { id: number; name: string; groupName: string | null }) => ({
                id: m.id,
                name: m.name,
                groupName: m.groupName,
              }))
            );
          }
        })
        .catch(() => setMemberCandidates([]));
    }, 300);
    return () => clearTimeout(t);
  }, [memberSearch]);

  /* ---- fetch receipt ---- */
  useEffect(() => {
    if (!selectedMemberId) {
      setReceipt(null);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({
      reportType: "receipt",
      memberId: String(selectedMemberId),
      year: String(year),
    });
    fetch(`/api/accounting/offering/report?${params}`)
      .then((r) => r.json())
      .then((d) => setReceipt(d))
      .catch(() => setReceipt(null))
      .finally(() => setLoading(false));
  }, [selectedMemberId, year]);

  /* ---- print ---- */
  function handlePrint() {
    window.print();
  }

  /* ---- today string ---- */
  const todayFormatted = (() => {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  })();

  /* ======== render ======== */
  return (
    <div className="space-y-6">
      {/* controls - hidden on print */}
      <div className="print:hidden space-y-6">
        <h1 className="text-xl font-bold text-gray-800">기부금영수증</h1>

        <div className="bg-white rounded-lg shadow-sm border-t-4 border-teal-500 p-4 md:p-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">연도</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 w-32"
              >
                {Array.from({ length: 10 }, (_, i) => currentYear() - i).map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
            </div>
            <div className="relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">회원 검색</label>
              <input
                type="text"
                value={selectedMemberId ? `${selectedMemberId} - ${selectedMemberName}` : memberSearch}
                onChange={(e) => {
                  setMemberSearch(e.target.value);
                  setSelectedMemberId(null);
                  setSelectedMemberName("");
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="이름 또는 번호로 검색"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 w-56"
              />
              {selectedMemberId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMemberId(null);
                    setSelectedMemberName("");
                    setMemberSearch("");
                    setReceipt(null);
                  }}
                  className="absolute right-2 top-7 text-gray-400 hover:text-red-500 text-lg leading-none"
                >
                  &times;
                </button>
              )}
              {showDropdown && memberCandidates.length > 0 && !selectedMemberId && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {memberCandidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedMemberId(c.id);
                        setSelectedMemberName(c.name);
                        setShowDropdown(false);
                        setMemberSearch("");
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 transition-colors"
                    >
                      <span className="text-teal-600 font-medium">{c.id}</span>
                      <span className="ml-2 text-gray-700">{c.name}</span>
                      {c.groupName && (
                        <span className="ml-2 text-gray-400 text-xs">({c.groupName})</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {receipt && (
              <button
                type="button"
                onClick={handlePrint}
                className="px-5 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors ml-auto"
              >
                인쇄
              </button>
            )}
          </div>
        </div>
      </div>

      {/* receipt preview / print area */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 print:hidden">로딩 중...</div>
      ) : !receipt ? (
        <div className="text-center py-8 text-gray-400 print:hidden">
          회원을 선택하면 영수증이 표시됩니다.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 md:p-12 max-w-2xl mx-auto print:shadow-none print:border-2 print:border-gray-800 print:max-w-none print:mx-0 print:p-10">
          {/* header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 tracking-widest print:text-3xl">
              기부금 영수증
            </h2>
            <div className="mt-2 w-24 h-0.5 bg-teal-600 mx-auto print:bg-gray-800"></div>
          </div>

          {/* donor info */}
          <div className="mb-8">
            {/* 선택한 구성원이 가족 대표가 아니면 rollup 안내 (인쇄에서는 숨김) */}
            {receipt.selectedMemberId && receipt.selectedMemberId !== receipt.memberId && (
              <div className="mb-3 px-3 py-2 text-xs bg-teal-50 text-teal-700 rounded print:hidden">
                선택한 구성원이 포함된 <strong>가족 대표({receipt.memberName})</strong> 명의로 가족 전원의 연보가 합산되어 발급됩니다.
              </div>
            )}
            <table className="text-sm">
              <tbody>
                <tr>
                  <td className="pr-4 py-1.5 text-gray-600 font-medium w-20">번호</td>
                  <td className="py-1.5 text-gray-900">{receipt.memberId}</td>
                </tr>
                {hasMemberEdit && (
                  <tr>
                    <td className="pr-4 py-1.5 text-gray-600 font-medium">성명</td>
                    <td className="py-1.5 text-gray-900 font-bold text-base">{receipt.memberName}</td>
                  </tr>
                )}
                {receipt.groupName && (
                  <tr>
                    <td className="pr-4 py-1.5 text-gray-600 font-medium">구역</td>
                    <td className="py-1.5 text-gray-900">{receipt.groupName}</td>
                  </tr>
                )}
                <tr>
                  <td className="pr-4 py-1.5 text-gray-600 font-medium">기간</td>
                  <td className="py-1.5 text-gray-900">
                    {receipt.year}년 1월 1일 ~ {receipt.year}년 12월 31일
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* offering details table */}
          <div className="mb-8">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-t-2 border-b border-gray-800">
                  <th className="px-4 py-3 text-left font-bold text-gray-800">연보종류</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-800">금액 (원)</th>
                </tr>
              </thead>
              <tbody>
                {OFFERING_TYPES.map((t) => (
                  <tr key={t} className="border-b border-gray-200">
                    <td className="px-4 py-2.5 text-gray-700">{t}</td>
                    <td className="px-4 py-2.5 text-right text-blue-700 font-medium">
                      {receipt.items[t] ? fmtAmount(receipt.items[t]) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-800 bg-gray-50 print:bg-gray-100">
                  <td className="px-4 py-3 font-bold text-gray-900">총합계</td>
                  <td className="px-4 py-3 text-right font-bold text-blue-900 text-lg">
                    {fmtAmount(receipt.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* message */}
          <div className="text-center text-sm text-gray-600 mb-10 leading-relaxed">
            <p>위 금액을 기부금으로 영수하였음을 증명합니다.</p>
          </div>

          {/* footer */}
          <div className="text-center space-y-2">
            <p className="text-sm text-gray-600">{todayFormatted}</p>
            <div className="mt-6">
              <p className="text-lg font-bold text-gray-900">{churchName}</p>
              <p className="text-sm text-gray-600 mt-1">{churchRepresentative}</p>
            </div>
          </div>
        </div>
      )}

      {/* print styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          /* show only receipt area and its children */
          .bg-white.max-w-2xl,
          .bg-white.max-w-2xl * {
            visibility: visible;
          }
          .bg-white.max-w-2xl {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            margin: 20mm;
          }
        }
      `}</style>
    </div>
  );
}
