"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface UnitStatus {
  unitId: number;
  name: string;
  opening: number | null;
  openingSource: string | null;
  income: number;
  expense: number;
  ending: number;
  funds: { fundId: number; name: string; opening: number; ending: number; isActive: boolean }[];
  closedMonths: number;
  closing: { closedAt: string; closedBy: string; closingAmount: number } | null;
  next: { amount: number; source: string } | null;
  nextClosed: boolean;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function YearClosingPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [units, setUnits] = useState<UnitStatus[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsAdmin(!!d.user && d.user.isAdmin <= 2))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/accounting/year-closing?year=${year}`);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "조회 실패");
    setUnits(d.units || []);
    setPicked(new Set());
  }, [year]);

  useEffect(() => {
    load().catch((e) => setMsg({ type: "err", text: e instanceof Error ? e.message : "조회 실패" }));
  }, [load]);

  const closable = units.filter((u) => !u.closing);
  const total = units.reduce(
    (a, u) => ({
      opening: a.opening + (u.opening ?? 0),
      income: a.income + u.income,
      expense: a.expense + u.expense,
      ending: a.ending + u.ending,
    }),
    { opening: 0, income: 0, expense: 0, ending: 0 },
  );

  async function doClose() {
    const ids = Array.from(picked);
    if (ids.length === 0) return;
    const names = units.filter((u) => picked.has(u.unitId)).map((u) => `· ${u.name}: 기말잔액 ${fmt(u.ending)}`);
    const overwrite = units.filter((u) => picked.has(u.unitId) && u.next && u.next.amount !== u.ending);
    const ok = confirm(
      `${year}년 연마감을 진행합니다.\n\n${names.join("\n")}\n\n` +
        `· 1~12월 전표·이체가 잠깁니다.\n· 통장별 기말잔액이 ${year + 1}년 이월금으로 생성됩니다.` +
        (overwrite.length
          ? `\n\n⚠ ${overwrite.map((u) => u.name).join(", ")} 은(는) ${year + 1}년 이월금이 이미 있어 기말잔액으로 덮어씁니다.`
          : "") +
        `\n\n계속할까요?`,
    );
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounting/year-closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, unitIds: ids }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "연마감 실패");
      const fails = (d.results || []).filter((r: { ok: boolean }) => !r.ok) as { error: string }[];
      const okCount = (d.results || []).length - fails.length;
      setMsg(
        fails.length
          ? { type: "err", text: `마감 ${okCount}건 완료, 실패 ${fails.length}건 — ${fails.map((f) => f.error).join(" / ")}` }
          : { type: "ok", text: `${year}년 연마감 완료 (${okCount}개 회계). ${year + 1}년 이월금이 생성되었습니다.` },
      );
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "연마감 실패" });
    } finally {
      setBusy(false);
    }
  }

  async function doCancel(u: UnitStatus) {
    if (
      !confirm(
        `${u.name} ${year}년 연마감을 취소할까요?\n\n· 1~12월 잠금이 풀립니다.\n· ${year + 1}년 이월금은 남아 있지만 잠금이 풀립니다.\n  (수정 후 다시 연마감하면 새로 생성됩니다)`,
      )
    )
      return;
    const res = await fetch(`/api/accounting/year-closing?year=${year}&unitId=${u.unitId}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ type: "err", text: d.error || "취소 실패" });
      return;
    }
    setMsg({ type: "ok", text: `${u.name} ${year}년 연마감을 취소했습니다.` });
    await load();
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-2">연마감</h1>
      <p className="text-sm text-gray-500 mb-6">
        한 해 장부를 마감하고 통장별 기말잔액을 다음 연도 이월금으로 넘깁니다. 마감한 연도는 전표·이체가 잠기며,
        다음 연도 이월금은{" "}
        <Link href="/accounting/settings/balance" className="text-teal-700 underline">
          연도별 이월금
        </Link>
        에서 확인할 수 있습니다.
      </p>

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">회계년도</label>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            {Array.from({ length: 8 }, (_, i) => thisYear - i).map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={doClose}
          disabled={busy || picked.size === 0}
          className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "마감 중..." : `선택 ${picked.size}개 연마감`}
        </button>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm whitespace-pre-line ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-indigo-50 text-indigo-900">
              <th className="px-3 py-2 w-10">
                <input
                  type="checkbox"
                  checked={closable.length > 0 && closable.every((u) => picked.has(u.unitId))}
                  onChange={(e) => setPicked(e.target.checked ? new Set(closable.map((u) => u.unitId)) : new Set())}
                />
              </th>
              <th className="px-3 py-2 text-left font-medium">회계</th>
              <th className="px-3 py-2 text-right font-medium">{year - 1}년 이월금</th>
              <th className="px-3 py-2 text-right font-medium">총수입</th>
              <th className="px-3 py-2 text-right font-medium">총지출</th>
              <th className="px-3 py-2 text-right font-medium">기말잔액</th>
              <th className="px-3 py-2 text-left font-medium">상태</th>
              <th className="px-3 py-2 text-right font-medium">{year + 1}년 이월금</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.unitId} className="border-t border-gray-200 align-top">
                <td className="px-3 py-2 text-center">
                  {!u.closing && (
                    <input
                      type="checkbox"
                      checked={picked.has(u.unitId)}
                      onChange={(e) =>
                        setPicked((p) => {
                          const n = new Set(p);
                          if (e.target.checked) n.add(u.unitId);
                          else n.delete(u.unitId);
                          return n;
                        })
                      }
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="font-semibold">{u.name}</div>
                  {u.funds.length > 0 && (
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                      {u.funds.map((f) => (
                        <div key={f.fundId}>
                          {f.name}: {fmt(f.opening)} → <strong className="text-gray-700">{fmt(f.ending)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {u.opening === null ? (
                    <Link href="/accounting/settings/balance" className="text-amber-600 underline text-xs">
                      미입력
                    </Link>
                  ) : (
                    fmt(u.opening)
                  )}
                </td>
                <td className="px-3 py-2 text-right text-blue-700">{fmt(u.income)}</td>
                <td className="px-3 py-2 text-right text-red-600">{fmt(u.expense)}</td>
                <td className="px-3 py-2 text-right font-semibold">{fmt(u.ending)}</td>
                <td className="px-3 py-2 text-xs">
                  {u.closing ? (
                    <div>
                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">마감</span>{" "}
                      {u.closing.closedAt.slice(0, 10)} {u.closing.closedBy}
                      {isAdmin && !u.nextClosed && (
                        <button onClick={() => doCancel(u)} className="ml-2 text-red-500 hover:underline">
                          마감취소
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-500">미마감 (월마감 {u.closedMonths}/12)</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-xs">
                  {u.next ? (
                    <>
                      {fmt(u.next.amount)}
                      <div className="text-gray-400">{u.next.source === "closing" ? "연마감 생성" : "직접 입력"}</div>
                      {!u.closing && u.next.amount !== u.ending && (
                        <div className="text-amber-600">기말잔액과 다름</div>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400">없음</span>
                  )}
                </td>
              </tr>
            ))}
            {units.length > 0 && (
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                <td />
                <td className="px-3 py-2">교회 전체</td>
                <td className="px-3 py-2 text-right">{fmt(total.opening)}</td>
                <td className="px-3 py-2 text-right text-blue-700">{fmt(total.income)}</td>
                <td className="px-3 py-2 text-right text-red-600">{fmt(total.expense)}</td>
                <td className="px-3 py-2 text-right">{fmt(total.ending)}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        마감 순서: 이전 연도부터. 마감 취소는 관리자만 가능하며, 다음 연도가 마감돼 있으면 그 연도부터 취소해야 합니다.
      </p>
    </div>
  );
}
