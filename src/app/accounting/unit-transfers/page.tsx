"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtStamp } from "@/components/accounting/AuditStamp";

interface Fund {
  id: number;
  unitId: number;
  name: string;
  isActive: boolean;
  unit: { id: number; name: string };
}
interface Transfer {
  id: number;
  date: string;
  kind: string;
  fromUnit: string;
  fromFund: string;
  toUnit: string;
  toFund: string;
  amount: number;
  description: string | null;
  createdBy: string;
  createdAt: string;
}
interface Loan {
  lender: string;
  borrower: string;
  amount: number;
}

const KINDS = [
  { v: "대여", d: "다른 회계에 빌려줌 (나중에 상환받음)" },
  { v: "상환", d: "빌린 돈을 돌려줌" },
  { v: "지원", d: "갚지 않는 지원·이관" },
];

function todayKST(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const fmt = (n: number) => n.toLocaleString("ko-KR");
const parseAmount = (s: string) => parseInt(s.replace(/[^0-9]/g, ""), 10) || 0;

export default function UnitTransferPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [funds, setFunds] = useState<Fund[]>([]);
  const [list, setList] = useState<Transfer[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [date, setDate] = useState(todayKST());
  const [kind, setKind] = useState("대여");
  const [fromFundId, setFromFundId] = useState<number | "">("");
  const [toFundId, setToFundId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    fetch("/api/accounting/funds")
      .then((r) => r.json())
      .then((d) => setFunds(Array.isArray(d) ? d.filter((f: Fund) => f.isActive) : []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/accounting/unit-transfers?year=${year}`);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "조회 실패");
    setList(d.transfers || []);
    setLoans(d.loans || []);
  }, [year]);

  useEffect(() => {
    load().catch((e) => setMsg({ type: "err", text: e instanceof Error ? e.message : "조회 실패" }));
  }, [load]);

  const fromFund = funds.find((f) => f.id === fromFundId);
  const toCandidates = funds.filter((f) => !fromFund || f.unitId !== fromFund.unitId);

  async function save() {
    setMsg(null);
    if (!fromFundId || !toFundId || parseAmount(amount) <= 0) {
      setMsg({ type: "err", text: "보내는 통장, 받는 통장, 금액을 입력하세요." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/accounting/unit-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, kind, fromFundId, toFundId, amount: parseAmount(amount), description: desc }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "저장 실패");
      setAmount("");
      setDesc("");
      setMsg({ type: "ok", text: "대체를 등록했습니다. 양쪽 회계에 전표가 생성되었습니다." });
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: Transfer) {
    if (!confirm(`${t.date} ${t.fromUnit} → ${t.toUnit} ${fmt(t.amount)}원 대체를 삭제할까요?\n(양쪽 회계의 전표도 함께 삭제됩니다)`)) return;
    const res = await fetch(`/api/accounting/unit-transfers?id=${t.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ type: "err", text: d.error || "삭제 실패" });
      return;
    }
    await load();
  }

  const sel = "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500";
  const fundOptions = (list: Fund[]) =>
    Array.from(new Set(list.map((f) => f.unit.name))).map((unitName) => (
      <optgroup key={unitName} label={unitName}>
        {list
          .filter((f) => f.unit.name === unitName)
          .map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
      </optgroup>
    ));

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-2">회계 간 대체</h1>
      <p className="text-sm text-gray-500 mb-6">
        한 회계의 통장에서 다른 회계의 통장으로 돈을 옮길 때 사용합니다(대여·상환·지원). 저장하면 보낸 회계에
        &lsquo;타회계대체출금&rsquo;, 받은 회계에 &lsquo;타회계대체입금&rsquo; 전표가 자동으로 생기고, 결산서에는 일반
        수입·지출과 따로 표시됩니다. 같은 회계 안의 통장 이동은 [통장현황·이체]를 쓰세요.
      </p>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 space-y-3">
        <div className="flex flex-wrap gap-4 text-sm">
          {KINDS.map((k) => (
            <label key={k.v} className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="kind" checked={kind === k.v} onChange={() => setKind(k.v)} />
              <strong>{k.v}</strong>
              <span className="text-xs text-gray-400">{k.d}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={sel} />
          <select
            value={fromFundId}
            onChange={(e) => {
              setFromFundId(e.target.value ? Number(e.target.value) : "");
              setToFundId("");
            }}
            className={sel}
          >
            <option value="">보내는 통장</option>
            {fundOptions(funds)}
          </select>
          <span className="pb-2 text-gray-400">→</span>
          <select value={toFundId} onChange={(e) => setToFundId(e.target.value ? Number(e.target.value) : "")} className={sel}>
            <option value="">받는 통장 (다른 회계)</option>
            {fundOptions(toCandidates)}
          </select>
          <input
            value={amount}
            onChange={(e) => {
              const n = parseAmount(e.target.value);
              setAmount(n ? fmt(n) : "");
            }}
            placeholder="금액"
            inputMode="numeric"
            className={`${sel} w-36 text-right`}
          />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="적요" className={`${sel} flex-1 min-w-[160px]`} />
          <button onClick={save} disabled={busy} className="px-5 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50">
            등록
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6 overflow-hidden">
        <div className="px-4 py-2.5 bg-amber-50 border-b text-sm font-bold text-amber-900">회계 간 미상환 잔액 (대여 − 상환, 전체 기간)</div>
        {loans.length === 0 ? (
          <div className="px-4 py-4 text-sm text-gray-400">미상환 대여금이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {loans.map((l) => (
                <tr key={`${l.lender}>${l.borrower}`} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    {l.borrower} 이(가) {l.lender} 에 갚을 금액
                  </td>
                  <td className={`px-4 py-2 text-right font-semibold ${l.amount < 0 ? "text-red-600" : ""}`}>{fmt(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b flex items-center gap-3">
          <span className="text-sm font-bold text-gray-700">대체 내역</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-2 py-1 border border-gray-300 rounded text-sm">
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {list.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-gray-400">대체 내역이 없습니다.</td>
              </tr>
            )}
            {list.map((t) => (
              <tr key={t.id} className="border-t border-gray-100">
                <td className="px-4 py-2 whitespace-nowrap">{t.date}</td>
                <td className="px-4 py-2">
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 text-xs">{t.kind}</span>
                </td>
                <td className="px-4 py-2">
                  {t.fromUnit}({t.fromFund}) → {t.toUnit}({t.toFund})
                </td>
                <td className="px-4 py-2 text-right font-semibold">{fmt(t.amount)}</td>
                <td className="px-4 py-2 text-gray-500">{t.description}</td>
                <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">
                  {t.createdBy} · {fmtStamp(t.createdAt, true)}
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => remove(t)} className="text-xs text-red-500 hover:underline">
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
