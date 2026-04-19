"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccountPerms } from "@/lib/useAccountPerms";
import HelpButton from "@/components/HelpButton";

/* ───── constants ───── */
const OFFERING_TYPES = ["주일연보", "감사", "특별", "절기", "오일"] as const;

/* ───── types ───── */
interface EntryItem {
  id: number;
  date: string;
  memberId: number;
  member: { id: number; name: string; groupName: string | null };
  offeringType: string;
  amount: number;
  description: string | null;
}

/* ───── helpers ───── */
function todayKST(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmtAmount(n: number): string {
  return n.toLocaleString("ko-KR");
}

function firstDayOfMonth(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

type ViewTab = "member" | "date" | "period";

/* ───── component ───── */
export default function OfferingListPage() {
  const { hasMemberEdit } = useAccountPerms();
  const [viewTab, setViewTab] = useState<ViewTab>("member");
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [loading, setLoading] = useState(false);

  // member tab
  const [memberSearch, setMemberSearch] = useState("");
  const [memberCandidates, setMemberCandidates] = useState<{ id: number; name: string }[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [selectedMemberName, setSelectedMemberName] = useState("");
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [memberDateFrom, setMemberDateFrom] = useState(firstDayOfMonth());
  const [memberDateTo, setMemberDateTo] = useState(todayKST());

  // date tab
  const [selectedDate, setSelectedDate] = useState(todayKST());

  // period tab
  const [periodFrom, setPeriodFrom] = useState(firstDayOfMonth());
  const [periodTo, setPeriodTo] = useState(todayKST());
  const [periodType, setPeriodType] = useState("");

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
            setMemberCandidates(d.map((m: { id: number; name: string }) => ({ id: m.id, name: m.name })));
          }
        })
        .catch(() => setMemberCandidates([]));
    }, 300);
    return () => clearTimeout(t);
  }, [memberSearch]);

  /* ---- fetch entries ---- */
  const fetchEntries = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();

    if (viewTab === "member") {
      if (!selectedMemberId) {
        setEntries([]);
        setLoading(false);
        return;
      }
      params.set("memberId", String(selectedMemberId));
      params.set("dateFrom", memberDateFrom);
      params.set("dateTo", memberDateTo);
    } else if (viewTab === "date") {
      params.set("date", selectedDate);
    } else {
      params.set("dateFrom", periodFrom);
      params.set("dateTo", periodTo);
      if (periodType) params.set("offeringType", periodType);
    }

    fetch(`/api/accounting/offering/entries?${params}`)
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : d.entries || [];
        setEntries(list);
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [viewTab, selectedMemberId, memberDateFrom, memberDateTo, selectedDate, periodFrom, periodTo, periodType]);

  /* ---- auto-fetch when params change ---- */
  useEffect(() => {
    if (viewTab === "member" && !selectedMemberId) return;
    fetchEntries();
  }, [fetchEntries, viewTab, selectedMemberId]);

  /* ---- total ---- */
  const total = entries.reduce((s, e) => s + e.amount, 0);

  /* ---- grouped by offering type (for date tab) ---- */
  function groupByType(items: EntryItem[]) {
    const groups: Record<string, EntryItem[]> = {};
    for (const item of items) {
      if (!groups[item.offeringType]) groups[item.offeringType] = [];
      groups[item.offeringType].push(item);
    }
    return groups;
  }

  const tabs: { key: ViewTab; label: string }[] = [
    { key: "member", label: "개인별" },
    { key: "date", label: "일자별" },
    { key: "period", label: "기간별" },
  ];

  /* ======== render ======== */
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">연보내역 <HelpButton slug="offering-list" /></h1>

      {/* view tabs */}
      <div className="flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setViewTab(t.key);
              setEntries([]);
            }}
            className={`px-5 py-2.5 rounded-t-lg text-sm font-semibold transition-colors ${
              viewTab === t.key
                ? "bg-teal-600 text-white"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* filter card */}
      <div className="bg-white rounded-lg shadow-sm border-t-4 border-teal-500 p-4 md:p-6 space-y-4">
        {/* member tab filters */}
        {viewTab === "member" && (
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">회원 검색</label>
              <input
                type="text"
                value={selectedMemberId ? `${selectedMemberId} - ${selectedMemberName}` : memberSearch}
                onChange={(e) => {
                  setMemberSearch(e.target.value);
                  setSelectedMemberId(null);
                  setSelectedMemberName("");
                  setShowMemberDropdown(true);
                }}
                onFocus={() => setShowMemberDropdown(true)}
                placeholder="이름으로 검색"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 w-52"
              />
              {selectedMemberId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMemberId(null);
                    setSelectedMemberName("");
                    setMemberSearch("");
                    setEntries([]);
                  }}
                  className="absolute right-2 top-7 text-gray-400 hover:text-red-500 text-lg leading-none"
                >
                  &times;
                </button>
              )}
              {showMemberDropdown && memberCandidates.length > 0 && !selectedMemberId && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {memberCandidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedMemberId(c.id);
                        setSelectedMemberName(c.name);
                        setShowMemberDropdown(false);
                        setMemberSearch("");
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 transition-colors"
                    >
                      <span className="text-teal-600 font-medium">{c.id}</span>
                      <span className="ml-2 text-gray-700">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">시작일</label>
              <input
                type="date"
                value={memberDateFrom}
                onChange={(e) => setMemberDateFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">종료일</label>
              <input
                type="date"
                value={memberDateTo}
                onChange={(e) => setMemberDateTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <button
              type="button"
              onClick={fetchEntries}
              className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors"
            >
              조회
            </button>
          </div>
        )}

        {/* date tab filters */}
        {viewTab === "date" && (
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">일자</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <button
              type="button"
              onClick={fetchEntries}
              className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors"
            >
              조회
            </button>
          </div>
        )}

        {/* period tab filters */}
        {viewTab === "period" && (
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">시작일</label>
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">종료일</label>
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">연보종류</label>
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 w-36"
              >
                <option value="">전체</option>
                {OFFERING_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={fetchEntries}
              className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors"
            >
              조회
            </button>
          </div>
        )}
      </div>

      {/* results table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="px-4 py-8 text-center text-gray-400">로딩 중...</div>
        ) : viewTab === "date" && entries.length > 0 ? (
          /* date tab: grouped by offering type */
          <div>
            {Object.entries(groupByType(entries)).map(([type, items]) => (
              <div key={type}>
                <div className="px-4 py-2 bg-teal-50 border-b border-teal-100">
                  <span className="text-sm font-bold text-teal-800">{type}</span>
                  <span className="ml-3 text-sm text-teal-600">
                    ({items.length}건, {fmtAmount(items.reduce((s, e) => s + e.amount, 0))}원)
                  </span>
                </div>
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="px-4 py-2 text-left font-medium w-28">일자</th>
                      <th className="px-4 py-2 text-left font-medium w-16">번호</th>
                      {hasMemberEdit && <th className="px-4 py-2 text-left font-medium">성명</th>}
                      <th className="px-4 py-2 text-left font-medium w-28">연보종류</th>
                      <th className="px-4 py-2 text-right font-medium w-32">금액</th>
                      <th className="px-4 py-2 text-left font-medium">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((e) => (
                      <tr key={e.id} className="border-t border-gray-100">
                        <td className="px-4 py-2 text-gray-600">
                          {typeof e.date === "string" ? e.date.slice(0, 10) : ""}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{e.memberId}</td>
                        {hasMemberEdit && <td className="px-4 py-2 text-gray-800">{e.member.name}</td>}
                        <td className="px-4 py-2 text-gray-400">—</td>
                        <td className="px-4 py-2 text-right text-blue-700 font-medium">{fmtAmount(e.amount)}</td>
                        <td className="px-4 py-2 text-gray-500">{e.description || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="px-4 py-3 bg-gray-50 border-t text-right">
              <span className="text-sm text-gray-600">총합계: </span>
              <span className="text-base font-bold text-blue-700">{fmtAmount(total)}원</span>
            </div>
          </div>
        ) : (
          /* member / period tab: flat list */
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-teal-50 text-teal-800">
                  <th className="px-4 py-3 text-left font-medium w-28">일자</th>
                  <th className="px-4 py-3 text-left font-medium w-16">번호</th>
                  {hasMemberEdit && <th className="px-4 py-3 text-left font-medium">성명</th>}
                  <th className="px-4 py-3 text-left font-medium w-28">연보종류</th>
                  <th className="px-4 py-3 text-right font-medium w-32">금액</th>
                  <th className="px-4 py-3 text-left font-medium">비고</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      {viewTab === "member" && !selectedMemberId
                        ? "회원을 선택하세요."
                        : "조회된 내역이 없습니다."}
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => (
                    <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-600">
                        {typeof e.date === "string" ? e.date.slice(0, 10) : ""}
                      </td>
                      <td className="px-4 py-2 text-gray-600">{e.memberId}</td>
                      {hasMemberEdit && <td className="px-4 py-2 text-gray-800">{e.member.name}</td>}
                      <td className="px-4 py-2 text-gray-600">{e.offeringType}</td>
                      <td className="px-4 py-2 text-right text-blue-700 font-medium">
                        {fmtAmount(e.amount)}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{e.description || ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {entries.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t">
                    <td colSpan={4} className="px-4 py-2.5 text-right text-gray-600">합계</td>
                    <td className="px-4 py-2.5 text-right text-blue-700">{fmtAmount(total)}원</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {entries.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 border-t">
            총 {entries.length}건
          </div>
        )}
      </div>
    </div>
  );
}
