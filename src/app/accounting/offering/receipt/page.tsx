"use client";

import { useEffect, useState } from "react";
import { useAccountPerms } from "@/lib/useAccountPerms";

/* ───── types ───── */
interface ReceiptEntry {
  date: string;             // YYYY-MM-DD
  memberName: string;
  offeringType: string;
  amount: number;
  description: string | null;
}
interface ReceiptData {
  memberId: number;          // 가족 대표(head)의 id
  memberName: string;        // 대표자 이름
  groupName: string | null;
  year: number;
  items: Record<string, number>;
  total: number;
  selectedMemberId?: number; // 사용자가 선택한 구성원 (head와 다르면 rollup 안내)
  familyMembers?: { id: number; name: string }[];
  church?: {
    name: string;
    regNo: string;          // 고유번호/사업자등록번호
    address: string;
    repName: string;
    repTitle: string;
    donationCode: string;   // 기부금 구분 (종교단체=41)
  };
  donor?: {
    residentNumber: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  entries?: ReceiptEntry[];
}

/** 날짜 문자열을 "25년 1월 26일" 형식으로 변환 */
function fmtKorDate(s: string): string {
  if (!s) return "";
  const d = s.split("-");
  if (d.length !== 3) return s;
  return `${Number(d[0]) % 100}년 ${Number(d[1])}월 ${Number(d[2])}일`;
}

/** 오늘 날짜를 "2026 년 1 월 23 일" 형식으로 */
function fmtIssueDate(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()} 년 ${d.getMonth() + 1} 월 ${d.getDate()} 일`;
}

/** 일련번호: YY-MMMM (연도 2자리 - memberId 4자리) */
function fmtSerialNo(year: number, memberId: number): string {
  return `${year % 100}-${String(memberId).padStart(3, "0")}`;
}

/** 유형별 적요 자동 생성 (엔트리들의 offeringType 집합) */
function summaryOfEntries(entries: ReceiptEntry[]): string {
  const types = Array.from(new Set(entries.map((e) => e.offeringType)));
  return types.join(", ");
}

/** 해당 연·월의 마지막 일요일 날짜 (YYYY-MM-DD) */
function lastSundayOfMonth(year: number, month1: number): string {
  // month1 은 1~12. 마지막 일(day) 을 구한 뒤 해당 요일을 빼서 가장 가까운 이전(또는 당일) 일요일
  const lastDay = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const dow = new Date(Date.UTC(year, month1 - 1, lastDay)).getUTCDay(); // 0=일
  const lastSun = lastDay - dow;
  return `${year}-${String(month1).padStart(2, "0")}-${String(lastSun).padStart(2, "0")}`;
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

  // 기부금 수령인 override (출력 시 "동천교회 담임목사 ○○○" 부분 대체)
  const [receivedByOverride, setReceivedByOverride] = useState("");
  // 발행일 (신청인/수령인 위에 표시되는 날짜). 기본값: 오늘 (KST)
  const [issueDateStr, setIssueDateStr] = useState(() => {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

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

          {/* 영수증 출력 추가 옵션 */}
          {receipt && (
            <div className="mt-4 pt-3 border-t border-gray-200 space-y-3">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    발행일
                  </label>
                  <input
                    type="date"
                    value={issueDateStr}
                    onChange={(e) => setIssueDateStr(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div className="flex-1 min-w-[260px]">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    기부금 수령인 (출력 표시명)
                  </label>
                  <input
                    type="text"
                    value={receivedByOverride}
                    onChange={(e) => setReceivedByOverride(e.target.value)}
                    placeholder={`${receipt.church?.name || churchName}  ${receipt.church?.repTitle || churchRepresentative}  ${receipt.church?.repName || ""}`.trim()}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-400">
                발행일은 신청인/수령인 서명란 위에 함께 표시됩니다. 수령인 란을 비우면 단체명+대표자 직함·성명으로 인쇄됩니다.
              </p>
            </div>
          )}
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
        <ReceiptForm
          receipt={receipt}
          hasMemberEdit={hasMemberEdit}
          churchFallbackName={churchName}
          churchFallbackTitle={churchRepresentative}
          receivedByOverride={receivedByOverride}
          issueDateStr={issueDateStr}
        />
      )}

      {/* print styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #receipt-print,
          #receipt-print * {
            visibility: visible;
          }
          #receipt-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
        }
      `}</style>
    </div>
  );
}

