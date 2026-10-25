"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import HelpButton from "@/components/HelpButton";

interface FundRow {
  fundId: number;
  name: string;
  kind: string;
  isDefault: boolean;
  amount: number;
}
interface UnitRow {
  unitId: number;
  name: string;
  exists: boolean;
  amount: number;
  source: string | null;
  lock: string | null;
  funds: FundRow[];
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const parseAmount = (v: string): number => Number(v.replace(/[^0-9-]/g, "")) || 0;
function formatInput(v: string): string {
  const raw = v.replace(/[^0-9-]/g, "");
  if (raw === "" || raw === "-") return raw;
  const n = Number(raw);
  return isNaN(n) ? "" : n.toLocaleString("ko-KR");
}

/**
 * 연도별 이월금 — 전체 회계단위 × 통장을 한 화면에서 입력.
 *  - 장부 시작 연도: 여기서 직접 입력.
 *  - 이후 연도: 전년도 [연마감] 시 통장별 기말잔액으로 자동 생성되며 잠김.
 */
export default function YearBalancePage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [units, setUnits] = useState<UnitRow[]>([]);
  // key: `u{unitId}` (통장 없는 단위) 또는 `f{fundId}`
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/accounting/balance/year?year=${year}`);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "조회 실패");
    const list: UnitRow[] = d.units || [];
    setUnits(list);
    const next: Record<string, string> = {};
    for (const u of list) {
      if (u.funds.length === 0) next[`u${u.unitId}`] = u.exists ? fmt(u.amount) : "";
      for (const f of u.funds) next[`f${f.fundId}`] = u.exists || f.amount ? fmt(f.amount) : "";
    }
    setInputs(next);
  }, [year]);

  useEffect(() => {
    setMsg(null);
    load().catch((e) => setMsg({ type: "err", text: e instanceof Error ? e.message : "조회 실패" }));
  }, [load]);

  const unitTotal = (u: UnitRow) =>
    u.funds.length > 0
      ? u.funds.reduce((s, f) => s + parseAmount(inputs[`f${f.fundId}`] || ""), 0)
      : parseAmount(inputs[`u${u.unitId}`] || "");
  const editable = units.filter((u) => !u.lock);
  const grand = units.reduce((s, u) => s + unitTotal(u), 0);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounting/balance/year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          units: editable.map((u) => ({
            unitId: u.unitId,
            amount: parseAmount(inputs[`u${u.unitId}`] || ""),
            funds: u.funds.map((f) => ({ fundId: f.fundId, amount: parseAmount(inputs[`f${f.fundId}`] || "") })),
          })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "저장 실패");
      const skipped = (d.skipped || []) as { unitId: number; reason: string }[];
      setMsg(
        skipped.length
          ? { type: "err", text: `저장 ${d.saved.length}건, 제외 ${skipped.length}건: ${skipped.map((s) => s.reason).join(" / ")}` }
          : { type: "ok", text: `${year}년 이월금을 저장했습니다. (${d.saved.length}개 회계)` },
      );
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-40 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-gray-50 disabled:text-gray-500";

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
        연도별 이월금 <HelpButton slug="accounting-balance" />
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        장부를 시작하는 연도의 이월금(전년도 잔액)을 통장별로 입력합니다. 다음 연도부터는{" "}
        <Link href="/accounting/year-closing" className="text-teal-700 underline">
          연마감
        </Link>
        을 하면 통장별 기말잔액이 자동으로 이월되고 잠깁니다.
      </p>

      <div className="flex items-end gap-4 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">회계년도</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {Array.from({ length: 8 }, (_, i) => thisYear + 1 - i).map((y) => (
              <option key={y} value={y}>
                {y}년 (← {y - 1}년 이월)
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={save}
          disabled={saving || editable.length === 0}
          className="px-6 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto max-w-3xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-teal-50 text-teal-800">
              <th className="px-4 py-2 text-left font-medium">회계 / 통장</th>
              <th className="px-4 py-2 text-right font-medium">{year}년 이월금</th>
              <th className="px-4 py-2 text-left font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const locked = !!u.lock;
              const status = locked ? (
                <span className="text-xs text-indigo-700" title={u.lock!}>
                  {u.source === "closing" ? "전년도 연마감 생성 · 잠김" : "잠김"}
                </span>
              ) : u.exists ? (
                <span className="text-xs text-emerald-700">직접 입력됨</span>
              ) : (
                <span className="text-xs text-amber-600">미입력</span>
              );
              return [
                <tr key={`u${u.unitId}`} className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-2 font-semibold">{u.name}</td>
                  <td className="px-4 py-2 text-right">
                    {u.funds.length === 0 ? (
                      <input
                        value={inputs[`u${u.unitId}`] ?? ""}
                        disabled={locked}
                        onChange={(e) => setInputs((p) => ({ ...p, [`u${u.unitId}`]: formatInput(e.target.value) }))}
                        className={inputCls}
                        placeholder="0"
                      />
                    ) : (
                      <span className="font-semibold pr-3">{fmt(unitTotal(u))}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{status}</td>
                </tr>,
                ...u.funds.map((f) => (
                  <tr key={`f${f.fundId}`} className="border-t border-gray-100">
                    <td className="px-4 py-1.5 pl-8 text-gray-700">
                      {f.name}
                      <span className="ml-1 text-xs text-gray-400">
                        F{String(f.fundId).padStart(3, "0")} · {f.kind}
                        {f.isDefault ? " · 기본" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      <input
                        value={inputs[`f${f.fundId}`] ?? ""}
                        disabled={locked}
                        onChange={(e) => setInputs((p) => ({ ...p, [`f${f.fundId}`]: formatInput(e.target.value) }))}
                        className={inputCls}
                        placeholder="0"
                        inputMode="numeric"
                      />
                    </td>
                    <td />
                  </tr>
                )),
              ];
            })}
            {units.length > 0 && (
              <tr className="border-t-2 border-gray-300 font-bold bg-teal-50/50">
                <td className="px-4 py-2">교회 전체</td>
                <td className="px-4 py-2 text-right pr-7">{fmt(grand)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        음수 입력 가능. 잠긴 이월금을 고치려면 연마감 화면에서 전년도 연마감을 취소한 뒤 수정하고 다시 마감하세요.
      </p>
    </div>
  );
}
