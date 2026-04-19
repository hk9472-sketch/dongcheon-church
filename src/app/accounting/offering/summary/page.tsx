"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccountPerms } from "@/lib/useAccountPerms";
import HelpButton from "@/components/HelpButton";

/* ───── constants ───── */
const OFFERING_TYPES = ["주일연보", "감사", "특별", "절기", "오일"] as const;

/* ───── types ───── */
interface MemberSummaryRow {
  memberId: number;
  memberName: string;
  groupName: string | null;
  주일연보: number;
  감사: number;
  특별: number;
  절기: number;
  오일: number;
  total: number;
}

interface DateSummaryRow {
  date: string;
  주일연보: number;
  감사: number;
  특별: number;
  절기: number;
  오일: number;
  total: number;
}

interface MonthSummaryRow {
  month: number;
  주일연보: number;
  감사: number;
  특별: number;
  절기: number;
  오일: number;
  total: number;
}

interface PeriodSummary {
  주일연보: number;
  감사: number;
  특별: number;
  절기: number;
  오일: number;
  total: number;
}

/* ───── helpers ───── */
function fmtAmount(n: number): string {
  return n.toLocaleString("ko-KR");
}

function todayKST(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstDayOfMonth(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function currentYear(): number {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })).getFullYear();
}

type ViewTab = "member" | "date" | "month" | "period";