/* ========================================================================
 * 국세청 서식 29호 기부금 영수증
 * ======================================================================== */
function ReceiptForm({
  receipt,
  hasMemberEdit,
  churchFallbackName,
  churchFallbackTitle,
  receivedByOverride,
  issueDateStr,
}: {
  receipt: ReceiptData;
  hasMemberEdit: boolean;
  churchFallbackName: string;
  churchFallbackTitle: string;
  receivedByOverride?: string;
  issueDateStr?: string;
}) {
  /** "YYYY-MM-DD" → "2026 년 4 월 18 일" */
  function fmtIssue(s?: string): string {
    if (!s) return fmtIssueDate();
    const parts = s.split("-");
    if (parts.length !== 3) return fmtIssueDate();
    return `${parts[0]} 년 ${Number(parts[1])} 월 ${Number(parts[2])} 일`;
  }
  const issueDateLabel = fmtIssue(issueDateStr);
  const entries = receipt.entries || [];

  // 월별 합계 행 생성.
  //   - 금액: 해당 월 모든 offering 의 합계
  //   - 적요: "십일조, 일반헌금" 고정 문구 (영수증 서식 관례)
  //   - 년월일: 해당 월의 마지막 일요일 (연보가 드려지는 요일 기준)
  const byMonth = new Map<string, number>(); // YYYY-MM → 금액 합계
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) || 0) + e.amount);
  }
  const monthRows = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, amount]) => {
      const [y, m] = ym.split("-").map(Number);
      return {
        date: lastSundayOfMonth(y, m),
        summary: "십일조, 일반헌금",
        amount,
      };
    });

  const church = receipt.church;
  const donationCode = church?.donationCode || "41";
  const isReligion = donationCode === "41";
  const donationTypeLabel = isReligion
    ? "종교단체기부금"
    : donationCode === "10"
    ? "법정기부금"
    : donationCode === "30"
    ? "조특법 제73조 기부금"
    : donationCode === "40"
    ? "지정기부금"
    : donationCode === "42"
    ? "우리사주조합기부금"
    : "기타기부금";

  // 메시지에 사용할 법적 근거
  const legalRef = isReligion
    ? "소득세법 제34조, 조세특례제한법 제73조 및 동법 제88조의 4의 규정에 의한 기부금을"
    : "소득세법 및 조세특례제한법에 의한 기부금을";

  return (
    <div
      id="receipt-print"
      className="bg-white mx-auto text-[12px] leading-relaxed text-black print:shadow-none print:border-0 print:max-w-none"
      style={{
        maxWidth: "210mm",
        padding: "10mm",
        border: "1px solid #222",
        fontFamily: "'Malgun Gothic', 'Nanum Gothic', sans-serif",
      }}
    >
      {/* 선택한 구성원이 가족 대표가 아니면 rollup 안내 (인쇄 시 숨김) */}
      {receipt.selectedMemberId && receipt.selectedMemberId !== receipt.memberId && (
        <div className="mb-3 px-3 py-2 text-xs bg-teal-50 text-teal-700 rounded print:hidden">
          선택한 구성원이 포함된 <strong>가족 대표({receipt.memberName})</strong> 명의로 가족 전원의 연보가 합산되어 발급됩니다.
        </div>
      )}

      {/* 상단: 일련번호 + 타이틀 */}
      <div className="flex items-center justify-between mb-2">
        <div className="border border-black px-3 py-1 text-[11px] flex items-center gap-2">
          <span className="bg-black text-white px-2 py-0.5 text-[11px]">일련번호</span>
          <span className="font-mono">{fmtSerialNo(receipt.year, receipt.memberId)}</span>
        </div>
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold tracking-[0.5em] ml-14">기부금 영수증</h1>
        </div>
        <div className="w-36" />
      </div>

      {/* 1. 기부자 */}
      <section className="mb-2">
        <div className="text-[12px] font-bold mb-1">1. 기부자</div>
        <table className="w-full border-collapse border border-black text-[12px]">
          <tbody>
            <tr>
              <td className="border border-black bg-gray-100 px-2 py-1 text-center w-20 font-medium">성&nbsp;명</td>
              <td className="border border-black px-2 py-1">
                {hasMemberEdit ? receipt.memberName : "*".repeat(3)}
              </td>
              <td className="border border-black bg-gray-100 px-2 py-1 text-center w-36 font-medium">
                주민등록번호<br />(사업자등록번호)
              </td>
              <td className="border border-black px-2 py-1 font-mono">
                {receipt.donor?.residentNumber || ""}
              </td>
            </tr>
            <tr>
              <td className="border border-black bg-gray-100 px-2 py-1 text-center font-medium">주&nbsp;소</td>
              <td className="border border-black px-2 py-1" colSpan={3}>
                {receipt.donor?.address || ""}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 2. 기부금 단체 */}
      <section className="mb-2">
        <div className="text-[12px] font-bold mb-1">2. 기부금 단체</div>
        <table className="w-full border-collapse border border-black text-[12px]">
          <tbody>
            <tr>
              <td className="border border-black bg-gray-100 px-2 py-1 text-center w-20 font-medium">단체명</td>
              <td className="border border-black px-2 py-1">{church?.name || churchFallbackName}</td>
              <td className="border border-black bg-gray-100 px-2 py-1 text-center w-36 font-medium">
                주민등록번호<br />(사업자등록번호)
              </td>
              <td className="border border-black px-2 py-1 font-mono">{church?.regNo || ""}</td>
            </tr>
            <tr>
              <td className="border border-black bg-gray-100 px-2 py-1 text-center font-medium">소재지</td>
              <td className="border border-black px-2 py-1" colSpan={3}>{church?.address || ""}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 3. 기부금 모집처 (선택) */}
      <section className="mb-2">
        <div className="text-[12px] font-bold mb-1">3. 기부금 모집처 (언론기관 등)</div>
        <table className="w-full border-collapse border border-black text-[12px]">
          <tbody>
            <tr>
              <td className="border border-black bg-gray-100 px-2 py-1 text-center w-20 font-medium">단체명</td>
              <td className="border border-black px-2 py-1">&nbsp;</td>
              <td className="border border-black bg-gray-100 px-2 py-1 text-center w-36 font-medium">사업자등록번호</td>
              <td className="border border-black px-2 py-1">&nbsp;</td>
            </tr>
            <tr>
              <td className="border border-black bg-gray-100 px-2 py-1 text-center font-medium">소재지</td>
              <td className="border border-black px-2 py-1" colSpan={3}>&nbsp;</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 4. 기부내용 */}
      <section className="mb-2">
        <div className="text-right text-[12px] font-bold mb-1">4. 기부내용</div>
        <table className="w-full border-collapse border border-black text-[12px]">
          <thead>
            <tr>
              <th className="border border-black bg-gray-100 px-2 py-1 w-36">유형</th>
              <th className="border border-black bg-gray-100 px-2 py-1 w-14">코드</th>
              <th className="border border-black bg-gray-100 px-2 py-1 w-32">년월일</th>
              <th className="border border-black bg-gray-100 px-2 py-1">적요</th>
              <th className="border border-black bg-gray-100 px-2 py-1 w-32">금액</th>
            </tr>
          </thead>
          <tbody>
            {monthRows.length > 0 ? (
              monthRows.map((r, i) => (
                <tr key={i}>
                  <td className="border border-black px-2 py-1 text-center">{donationTypeLabel}</td>
                  <td className="border border-black px-2 py-1 text-center">{donationCode}</td>
                  <td className="border border-black px-2 py-1 text-center">{fmtKorDate(r.date)}</td>
                  <td className="border border-black px-2 py-1">{r.summary}</td>
                  <td className="border border-black px-2 py-1 text-right font-mono">{fmtAmount(r.amount)}</td>
                </tr>
              ))
            ) : (
              // entries 가 없으면 유형별 합계로 한 줄
              <tr>
                <td className="border border-black px-2 py-1 text-center">{donationTypeLabel}</td>
                <td className="border border-black px-2 py-1 text-center">{donationCode}</td>
                <td className="border border-black px-2 py-1 text-center">{receipt.year}년</td>
                <td className="border border-black px-2 py-1">{summaryOfEntries([])}</td>
                <td className="border border-black px-2 py-1 text-right font-mono">{fmtAmount(receipt.total)}</td>
              </tr>
            )}
            {/* 빈 행 (디자인 안정감) */}
            {monthRows.length > 0 && monthRows.length < 12 &&
              Array.from({ length: Math.max(0, 3 - (12 - monthRows.length < 0 ? 0 : 3)) }).map((_, i) => (
                <tr key={`empty-${i}`}>
                  <td className="border border-black px-2 py-3">&nbsp;</td>
                  <td className="border border-black px-2 py-3">&nbsp;</td>
                  <td className="border border-black px-2 py-3">&nbsp;</td>
                  <td className="border border-black px-2 py-3">&nbsp;</td>
                  <td className="border border-black px-2 py-3">&nbsp;</td>
                </tr>
              ))}
            <tr>
              <td className="border border-black bg-gray-100 px-2 py-1 text-center font-bold" colSpan={4}>계</td>
              <td className="border border-black px-2 py-1 text-right font-mono font-bold">{fmtAmount(receipt.total)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 법정 문구 + 증명 */}
      <p className="text-[12px] mt-3 mb-1 leading-6">
        {legalRef}<br />
        위와 같이 기부하였음을 증명하여 주시기 바랍니다.
      </p>
      <div className="flex justify-end items-center gap-2 my-2">
        <span className="text-[12px]">{issueDateLabel}</span>
      </div>
      <div className="flex justify-end items-center gap-2 mb-4">
        <span className="text-[12px]">신청인</span>
        <span className="text-[13px] font-bold text-center border-b border-black px-2 whitespace-nowrap">
          {hasMemberEdit ? receipt.memberName : ""}
        </span>
        <span className="text-[12px]">(인)</span>
      </div>

      <p className="text-[12px] mt-4 mb-1">위와 같이 기부금을 기부하였음을 증명합니다.</p>
      <div className="flex justify-end items-center gap-2 my-2">
        <span className="text-[12px]">{issueDateLabel}</span>
      </div>
      <div className="flex justify-end items-center gap-2 mb-2">
        <span className="text-[12px]">기부금 수령인</span>
        {receivedByOverride && receivedByOverride.trim() ? (
          // 사용자 입력 override: 한 줄로 그대로 표시 (내용 길이만큼만)
          <span className="text-[13px] font-bold text-center border-b border-black px-2 whitespace-nowrap">
            {receivedByOverride}
          </span>
        ) : (
          // 기본: 단체명 + 직함 + 대표자 성명 분리 표시
          <>
            <span className="text-[13px] font-bold text-center border-b border-black px-2 whitespace-nowrap">
              {church?.name || churchFallbackName}
            </span>
            <span className="text-[12px] whitespace-nowrap">
              {church?.repTitle || churchFallbackTitle}{" "}
              {church?.repName || ""}
            </span>
          </>
        )}
        <span className="text-[12px]">(인)</span>
      </div>

      {/* 하단 범례 */}
      <div className="mt-6 border-t border-black pt-2 text-[10px] leading-snug text-gray-800">
        <div className="font-medium mb-1">유형, 코드 :</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          <span>· 소득세법 제34조 제2항 기부금</span>
          <span>(법정기부금, 코드 10)</span>
          <span>· 조세특례제한법 제73조 기부금</span>
          <span>(조특법 73, 코드 30)</span>
          <span>· 소득세법 제34조 제1항 기부금</span>
          <span>(지정기부금, 코드 40)</span>
          <span>· 소득세법 제34조 제1항 기부금 중 종교단체 기부금</span>
          <span>(종교단체기부금, 코드 41)</span>
          <span>· 조세특례제한법 제88조의4 기부금</span>
          <span>(우리사주조합 기부금, 코드 42)</span>
          <span>· 기타기부금</span>
          <span></span>
        </div>
      </div>

      {/* 용지 규격 */}
      <div className="text-right text-[10px] text-gray-500 mt-2">
        210㎜ × 297㎜ (신문용지 54g/㎡)
      </div>

      {/* 기부자 정보 미등록 안내 (인쇄 시 숨김) */}
      {(!receipt.donor?.residentNumber || !receipt.donor?.address) && (
        <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 print:hidden">
          {!receipt.donor?.residentNumber && "주민등록번호"}
          {!receipt.donor?.residentNumber && !receipt.donor?.address && " / "}
          {!receipt.donor?.address && "주소"}
          {" "}가 등록되어 있지 않습니다. 연말정산 공제용으로 사용하려면
          <strong> 기부자 정보</strong> 메뉴에서 먼저 등록해 주세요.
        </p>
      )}
    </div>
  );
}
