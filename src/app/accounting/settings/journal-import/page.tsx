"use client";

import { useEffect, useState } from "react";

interface AccUnit {
  id: number;
  name: string;
  isActive: boolean;
}
interface Fund {
  id: number;
  name: string;
  isDefault: boolean;
  isActive: boolean;
}
interface Line {
  date: string;
  no: string;
  drAmt: number;
  drAcc: string;
  crAcc: string;
  crAmt: number;
  memo: string;
  party: string;
}
interface Preview {
  totalVouchers: number;
  importCount: number;
  excludedPairs: Array<{ date: string; code: string; name: string; amount: number; memo: string }>;
  duplicates: number;
  errors: Array<{ ref: string; errors: string[] }>;
  accounts: Array<{ code: string; extName: string; accountLabel: string; type: string; count: number; amount: number }>;
  incomeTotal: number;
  expenseTotal: number;
  dateFrom: string | null;
  dateTo: string | null;
  created?: number;
  error?: string;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const num = (s: string) => {
  const n = parseInt((s || "").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

/** 분개장(엑셀로 저장된 HTML 표) → 행 배열. 9열: 일자|번호|차변금액|차변계정|대변계정|대변금액|적요|거래처|부서 */
function parseJournal(html: string): Line[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: Line[] = [];
  doc.querySelectorAll("tr").forEach((tr) => {
    const c = Array.from(tr.querySelectorAll("td")).map((td) =>
      (td.textContent || "").replace(/ /g, " ").replace(/\s+/g, " ").trim(),
    );
    if (c.length < 6 || !/^\d{4}-\d{2}-\d{2}$/.test(c[0])) return;
    out.push({
      date: c[0],
      no: c[1],
      drAmt: num(c[2]),
      drAcc: c[3],
      crAcc: c[4],
      crAmt: num(c[5]),
      memo: c[6] || "",
      party: c[7] || "",
    });
  });
  return out;
}

export default function JournalImportPage() {
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [fundId, setFundId] = useState<number | "">("");
  const [cashCode, setCashCode] = useState("3004");
  const [lines, setLines] = useState<Line[]>([]);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/accounting/units")
      .then((r) => r.json())
      .then((d) => {
        const list: AccUnit[] = (Array.isArray(d) ? d : d.units || []).filter((u: AccUnit) => u.isActive);
        setUnits(list);
        setUnitId(list[0]?.id ?? null);
      });
  }, []);

  useEffect(() => {
    if (!unitId) return;
    setPreview(null);
    fetch(`/api/accounting/funds?unitId=${unitId}`)
      .then((r) => r.json())
      .then((d: Fund[]) => {
        const list = Array.isArray(d) ? d.filter((f) => f.isActive) : [];
        setFunds(list);
        setFundId(list.find((f) => f.isDefault)?.id ?? list[0]?.id ?? "");
      });
  }, [unitId]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMsg(null);
    setPreview(null);
    const buf = await f.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    // UTF-8 이 아니면(한글 깨짐) EUC-KR 로 다시 읽기
    if (text.includes("�")) text = new TextDecoder("euc-kr").decode(buf);
    const parsed = parseJournal(text);
    if (parsed.length === 0) {
      setMsg({ type: "err", text: "분개장 행을 찾지 못했습니다. 외부 사이트의 '분개장' 엑셀 저장 파일인지 확인하세요." });
      return;
    }
    setFileName(f.name);
    setLines(parsed);
  }

  async function run(confirm: boolean) {
    if (!unitId || lines.length === 0) return;
    if (confirm && !window.confirm(`${preview?.importCount ?? 0}건을 전표로 저장할까요?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounting/voucher/journal-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, fundId: fundId || null, cashCode, lines, confirm }),
      });
      const data: Preview = await res.json();
      setPreview(data);
      if (!res.ok) throw new Error(data.error || "처리 실패");
      if (confirm) setMsg({ type: "ok", text: `${data.created}건 저장했습니다.` });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "처리 실패" });
    } finally {
      setBusy(false);
    }
  }

  const sel = "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500";

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-2">분개장 가져오기</h1>
      <p className="text-sm text-gray-500 mb-6">
        외부 회계사이트에서 받은 <strong>분개장 엑셀(.xls)</strong>을 전표로 옮깁니다. 현금 계정 줄은 통장 쪽으로
        보고 버리며, 같은 날 같은 계정의 ± 상쇄 입력은 가져오지 않습니다. 같은 파일을 다시 올려도 이미 가져온
        전표는 건너뜁니다.
      </p>

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
          <label className="block text-xs text-gray-500 mb-1">입출금 통장</label>
          <select value={fundId} onChange={(e) => setFundId(e.target.value ? Number(e.target.value) : "")} className={sel}>
            {funds.length === 0 && <option value="">기본 (통장 미등록)</option>}
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">현금 계정코드</label>
          <input value={cashCode} onChange={(e) => setCashCode(e.target.value)} className={`${sel} w-24`} />
        </div>
        <label className="px-4 py-2 text-sm rounded-lg border border-teal-600 text-teal-700 cursor-pointer hover:bg-teal-50">
          파일 선택
          <input type="file" accept=".xls,.html,.htm" onChange={onFile} className="hidden" />
        </label>
        {fileName && (
          <span className="text-sm text-gray-600">
            {fileName} — {fmt(lines.length)}줄
          </span>
        )}
        <button
          onClick={() => run(false)}
          disabled={busy || lines.length === 0}
          className="px-5 py-2 text-sm rounded-lg bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50"
        >
          미리보기
        </button>
        <button
          onClick={() => run(true)}
          disabled={busy || !preview || preview.importCount === 0 || preview.errors.length > 0}
          className="px-5 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {busy ? "처리 중..." : "전표로 저장"}
        </button>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            {[
              ["원본 전표", fmt(preview.totalVouchers)],
              ["가져올 전표", fmt(preview.importCount)],
              ["상쇄 쌍 제외", `${fmt(preview.excludedPairs.length)}쌍`],
              ["이미 가져옴", fmt(preview.duplicates)],
              ["오류", fmt(preview.errors.length)],
            ].map(([k, v]) => (
              <div key={k} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="text-xs text-gray-500">{k}</div>
                <div className="text-lg font-bold text-gray-800">{v}</div>
              </div>
            ))}
          </div>
          <div className="text-sm text-gray-600">
            기간 {preview.dateFrom} ~ {preview.dateTo} · 수입 <strong className="text-blue-700">{fmt(preview.incomeTotal)}</strong> · 지출{" "}
            <strong className="text-red-600">{fmt(preview.expenseTotal)}</strong> · 차액{" "}
            <strong>{fmt(preview.incomeTotal - preview.expenseTotal)}</strong>
          </div>

          {preview.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <div className="font-bold mb-1">오류 전표 — 계정과목 설정 후 다시 미리보기</div>
              <ul className="list-disc pl-5 space-y-0.5 max-h-60 overflow-y-auto">
                {preview.errors.map((e) => (
                  <li key={e.ref}>
                    {e.ref}: {e.errors.join(" / ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b text-sm font-bold text-gray-700">계정 매핑 (외부 코드 → 우리 계정)</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs">
                  <th className="px-3 py-1.5 text-left">외부 계정</th>
                  <th className="px-3 py-1.5 text-left">우리 계정</th>
                  <th className="px-3 py-1.5 text-center">구분</th>
                  <th className="px-3 py-1.5 text-right">건수</th>
                  <th className="px-3 py-1.5 text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {preview.accounts.map((a) => (
                  <tr key={`${a.code}|${a.accountLabel}`} className="border-t border-gray-100">
                    <td className="px-3 py-1.5">
                      [{a.code}] {a.extName}
                    </td>
                    <td className="px-3 py-1.5">{a.accountLabel || <span className="text-red-600">미매칭</span>}</td>
                    <td className={`px-3 py-1.5 text-center ${a.type === "D" ? "text-blue-700" : "text-red-600"}`}>
                      {a.type === "D" ? "수입" : "지출"}
                    </td>
                    <td className="px-3 py-1.5 text-right">{a.count}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.excludedPairs.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b text-sm font-bold text-gray-700">
                가져오지 않는 상쇄 쌍 ({preview.excludedPairs.length}쌍 — 같은 날 +/− 입력)
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {preview.excludedPairs.map((p, i) => (
                    <tr key={i} className="border-t border-gray-100 text-gray-600">
                      <td className="px-3 py-1.5">{p.date}</td>
                      <td className="px-3 py-1.5">
                        [{p.code}] {p.name}
                      </td>
                      <td className="px-3 py-1.5 text-right">±{fmt(p.amount)}</td>
                      <td className="px-3 py-1.5">{p.memo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