/* ───── component ───── */
export default function OfferingSummaryPage() {
  const { hasMemberEdit } = useAccountPerms();
  const [viewTab, setViewTab] = useState<ViewTab>("member");
  const [loading, setLoading] = useState(false);

  // member tab
  const [memberFrom, setMemberFrom] = useState(firstDayOfMonth());
  const [memberTo, setMemberTo] = useState(todayKST());
  const [memberRows, setMemberRows] = useState<MemberSummaryRow[]>([]);

  // date tab
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(todayKST());
  const [dateRows, setDateRows] = useState<DateSummaryRow[]>([]);

  // month tab
  const [monthYear, setMonthYear] = useState(currentYear());
  const [monthRows, setMonthRows] = useState<MonthSummaryRow[]>([]);

  // period tab
  const [periodFrom, setPeriodFrom] = useState(firstDayOfMonth());
  const [periodTo, setPeriodTo] = useState(todayKST());
  const [periodSummary, setPeriodSummary] = useState<PeriodSummary | null>(null);

  /* ---- tab → API reportType 매핑 ----
   * 페이지 내부 탭 이름과 API 스펙이 달라 어댑터 역할을 한다.
   *   member → individual
   *   date   → daily
   *   month  → monthly
   *   period → period
   */
  const TAB_TO_API: Record<ViewTab, "individual" | "daily" | "monthly" | "period"> = {
    member: "individual",
    date: "daily",
    month: "monthly",
    period: "period",
  };

  /* ---- byType 레코드 → OFFERING_TYPES 평면화 ---- */
  function flattenByType(byType: Record<string, number> | undefined): Record<(typeof OFFERING_TYPES)[number], number> {
    const out = { 주일연보: 0, 감사: 0, 특별: 0, 절기: 0, 오일: 0 };
    if (!byType) return out;
    for (const t of OFFERING_TYPES) {
      out[t] = byType[t] || 0;
    }
    return out;
  }

  /* ---- 에러 메시지 표시용 ---- */
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* ---- fetch report ---- */
  const fetchReport = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    const params = new URLSearchParams();
    params.set("reportType", TAB_TO_API[viewTab]);

    if (viewTab === "member") {
      params.set("dateFrom", memberFrom);
      params.set("dateTo", memberTo);
    } else if (viewTab === "date") {
      params.set("dateFrom", dateFrom);
      params.set("dateTo", dateTo);
    } else if (viewTab === "month") {
      params.set("year", String(monthYear));
    } else {
      params.set("dateFrom", periodFrom);
      params.set("dateTo", periodTo);
    }

    fetch(`/api/accounting/offering/report?${params}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error((d && (d.error as string)) || `오류 (${r.status})`);
        }
        return d;
      })
      .then((d) => {
        if (viewTab === "member") {
          /* API shape: { data: [{ member:{id,name,groupName}, byType:{종류:금액}, total }] } */
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const arr: any[] = Array.isArray(d?.data) ? d.data : [];
          const rows: MemberSummaryRow[] = arr.map((g) => ({
            memberId: g.member?.id ?? 0,
            memberName: g.member?.name ?? "",
            groupName: g.member?.groupName ?? null,
            ...flattenByType(g.byType),
            total: typeof g.total === "number" ? g.total : 0,
          }));
          setMemberRows(rows);
        } else if (viewTab === "date") {
          /* API shape: { data: [{ date, amount, count }] } — 유형별 세분 없음.
           * UI 는 유형별 컬럼을 기대하므로 합계만 "주일연보" 컬럼 대신 total 에 넣고
           * 유형별 컬럼은 0 으로 둔다. (일자별은 API 가 offeringType 별로 집계를 안 준다.)
           */
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const arr: any[] = Array.isArray(d?.data) ? d.data : [];
          const rows: DateSummaryRow[] = arr.map((e) => ({
            date: String(e.date ?? ""),
            주일연보: 0,
            감사: 0,
            특별: 0,
            절기: 0,
            오일: 0,
            total: typeof e.amount === "number" ? e.amount : 0,
          }));
          setDateRows(rows);
        } else if (viewTab === "month") {
          /* API shape: { data: [{ month:"YYYY-MM", byType, total }] } */
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const arr: any[] = Array.isArray(d?.data) ? d.data : [];
          const rows: MonthSummaryRow[] = arr.map((g) => {
            const mm = typeof g.month === "string" ? g.month.slice(5, 7) : "";
            return {
              month: Number(mm) || 0,
              ...flattenByType(g.byType),
              total: typeof g.total === "number" ? g.total : 0,
            };
          });
          // 월 오름차순 정렬
          rows.sort((a, b) => a.month - b.month);
          setMonthRows(rows);
        } else {
          /* period — API shape: { data: [{ member, offeringType, amount, count }] }
           * 전체 유형별 합계로 재집계 → PeriodSummary
           */
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const arr: any[] = Array.isArray(d?.data) ? d.data : [];
          const agg: PeriodSummary = { 주일연보: 0, 감사: 0, 특별: 0, 절기: 0, 오일: 0, total: 0 };
          for (const row of arr) {
            const t = row.offeringType as (typeof OFFERING_TYPES)[number];
            const amt = typeof row.amount === "number" ? row.amount : 0;
            if (t && t in agg) {
              agg[t] += amt;
            }
            agg.total += amt;
          }
          setPeriodSummary(agg);
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "조회 중 오류가 발생했습니다.";
        setErrorMsg(msg);
        if (viewTab === "member") setMemberRows([]);
        else if (viewTab === "date") setDateRows([]);
        else if (viewTab === "month") setMonthRows([]);
        else setPeriodSummary(null);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewTab, memberFrom, memberTo, dateFrom, dateTo, monthYear, periodFrom, periodTo]);

  /* ---- auto-fetch ---- */
  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  /* ---- subtotals ---- */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function sumColumn(rows: Record<string, any>[], col: string): number {
    return rows.reduce((s, r) => s + ((r[col] as number) || 0), 0);
  }

  const tabs: { key: ViewTab; label: string }[] = [
    { key: "member", label: "개인별" },
    { key: "date", label: "일자별" },
    { key: "month", label: "월별" },
    { key: "period", label: "기간별" },
  ];

  /* ======== render ======== */
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">연보집계 <HelpButton slug="offering-summary" /></h1>

      {/* view tabs */}
      <div className="flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setViewTab(t.key)}
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
      <div className="bg-white rounded-lg shadow-sm border-t-4 border-teal-500 p-4 md:p-6">
        {/* member tab */}
        {viewTab === "member" && (
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">시작일</label>
              <input type="date" value={memberFrom} onChange={(e) => setMemberFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">종료일</label>
              <input type="date" value={memberTo} onChange={(e) => setMemberTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
            </div>
            <button type="button" onClick={fetchReport}
              className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors">
              조회
            </button>
          </div>
        )}

        {/* date tab */}
        {viewTab === "date" && (
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">시작일</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">종료일</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
            </div>
            <button type="button" onClick={fetchReport}
              className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors">
              조회
            </button>
          </div>
        )}

        {/* month tab */}
        {viewTab === "month" && (
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">연도</label>
              <select value={monthYear} onChange={(e) => setMonthYear(Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 w-32">
                {Array.from({ length: 10 }, (_, i) => currentYear() - i).map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={fetchReport}
              className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors">
              조회
            </button>
          </div>
        )}

        {/* period tab */}
        {viewTab === "period" && (
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">시작일</label>
              <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">종료일</label>
              <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
            </div>
            <button type="button" onClick={fetchReport}
              className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors">
              조회
            </button>
          </div>
        )}
      </div>

      {/* error banner */}
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* results */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="px-4 py-8 text-center text-gray-400">로딩 중...</div>
        ) : (
          <>
            {/* ===== member summary ===== */}
            {viewTab === "member" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-teal-50 text-teal-800">
                      <th className="px-3 py-3 text-left font-medium w-16">번호</th>
                      {hasMemberEdit && <th className="px-3 py-3 text-left font-medium">성명</th>}
                      {OFFERING_TYPES.map((t) => (
                        <th key={t} className="px-3 py-3 text-right font-medium w-24">{t}</th>
                      ))}
                      <th className="px-3 py-3 text-right font-medium w-28">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                          조회된 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      memberRows.map((r) => (
                        <tr key={r.memberId} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-600">{r.memberId}</td>
                          {hasMemberEdit && <td className="px-3 py-2 text-gray-800 font-medium">{r.memberName}</td>}
                          {OFFERING_TYPES.map((t) => (
                            <td key={t} className="px-3 py-2 text-right text-blue-700">
                              {r[t] ? fmtAmount(r[t]) : "-"}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-bold text-blue-800">
                            {fmtAmount(r.total)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {memberRows.length > 0 && (
                    <tfoot>
                      <tr className="bg-teal-50 font-bold border-t-2 border-teal-200">
                        <td colSpan={2} className="px-3 py-2.5 text-right text-teal-800">소계</td>
                        {OFFERING_TYPES.map((t) => (
                          <td key={t} className="px-3 py-2.5 text-right text-blue-800">
                            {fmtAmount(sumColumn(memberRows, t))}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-right text-blue-900">
                          {fmtAmount(sumColumn(memberRows, "total"))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* ===== date summary ===== */}
            {viewTab === "date" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-teal-50 text-teal-800">
                      <th className="px-3 py-3 text-left font-medium">일자</th>
                      {OFFERING_TYPES.map((t) => (
                        <th key={t} className="px-3 py-3 text-right font-medium w-24">{t}</th>
                      ))}
                      <th className="px-3 py-3 text-right font-medium w-28">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dateRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                          조회된 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      dateRows.map((r) => (
                        <tr key={r.date} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-800">{r.date}</td>
                          {OFFERING_TYPES.map((t) => (
                            <td key={t} className="px-3 py-2 text-right text-blue-700">
                              {r[t] ? fmtAmount(r[t]) : "-"}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-bold text-blue-800">
                            {fmtAmount(r.total)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {dateRows.length > 0 && (
                    <tfoot>
                      <tr className="bg-teal-50 font-bold border-t-2 border-teal-200">
                        <td className="px-3 py-2.5 text-right text-teal-800">소계</td>
                        {OFFERING_TYPES.map((t) => (
                          <td key={t} className="px-3 py-2.5 text-right text-blue-800">
                            {fmtAmount(sumColumn(dateRows, t))}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-right text-blue-900">
                          {fmtAmount(sumColumn(dateRows, "total"))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* ===== month summary ===== */}
            {viewTab === "month" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-teal-50 text-teal-800">
                      <th className="px-3 py-3 text-left font-medium w-20">월</th>
                      {OFFERING_TYPES.map((t) => (
                        <th key={t} className="px-3 py-3 text-right font-medium w-24">{t}</th>
                      ))}
                      <th className="px-3 py-3 text-right font-medium w-28">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                          조회된 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      monthRows.map((r) => (
                        <tr key={r.month} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-800 font-medium">{r.month}월</td>
                          {OFFERING_TYPES.map((t) => (
                            <td key={t} className="px-3 py-2 text-right text-blue-700">
                              {r[t] ? fmtAmount(r[t]) : "-"}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-bold text-blue-800">
                            {fmtAmount(r.total)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {monthRows.length > 0 && (
                    <tfoot>
                      <tr className="bg-teal-50 font-bold border-t-2 border-teal-200">
                        <td className="px-3 py-2.5 text-right text-teal-800">연합계</td>
                        {OFFERING_TYPES.map((t) => (
                          <td key={t} className="px-3 py-2.5 text-right text-blue-800">
                            {fmtAmount(sumColumn(monthRows, t))}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-right text-blue-900">
                          {fmtAmount(sumColumn(monthRows, "total"))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* ===== period summary ===== */}
            {viewTab === "period" && (
              <div className="p-6">
                {!periodSummary ? (
                  <div className="text-center text-gray-400 py-8">조회된 데이터가 없습니다.</div>
                ) : (
                  <div className="max-w-md mx-auto">
                    <h3 className="text-base font-bold text-gray-800 mb-4 text-center">
                      {periodFrom} ~ {periodTo} 연보 합계
                    </h3>
                    <table className="w-full text-sm">
                      <tbody>
                        {OFFERING_TYPES.map((t) => (
                          <tr key={t} className="border-b border-gray-100">
                            <td className="px-4 py-3 text-gray-700 font-medium">{t}</td>
                            <td className="px-4 py-3 text-right text-blue-700 font-medium">
                              {fmtAmount(periodSummary[t] || 0)}원
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-teal-50 border-t-2 border-teal-200">
                          <td className="px-4 py-3 text-teal-800 font-bold">총합계</td>
                          <td className="px-4 py-3 text-right text-blue-900 font-bold text-base">
                            {fmtAmount(periodSummary.total || 0)}원
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
