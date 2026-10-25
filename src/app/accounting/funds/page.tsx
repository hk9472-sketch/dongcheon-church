"use client";

import { useCallback, useEffect, useState } from "react";
import LastInputBar from "@/components/accounting/LastInputBar";
import { fmtStamp } from "@/components/accounting/AuditStamp";

interface AccUnit {
  id: number;
  name: string;
  isActive: boolean;
}

interface FundStatus {
  fundId: number;
  name: string;
  kind: string;
  bankName: string | null;
  accountNo: string | null;
  isDefault: boolean;
  isActive: boolean;
  opening: number;
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  balance: number;
  check: {
    id: number;
    date: string;
    actualAmount: number;
    bookAmount: number;
    diff: number;
    memo: string | null;
    createdBy: string;
    createdAt: string;
  } | null;
}

interface Transfer {
  id: number;
  date: string;
  amount: number;
  description: string | null;
  createdBy: string;
  createdAt: string;
  fromFund: { id: number; name: string };
  toFund: { id: number; name: string };
}

function todayKST(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const fmt = (n: number) => n.toLocaleString("ko-KR");
const parseAmount = (s: string) => parseInt(s.replace(/[^0-9-]/g, ""), 10) || 0;
const fmtInput = (s: string) => {
  const raw = s.replace(/[^0-9-]/g, "");
  if (raw === "" || raw === "-") return raw;
  return Number(raw).toLocaleString("ko-KR");
};

export default function FundStatusPage() {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [date, setDate] = useState(todayKST());
  const [rows, setRows] = useState<FundStatus[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 이체 입력
  const [tDate, setTDate] = useState(todayKST());
  const [tFrom, setTFrom] = useState<number | "">("");
  const [tTo, setTTo] = useState<number | "">("");
  const [tAmount, setTAmount] = useState("");
  const [tDesc, setTDesc] = useState("");
  const [busy, setBusy] = useState(false);

  // 대사 입력 (fundId → 실제잔액 입력값)
  const [checkFund, setCheckFund] = useState<number | null>(null);
  const [checkAmount, setCheckAmount] = useState("");
  const [checkMemo, setCheckMemo] = useState("");

  useEffect(() => {
    fetch("/api/accounting/units")
      .then((r) => r.json())
      .then((d) => {
        const list: AccUnit[] = (Array.isArray(d) ? d : d.units || []).filter((u: AccUnit) => u.isActive);
        setUnits(list);
        if (list.length > 0) setUnitId(list[0].id);
      })
      .catch(() => setMsg({ type: "err", text: "회계단위를 불러오지 못했습니다." }));
  }, []);

  const load = useCallback(async () => {
    if (!unitId) return;
    const year = date.slice(0, 4);
    const [s, t] = await Promise.all([
      fetch(`/api/accounting/funds/status?unitId=${unitId}&date=${date}`).then((r) => r.json()),
      fetch(`/api/accounting/transfers?unitId=${unitId}&dateFrom=${year}-01-01&dateTo=${year}-12-31`).then((r) =>
        r.json(),
      ),
    ]);
    if (s.error) throw new Error(s.error);
    setRows(s.funds || []);
    setTransfers(Array.isArray(t) ? t : []);
  }, [unitId, date]);

  useEffect(() => {
    load().catch((e) => setMsg({ type: "err", text: e instanceof Error ? e.message : "조회 실패" }));
  }, [load]);

  const activeFunds = rows.filter((r) => r.isActive);
  const total = rows.reduce(
    (a, r) => ({
      opening: a.opening + r.opening,
      income: a.income + r.income,
      expense: a.expense + r.expense,
      balance: a.balance + r.balance,
    }),
    { opening: 0, income: 0, expense: 0, balance: 0 },
  );

  async function addTransfer() {
    setMsg(null);
    if (!unitId || !tFrom || !tTo || parseAmount(tAmount) <= 0) {
      setMsg({ type: "err", text: "출금·입금 통장과 금액을 입력하세요." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/accounting/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId,
          date: tDate,
          fromFundId: tFrom,
          toFundId: tTo,
          amount: parseAmount(tAmount),
          description: tDesc,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "이체 등록 실패");
      setTAmount("");
      setTDesc("");
      setMsg({ type: "ok", text: "이체를 등록했습니다." });
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "이체 등록 실패" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteTransfer(id: number) {
    if (!confirm("이 이체 내역을 삭제할까요?")) return;
    const res = await fetch(`/api/accounting/transfers/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ type: "err", text: data.error || "삭제 실패" });
      return;
    }
    await load();
  }

  async function saveCheck() {
    if (!checkFund || checkAmount.trim() === "") return;
    const res = await fetch("/api/accounting/funds/checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fundId: checkFund, date, actualAmount: parseAmount(checkAmount), memo: checkMemo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ type: "err", text: data.error || "대사 저장 실패" });
      return;
    }
    setCheckFund(null);
    setCheckAmount("");
    setCheckMemo("");
    await load();
  }

  const sel = "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500";

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-6">통장현황 · 이체</h1>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">회계단위</label>
          <select value={unitId ?? ""} onChange={(e) => setUnitId(Number(e.target.value))} className={sel}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">기준일 (연초 ~ 기준일)</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={sel} />
        </div>
      </div>

      {msg && (
        <div
          className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${
            msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      {unitId && (
        <LastInputBar scope="ledger" unitId={unitId} dateFrom={`${date.slice(0, 4)}-01-01`} dateTo={date} className="mb-2" />
      )}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto mb-6">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="bg-teal-50 text-teal-800">
              <th className="px-3 py-2 text-left font-medium">통장</th>
              <th className="px-3 py-2 text-right font-medium">연초잔액</th>
              <th className="px-3 py-2 text-right font-medium">수입</th>
              <th className="px-3 py-2 text-right font-medium">지출</th>
              <th className="px-3 py-2 text-right font-medium">이체(+/−)</th>
              <th className="px-3 py-2 text-right font-medium">장부잔액</th>
              <th className="px-3 py-2 text-left font-medium">통장 대사</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  등록된 통장이 없습니다. 설정 → 통장관리에서 등록하세요.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.fundId} className={`border-t border-gray-100 ${r.isActive ? "" : "text-gray-400"}`}>
                <td className="px-3 py-2">
                  {r.name}
                  {r.isDefault && <span className="ml-1 text-[10px] text-teal-600">기본</span>}
                  <div className="text-[11px] text-gray-400">
                    F{String(r.fundId).padStart(3, "0")} · {r.kind}
                    {r.accountNo ? ` · ${r.bankName || ""} ${r.accountNo}` : " · 계좌 미입력"}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">{fmt(r.opening)}</td>
                <td className="px-3 py-2 text-right text-blue-700">{fmt(r.income)}</td>
                <td className="px-3 py-2 text-right text-red-600">{fmt(r.expense)}</td>
                <td className="px-3 py-2 text-right text-gray-600">{fmt(r.transferIn - r.transferOut)}</td>
                <td className="px-3 py-2 text-right font-semibold">{fmt(r.balance)}</td>
                <td className="px-3 py-2 text-xs">
                  {r.check ? (
                    <div>
                      {r.check.date} 실제 {fmt(r.check.actualAmount)}
                      <span className={r.check.diff === 0 ? "text-emerald-600 ml-1" : "text-red-600 font-semibold ml-1"}>
                        {r.check.diff === 0 ? "일치" : `차이 ${fmt(r.check.diff)}`}
                      </span>
                      <div className="text-[11px] text-gray-400">
                        입력 {r.check.createdBy} · {fmtStamp(r.check.createdAt, true)}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400">기록 없음</span>
                  )}
                  {checkFund === r.fundId ? (
                    <div className="mt-1 flex gap-1">
                      <input
                        autoFocus
                        value={checkAmount}
                        onChange={(e) => setCheckAmount(fmtInput(e.target.value))}
                        placeholder={`${date} 실제 잔액`}
                        className="w-28 px-2 py-1 border border-gray-300 rounded text-right"
                      />
                      <input
                        value={checkMemo}
                        onChange={(e) => setCheckMemo(e.target.value)}
                        placeholder="메모"
                        className="w-20 px-2 py-1 border border-gray-300 rounded"
                      />
                      <button onClick={saveCheck} className="px-2 py-1 rounded bg-teal-600 text-white">
                        저장
                      </button>
                      <button onClick={() => setCheckFund(null)} className="px-2 py-1 rounded border">
                        취소
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setCheckFund(r.fundId)} className="mt-0.5 text-teal-600 hover:underline">
                      {date} 실제 잔액 입력
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                <td className="px-3 py-2">합계 (회계단위)</td>
                <td className="px-3 py-2 text-right">{fmt(total.opening)}</td>
                <td className="px-3 py-2 text-right text-blue-700">{fmt(total.income)}</td>
                <td className="px-3 py-2 text-right text-red-600">{fmt(total.expense)}</td>
                <td className="px-3 py-2 text-right">0</td>
                <td className="px-3 py-2 text-right">{fmt(total.balance)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-3">통장 간 이체 등록</h2>
        <p className="text-xs text-gray-500 mb-3">
          같은 회계단위 안의 통장 사이 이동(예: 보통예금 → 정기예금)입니다. 수입·지출로 잡히지 않습니다.
          다른 회계로 보내는 돈(대여·상환·지원)은 [회계 간 대체]에서 입력하세요.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} className={sel} />
          <select value={tFrom} onChange={(e) => setTFrom(e.target.value ? Number(e.target.value) : "")} className={sel}>
            <option value="">출금 통장</option>
            {activeFunds.map((f) => (
              <option key={f.fundId} value={f.fundId}>
                {f.name}
              </option>
            ))}
          </select>
          <span className="text-gray-400 pb-2">→</span>
          <select value={tTo} onChange={(e) => setTTo(e.target.value ? Number(e.target.value) : "")} className={sel}>
            <option value="">입금 통장</option>
            {activeFunds.map((f) => (
              <option key={f.fundId} value={f.fundId}>
                {f.name}
              </option>
            ))}
          </select>
          <input
            value={tAmount}
            onChange={(e) => setTAmount(fmtInput(e.target.value))}
            placeholder="금액"
            inputMode="numeric"
            className={`${sel} w-36 text-right`}
          />
          <input value={tDesc} onChange={(e) => setTDesc(e.target.value)} placeholder="적요" className={`${sel} flex-1 min-w-[140px]`} />
          <button
            onClick={addTransfer}
            disabled={busy}
            className="px-5 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
          >
            이체 등록
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b text-sm font-bold text-gray-700">
          {date.slice(0, 4)}년 이체 내역 ({transfers.length}건)
        </div>
        <table className="w-full text-sm">
          <tbody>
            {transfers.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-gray-400">이체 내역이 없습니다.</td>
              </tr>
            )}
            {transfers.map((t) => (
              <tr key={t.id} className="border-t border-gray-100">
                <td className="px-4 py-2 whitespace-nowrap">{t.date.slice(0, 10)}</td>
                <td className="px-4 py-2">
                  {t.fromFund.name} → {t.toFund.name}
                </td>
                <td className="px-4 py-2 text-right font-semibold">{fmt(t.amount)}</td>
                <td className="px-4 py-2 text-gray-500">{t.description}</td>
                <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">
                  {t.createdBy} · {fmtStamp(t.createdAt, true)}
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => deleteTransfer(t.id)} className="text-xs text-red-500 hover:underline">
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
