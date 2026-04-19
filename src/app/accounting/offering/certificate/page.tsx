"use client";

import { useEffect, useState } from "react";
import { useAccountPerms } from "@/lib/useAccountPerms";
import HelpButton from "@/components/HelpButton";

/* ───── types ───── */
interface CertificateData {
  id: number;
  name: string | null;
  residentNumber: string | null;
  address: string | null;
  groupName: string | null;
}

/* ───── helpers ───── */
/** 발급번호: YYYY-MM-NNN (연-월-관리번호 3자리) */
function fmtSerialNo(year: number, month: number, memberId: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(memberId).padStart(3, "0")}`;
}

/** "YYYY-MM-DD" → "2026. 1. 23." */
function fmtIssueDate(s: string): string {
  if (!s) return "";
  const p = s.split("-");
  if (p.length !== 3) return s;
  return `${p[0]}. ${Number(p[1])}. ${Number(p[2])}.`;
}

function todayKST(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ───── page ───── */
export default function CertificatePage() {
  const { hasMemberEdit, loading: permLoading } = useAccountPerms();
  const [memberSearch, setMemberSearch] = useState("");
  const [memberCandidates, setMemberCandidates] = useState<
    { id: number; name: string; groupName: string | null }[]
  >([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [selectedMemberName, setSelectedMemberName] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [data, setData] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // 발급일 (입력 override)
  const [issueDateStr, setIssueDateStr] = useState(() => todayKST());

  // 발행자 (입력 override). 기본값 placeholder 로 노출.
  const [issuerOverride, setIssuerOverride] = useState(
    "예수교장로회 한국 총공회\n동천교회 담임목사"
  );

  /* ---- member search (300ms debounce) ---- */
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

  /* ---- fetch member info ---- */
  useEffect(() => {
    if (!selectedMemberId) {
      setData(null);
      return;
    }
    setLoading(true);
    setErr("");
    fetch(`/api/accounting/offering/donor-info?memberId=${selectedMemberId}&reveal=1`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "정보 조회 실패");
        }
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e: unknown) => {
        setData(null);
        setErr(e instanceof Error ? e.message : "조회 오류");
      })
      .finally(() => setLoading(false));
  }, [selectedMemberId]);

  function handlePrint() {
    window.print();
  }

  if (permLoading) {
    return <div className="text-gray-400 text-center py-12">권한 확인 중...</div>;
  }
  if (!hasMemberEdit) {
    return (
      <div className="max-w-lg mx-auto mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-sm text-yellow-800">
          소속증명서 발급에는 <strong>관리번호 수정 권한(accMemberEditAccess)</strong> 이 필요합니다.
        </p>
        <p className="text-xs text-yellow-700 mt-2">관리자에게 문의하세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* controls — hidden on print */}
      <div className="print:hidden space-y-6">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">소속증명서 <span className="print:hidden"><HelpButton slug="offering-certificate" /></span></h1>

        <div className="bg-white rounded-lg shadow-sm border-t-4 border-teal-500 p-4 md:p-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">발급일</label>
              <input
                type="date"
                value={issueDateStr}
                onChange={(e) => setIssueDateStr(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 w-40"
              />
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
                    setData(null);
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
            {data && (
              <button
                type="button"
                onClick={handlePrint}
                className="px-5 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors ml-auto"
              >
                인쇄
              </button>
            )}
          </div>

          {data && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                발행자 (출력 표시)
              </label>
              <textarea
                value={issuerOverride}
                onChange={(e) => setIssuerOverride(e.target.value)}
                rows={2}
                placeholder={"예수교장로회 한국 총공회\n동천교회 담임목사 ○○○"}
                className="w-full md:w-[500px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                줄바꿈으로 두 줄 표시. 예: 첫 줄 단체명, 둘째 줄 직함·성명.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* print / preview area */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 print:hidden">로딩 중...</div>
      ) : err ? (
        <div className="text-center py-8 text-red-600 print:hidden">{err}</div>
      ) : !data ? (
        <div className="text-center py-8 text-gray-400 print:hidden">
          회원을 선택하면 증명서가 표시됩니다.
        </div>
      ) : (
        <CertificateForm data={data} issueDateStr={issueDateStr} issuer={issuerOverride} />
      )}

      {(!data?.residentNumber || !data?.address) && data && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 print:hidden">
          {!data?.residentNumber && "주민등록번호"}
          {!data?.residentNumber && !data?.address && " / "}
          {!data?.address && "주소"}
          {" "}가 등록되어 있지 않습니다. <strong>기부자 정보</strong> 메뉴에서 먼저 등록해 주세요.
        </p>
      )}

      {/* print styles (기부금영수증 과 격리) */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #cert-print,
          #cert-print * {
            visibility: visible;
          }
          #cert-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            size: A4 portrait;
            margin: 25mm 20mm;
          }
        }
      `}</style>
    </div>
  );
}

/* ========================================================================
 * 소속증명서 출력 폼 (이미지 서식 모방)
 * ======================================================================== */
function CertificateForm({
  data,
  issueDateStr,
  issuer,
}: {
  data: CertificateData;
  issueDateStr: string;
  issuer: string;
}) {
  // 발급번호: 입력된 발급일의 연/월 + 관리번호
  const [y, m] = issueDateStr.split("-").map(Number);
  const serialNo = fmtSerialNo(y || new Date().getFullYear(), m || 1, data.id);

  return (
    <div
      id="cert-print"
      className="bg-white mx-auto text-black print:shadow-none print:max-w-none"
      style={{
        maxWidth: "210mm",
        minHeight: "297mm",
        padding: "30mm 25mm",
        border: "1px solid #ccc",
        fontFamily: "'Malgun Gothic', 'Nanum Gothic', 'Noto Sans KR', sans-serif",
        lineHeight: 1.8,
      }}
    >
      {/* 발급번호 */}
      <div className="text-[13px] mb-16">
        발급번호 : <span className="font-mono">{serialNo}</span>
      </div>

      {/* 타이틀 */}
      <h1
        className="text-center font-bold"
        style={{
          fontSize: "32px",
          letterSpacing: "0.6em",
          paddingLeft: "0.6em",
          marginBottom: "50px",
        }}
      >
        소속증명서
      </h1>

      {/* 필드 3개 */}
      <div className="text-[14px] space-y-6 mb-16">
        <div className="flex items-start">
          <span className="inline-block w-[140px] shrink-0">
            1. 이&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;름 :
          </span>
          <span>{data.name || ""}</span>
        </div>
        <div className="flex items-start">
          <span className="inline-block w-[140px] shrink-0">2. 주민번호 :</span>
          <span className="font-mono">{data.residentNumber || ""}</span>
        </div>
        <div className="flex items-start">
          <span className="inline-block w-[140px] shrink-0">
            3. 주&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;소 :
          </span>
          <span>{data.address || ""}</span>
        </div>
      </div>

      {/* 본문 증명 문구 */}
      <p className="text-[14px] mb-20 leading-8">
        상기인은 본 예수교장로회 한국총공회 동천교회에 소속된 교인임을 증명합니다.
      </p>

      {/* 발급일 + 발행자 (중앙 정렬, 직인 영역) */}
      <div className="text-center text-[14px] leading-9">
        <p className="mb-4">{fmtIssueDate(issueDateStr)}</p>
        {issuer.split("\n").map((line, i, arr) => (
          <p key={i} className={i === arr.length - 1 ? "inline-block" : ""}>
            {line}
            {i === arr.length - 1 && (
              <span className="ml-3 align-middle">(인)</span>
            )}
          </p>
        ))}
      </div>
    </div>
  );
}
