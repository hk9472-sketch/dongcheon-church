"use client";

import { useCallback, useEffect, useState } from "react";

interface Line {
  label: string;
  code: string;
  amount: number;
  children?: { label: string; code: string; amount: number }[];
}
interface UnitReport {
  unitId: number;
  name: string;
  carryOver: number;
  income: number;
  expense: number;
  balance: number;
  incomeLines: Line[];
  expenseLines: Line[];
  funds: { fundId: number; name: string; kind: string; balance: number }[];
}
interface Report {
  year: number;
  dateTo: string;
  units: UnitReport[];
  total: { carryOver: number; income: number; expense: number; balance: number };
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 수입/지출 내역 표 한쪽 — 그룹(reportDetail)은 왼쪽 세로 라벨 + 하위 줄 */
function SideTable({ title, lines, total }: { title: string; lines: Line[]; total: number }) {
  return (
    <table className="w-full text-sm border border-gray-400 border-collapse">
      <thead>
        <tr className="bg-gray-100">
          <th className="border border-gray-400 px-2 py-1 font-medium" colSpan={2}>
            {title}
          </th>
          <th className="border border-gray-400 px-2 py-1 font-medium w-32">금 액</th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 && (
          <tr>
            <td colSpan={3} className="border border-gray-400 px-2 py-1 text-center text-gray-400">
              -
            </td>
          </tr>
        )}
        {lines.map((l) =>
          l.children && l.children.length > 0 ? (
            l.children.map((c, i) => (
              <tr key={`${l.code}-${c.code}`}>
                {i === 0 && (
                  <td
                    rowSpan={l.children!.length}
                    className="border border-gray-400 px-1 py-1 text-center align-middle w-10 text-xs [writing-mode:vertical-rl] tracking-widest"
                  >
                    {l.label}
                  </td>
                )}
                <td className="border border-gray-400 px-2 py-1 text-right">{c.label}</td>
                <td className="border border-gray-400 px-2 py-1 text-right font-mono">{fmt(c.amount)}</td>
              </tr>
            ))
          ) : (
            <tr key={l.code}>
              <td colSpan={2} className="border border-gray-400 px-2 py-1 text-right">
                {l.label}
              </td>
              <td className="border border-gray-400 px-2 py-1 text-right font-mono">{fmt(l.amount)}</td>
            </tr>
          ),
        )}
        <tr className="font-semibold bg-gray-50">
          <td colSpan={2} className="border border-gray-400 px-2 py-1 text-center">
            계
          </td>
          <td className="border border-gray-400 px-2 py-1 text-right font-mono">{fmt(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function AnnualReportPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ year: String(year) });
      if (dateTo) qs.set("dateTo", dateTo);
      const res = await fetch(`/api/accounting/report/annual?${qs}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "조회 실패");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const yearEnd = `${year}-12-31`;
  const partial = data && data.dateTo !== yearEnd;
  const md = data ? `${Number(data.dateTo.slice(5, 7))}월 ${Number(data.dateTo.slice(8, 10))}일` : "";

  return (
    <div>
      <div className="print:hidden bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap items-end gap-4">
        <h1 className="text-xl font-bold text-gray-800 mr-4">연간 결산서</h1>
        <div>
          <label className="block text-xs text-gray-500 mb-1">회계년도</label>
          <select
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setDateTo("");
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {Array.from({ length: 6 }, (_, i) => thisYear - i).map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">기준일 (비우면 연말)</label>
          <input
            type="date"
            value={dateTo}
            min={`${year}-01-01`}
            max={yearEnd}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <button onClick={() => window.print()} className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700">
          인쇄
        </button>
        <p className="w-full text-xs text-gray-400">
          결산서 줄은 계정과목의 최상위 계정 단위입니다. 표기명·하위 펼침은 설정 → 계정과목에서 바꿀 수 있습니다.
        </p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
      {loading && <div className="py-12 text-center text-gray-400">불러오는 중...</div>}

      {data && !loading && (
        <div className="bg-white p-6 md:p-10 rounded-lg shadow-sm border border-gray-200 print:shadow-none print:border-0 print:p-0 space-y-10">
          <h2 className="text-center text-2xl font-bold tracking-wide">
            - {data.year}년도 회계결산 -
            {partial && <span className="block text-sm font-normal text-gray-500 mt-1">({md} 현재)</span>}
          </h2>

          {/* 교회 전체 회계 */}
          <section>
            <h3 className="text-lg font-bold underline underline-offset-4 mb-3">교회 전체 회계</h3>
            <div className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm w-fit ml-6 mb-4">
              <span>{data.year - 1}년 이월금</span>
              <span className="text-right font-mono">{fmt(data.total.carryOver)}</span>
              <span>{data.year}년 총수입</span>
              <span className="text-right font-mono">{fmt(data.total.income)}</span>
              <span className="font-semibold">총계</span>
              <span className="text-right font-mono font-semibold">{fmt(data.total.carryOver + data.total.income)}</span>
              <span>총지출</span>
              <span className="text-right font-mono">{fmt(data.total.expense)}</span>
              <span className="font-semibold">잔액</span>
              <span className="text-right font-mono font-semibold">{fmt(data.total.balance)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-400 border-collapse min-w-[640px]">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-400 px-2 py-1" />
                    {data.units.map((u) => (
                      <th key={u.unitId} className="border border-gray-400 px-2 py-1 font-medium">
                        {u.name}
                      </th>
                    ))}
                    <th className="border border-gray-400 px-2 py-1 font-medium">계</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["전년이월", "carryOver"],
                      ["총수입", "income"],
                      ["총지출", "expense"],
                      ["잔액", "balance"],
                    ] as const
                  ).map(([label, key]) => (
                    <tr key={key} className={key === "balance" ? "font-semibold" : ""}>
                      <td className="border border-gray-400 px-2 py-1 text-center bg-gray-50">{label}</td>
                      {data.units.map((u) => (
                        <td key={u.unitId} className="border border-gray-400 px-2 py-1 text-right font-mono">
                          {fmt(u[key])}
                        </td>
                      ))}
                      <td className="border border-gray-400 px-2 py-1 text-right font-mono">{fmt(data.total[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {data.units.map((u, idx) => (
            <section key={u.unitId} className="break-inside-avoid">
              <h3 className="text-lg font-bold underline underline-offset-4 mb-3">
                {idx + 1}. {u.name}
              </h3>
              <div className="flex flex-wrap justify-between gap-4 text-sm mb-3">
                <div className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 w-fit ml-6">
                  <span>{data.year - 1}년 이월금</span>
                  <span className="text-right font-mono">{fmt(u.carryOver)}</span>
                  <span>{data.year}년 총수입</span>
                  <span className="text-right font-mono">{fmt(u.income)}</span>
                  <span className="font-semibold">총계</span>
                  <span className="text-right font-mono font-semibold">{fmt(u.carryOver + u.income)}</span>
                </div>
                <div className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 w-fit self-end">
                  <span>총지출</span>
                  <span className="text-right font-mono">{fmt(u.expense)}</span>
                  <span className="font-semibold">잔액</span>
                  <span className="text-right font-mono font-semibold">{fmt(u.balance)}</span>
                </div>
              </div>
              <div className="text-sm font-medium mb-1">수입지출 내역</div>
              <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-0 md:gap-0">
                <SideTable title="수 입 내 역" lines={u.incomeLines} total={u.income} />
                <SideTable title="지 출 내 역" lines={u.expenseLines} total={u.expense} />
              </div>
              {u.funds.length > 0 && (
                <div className="mt-2 text-xs text-gray-600">
                  통장별 잔액:{" "}
                  {u.funds.map((f, i) => (
                    <span key={f.fundId}>
                      {i > 0 && " · "}
                      {f.name} {fmt(f.balance)}
                    </span>
                  ))}
                  {u.funds.reduce((s, f) => s + f.balance, 0) !== u.balance && (
                    <span className="ml-2 text-red-600 print:hidden">
                      (통장 합계와 잔액 불일치 — 통장별 연초잔액 확인 필요)
                    </span>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
