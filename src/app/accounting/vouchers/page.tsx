"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import HelpButton from "@/components/HelpButton";

/* ───── types ───── */
interface AccUnit {
  id: number;
  code: string;
  name: string;
}

interface AccAccount {
  id: number;
  code: string;
  name: string;
  type: string;
  parentId: number | null;
  level: number;
  isActive: boolean;
}

interface VoucherItemData {
  id: number;
  seq: number;
  accountId: number;
  amount: number;
  description: string | null;
  counterpart: string | null;
  account: { code: string; name: string; type: string };
}

interface VoucherData {
  id: number;
  unitId: number;
  unit?: { id: number; code: string; name: string };
  voucherNo: string;
  type: string;
  date: string;
  description: string | null;
  totalAmount: number;
  isClosed: boolean;
  createdBy: string;
  items: VoucherItemData[];
}

interface EditItem {
  key: string;
  accountId: number | null;
  amount: string;
  description: string;
  counterpart: string;
}

/* ───── helpers ───── */
function fmtAmount(n: number): string {
  return n.toLocaleString("ko-KR");
}

function parseAmount(s: string): number {
  return parseInt(s.replace(/[^0-9-]/g, ""), 10) || 0;
}

function currentMonthRange(): { from: string; to: string } {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
  };
}

let keySeq = 0;
function nextKey(): string {
  return `ei-${++keySeq}-${Date.now()}`;
}

/* ───── component ───── */
export default function VoucherListPage() {
  const range = currentMonthRange();

  // search state
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [dateFrom, setDateFrom] = useState(range.from);
  const [dateTo, setDateTo] = useState(range.to);
  const [filterUnitId, setFilterUnitId] = useState<number | "">(""); // "" = 전체
  const [filterType, setFilterType] = useState<"" | "D" | "C">("");
  const [keyword, setKeyword] = useState("");
  const [accountKeyword, setAccountKeyword] = useState("");

  // results
  const [vouchers, setVouchers] = useState<VoucherData[]>([]);
  const [loading, setLoading] = useState(false);

  // accounts for edit modal
  const [allAccounts, setAllAccounts] = useState<AccAccount[]>([]);

  // edit modal
  const [editVoucher, setEditVoucher] = useState<VoucherData | null>(null);
  const [editTab, setEditTab] = useState<"D" | "C">("D");
  const [editHeaderDesc, setEditHeaderDesc] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  /* ---- fetch units ---- */
  const [unitsLoaded, setUnitsLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/accounting/units")
      .then((r) => r.json())
      .then((d: AccUnit[]) => {
        const list = Array.isArray(d) ? d : [];
        setUnits(list);
      })
      .catch(() => {})
      .finally(() => setUnitsLoaded(true));
  }, []);

  /* ---- search ---- */
  const doSearch = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterUnitId) params.set("unitId", String(filterUnitId));
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (filterType) params.set("type", filterType);
    if (keyword) params.set("keyword", keyword);
    if (accountKeyword) params.set("accountName", accountKeyword);

    fetch(`/api/accounting/vouchers?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setVouchers(d);
        else if (d.vouchers) setVouchers(d.vouchers);
        else setVouchers([]);
      })
      .catch(() => setVouchers([]))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, filterUnitId, filterType, keyword, accountKeyword]);

  // 단위 목록 로드 완료 후 자동 조회 (전체)
  useEffect(() => {
    if (unitsLoaded) doSearch();
  }, [unitsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- summary ---- */
  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const v of vouchers) {
      if (v.type === "D") income += v.totalAmount;
      else expense += v.totalAmount;
    }
    return { income, expense, balance: income - expense };
  }, [vouchers]);

  /* ---- flat rows for table (grouped by voucher) ---- */
  const rows = useMemo(() => {
    const result: {
      voucherId: number;
      voucherNo: string;
      voucherType: string;
      isClosed: boolean;
      isFirst: boolean;
      rowSpan: number;
      item: VoucherItemData;
      voucher: VoucherData;
    }[] = [];
    for (const v of vouchers) {
      v.items.forEach((it, i) => {
        result.push({
          voucherId: v.id,
          voucherNo: v.voucherNo,
          voucherType: v.type,
          isClosed: v.isClosed,
          isFirst: i === 0,
          rowSpan: v.items.length,
          item: it,
          voucher: v,
        });
      });
    }
    return result;
  }, [vouchers]);

  /* ---- CSV export ---- */
  function exportCSV() {
    const BOM = "\uFEFF";
    const header = [
      "전표번호",
      "일자",
      "계정코드",
      "계정명",
      "분류",
      "수입금액",
      "지출금액",
      "적요",
      "거래처",
    ];

    const csvRows: string[] = [header.join(",")];

    for (const v of vouchers) {
      for (const it of v.items) {
        csvRows.push(
          [
            v.voucherNo,
            v.date.slice(0, 10),
            `"${it.account.code}"`,
            `"${it.account.name}"`,
            v.type === "D" ? "수입" : "지출",
            v.type === "D" ? it.amount : "",
            v.type === "C" ? it.amount : "",
            `"${(it.description || "").replace(/"/g, '""')}"`,
            `"${(it.counterpart || "").replace(/"/g, '""')}"`,
          ].join(",")
        );
      }
    }

    const blob = new Blob([BOM + csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `전표현황_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---- edit modal helpers ---- */
  function openEditModal(v: VoucherData) {
    setEditVoucher(v);
    setEditTab(v.type as "D" | "C");
    setEditHeaderDesc(v.description || "");
    setEditDate(v.date.slice(0, 10));
    setEditItems(
      v.items.map((it) => ({
        key: nextKey(),
        accountId: it.accountId,
        amount: String(it.amount),
        description: it.description || "",
        counterpart: it.counterpart || "",
      }))
    );
    setEditMessage(null);

    // fetch accounts for this unit
    fetch(`/api/accounting/accounts?unitId=${v.unitId}`)
      .then((r) => r.json())
      .then((d: AccAccount[]) => {
        if (Array.isArray(d)) setAllAccounts(d);
      })
      .catch(() => setAllAccounts([]));
  }

  function closeEditModal() {
    setEditVoucher(null);
    setEditItems([]);
    setEditMessage(null);
  }

  const editLeafAccounts = useMemo(() => {
    const parentIds = new Set(
      allAccounts.filter((a) => a.parentId !== null).map((a) => a.parentId)
    );
    return allAccounts.filter(
      (a) => a.type === editTab && a.isActive && !parentIds.has(a.id)
    );
  }, [allAccounts, editTab]);

  const editTotal = useMemo(
    () => editItems.reduce((s, it) => s + parseAmount(it.amount), 0),
    [editItems]
  );

  function updateEditItem(key: string, field: keyof EditItem, value: string | number | null) {
    setEditItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, [field]: value } : it))
    );
  }

  function removeEditItem(key: string) {
    setEditItems((prev) => {
      const next = prev.filter((it) => it.key !== key);
      return next.length === 0
        ? [{ key: nextKey(), accountId: null, amount: "", description: "", counterpart: "" }]
        : next;
    });
  }

  function addEditItem() {
    setEditItems((prev) => [
      ...prev,
      { key: nextKey(), accountId: null, amount: "", description: "", counterpart: "" },
    ]);
  }

  async function handleEditSave() {
    if (!editVoucher) return;
    const validItems = editItems.filter(
      (it) => it.accountId && parseAmount(it.amount) > 0
    );
    if (validItems.length === 0) {
      setEditMessage({ type: "err", text: "최소 1개 이상의 항목을 입력하세요." });
      return;
    }

    setEditSaving(true);
    setEditMessage(null);

    try {
      const res = await fetch(`/api/accounting/vouchers/${editVoucher.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: editVoucher.unitId,
          type: editTab,
          date: editDate,
          description: editHeaderDesc,
          items: validItems.map((it, i) => ({
            seq: i + 1,
            accountId: it.accountId,
            amount: parseAmount(it.amount),
            description: it.description,
            counterpart: it.counterpart,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "수정에 실패했습니다.");
      }

      setEditMessage({ type: "ok", text: "전표가 수정되었습니다." });
      setTimeout(() => {
        closeEditModal();
        doSearch();
      }, 800);
    } catch (e: unknown) {
      setEditMessage({
        type: "err",
        text: e instanceof Error ? e.message : "오류가 발생했습니다.",
      });
    } finally {
      setEditSaving(false);
    }
  }

  async function handleEditDelete() {
    if (!editVoucher) return;
    if (!confirm("이 전표를 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`/api/accounting/vouchers/${editVoucher.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "삭제에 실패했습니다.");
      }
      closeEditModal();
      doSearch();
    } catch (e: unknown) {
      setEditMessage({
        type: "err",
        text: e instanceof Error ? e.message : "오류가 발생했습니다.",
      });
    }
  }

  function handleEditAmountBlur(key: string, raw: string) {
    const n = parseAmount(raw);
    if (n > 0) updateEditItem(key, "amount", fmtAmount(n));
  }

  function handleEditAmountFocus(key: string, raw: string) {
    const n = parseAmount(raw);
    updateEditItem(key, "amount", n > 0 ? String(n) : "");
  }

  /* ======================================== render ======================================== */
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">전표현황 <HelpButton slug="accounting-vouchers" /></h1>

      {/* ─── search area ─── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* 기간 from */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">기간(시작)</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          {/* 기간 to */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">기간(종료)</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          {/* 회계단위 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">회계단위</label>
            <select
              value={filterUnitId}
              onChange={(e) =>
                setFilterUnitId(e.target.value ? Number(e.target.value) : "")
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">전체</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          {/* 구분 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">구분</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as "" | "D" | "C")}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">전체</option>
              <option value="D">수입</option>
              <option value="C">지출</option>
            </select>
          </div>
          {/* 계정명 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">계정명</label>
            <input
              type="text"
              value={accountKeyword}
              onChange={(e) => setAccountKeyword(e.target.value)}
              placeholder="계정과목 검색"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          {/* 적요/거래처 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">적요/거래처</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="적요 또는 거래처"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={doSearch}
            className="px-5 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors font-medium"
          >
            조회
          </button>
          <button
            onClick={exportCSV}
            className="px-5 py-2 text-sm rounded-lg border border-emerald-500 text-emerald-700 hover:bg-emerald-50 transition-colors font-medium"
          >
            엑셀
          </button>
        </div>
      </div>

      {/* ─── summary bar ─── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-4 text-sm">
        <span>
          수입{" "}
          <span className="font-bold text-blue-700">
            {fmtAmount(summary.income)}
          </span>
        </span>
        <span className="text-gray-400">-</span>
        <span>
          지출{" "}
          <span className="font-bold text-red-700">
            {fmtAmount(summary.expense)}
          </span>
        </span>
        <span className="text-gray-400">=</span>
        <span>
          잔액{" "}
          <span
            className={`font-bold ${
              summary.balance >= 0 ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {fmtAmount(summary.balance)}
          </span>
        </span>
        <span className="text-gray-400 ml-auto">
          전표 {vouchers.length}건
        </span>
      </div>

      {/* ─── results table ─── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="px-4 py-12 text-center text-gray-400 text-sm">
            조회 중...
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400 text-sm">
            조회 결과가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <th className="px-3 py-2.5 text-left font-medium">전표번호</th>
                  {!filterUnitId && (
                    <th className="px-3 py-2.5 text-left font-medium w-24">회계단위</th>
                  )}
                  <th className="px-3 py-2.5 text-left font-medium">계정명</th>
                  <th className="px-3 py-2.5 text-center font-medium w-16">분류</th>
                  <th className="px-3 py-2.5 text-right font-medium w-28">수입금액</th>
                  <th className="px-3 py-2.5 text-right font-medium w-28">지출금액</th>
                  <th className="px-3 py-2.5 text-left font-medium">적요</th>
                  <th className="px-3 py-2.5 text-left font-medium w-24">거래처</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={`${row.voucherId}-${row.item.id}`}
                    className={`border-b border-gray-50 hover:bg-teal-50/40 transition-colors ${
                      row.isFirst && idx > 0 ? "border-t border-gray-200" : ""
                    }`}
                  >
                    {/* 전표번호: only first row of group */}
                    {row.isFirst && (
                      <td
                        className="px-3 py-2 align-top"
                        rowSpan={row.rowSpan}
                      >
                        <button
                          onClick={() => openEditModal(row.voucher)}
                          className="text-teal-700 hover:text-teal-900 hover:underline font-mono text-xs flex items-center gap-1"
                        >
                          {row.isClosed && (
                            <svg
                              className="w-3.5 h-3.5 text-gray-400 shrink-0"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                              />
                            </svg>
                          )}
                          {row.voucherNo}
                        </button>
                      </td>
                    )}

                    {/* 회계단위 (전체 모드) */}
                    {!filterUnitId && row.isFirst && (
                      <td
                        className="px-3 py-2 align-top text-xs text-gray-500"
                        rowSpan={row.rowSpan}
                      >
                        {row.voucher.unit?.name || ""}
                      </td>
                    )}

                    {/* 계정명 */}
                    <td className="px-3 py-2">
                      <span className="text-gray-400 text-xs mr-1">
                        {row.item.account.code}
                      </span>
                      {row.item.account.name}
                    </td>

                    {/* 분류 */}
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${
                          row.voucherType === "D"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {row.voucherType === "D" ? "입금" : "출금"}
                      </span>
                    </td>

                    {/* 수입금액 */}
                    <td className="px-3 py-2 text-right font-mono">
                      {row.voucherType === "D" ? (
                        <span className="text-blue-700">
                          {fmtAmount(row.item.amount)}
                        </span>
                      ) : (
                        ""
                      )}
                    </td>

                    {/* 지출금액 */}
                    <td className="px-3 py-2 text-right font-mono">
                      {row.voucherType === "C" ? (
                        <span className="text-red-700">
                          {fmtAmount(row.item.amount)}
                        </span>
                      ) : (
                        ""
                      )}
                    </td>

                    {/* 적요 */}
                    <td className="px-3 py-2 text-gray-600">
                      {row.item.description || row.voucher.description || ""}
                    </td>

                    {/* 거래처 */}
                    <td className="px-3 py-2 text-gray-600">
                      {row.item.counterpart || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── edit modal ─── */}
      {editVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-4">
            {/* modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-800">전표 수정</h2>
                <span className="font-mono text-sm text-gray-500">
                  {editVoucher.voucherNo}
                </span>
                {editVoucher.isClosed && (
                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                    마감됨
                  </span>
                )}
              </div>
              <button
                onClick={closeEditModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* modal body */}
            <div className="p-5 space-y-4">
              {editMessage && (
                <div
                  className={`px-4 py-2.5 rounded-lg text-sm ${
                    editMessage.type === "ok"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {editMessage.text}
                </div>
              )}

              {editVoucher.isClosed ? (
                /* read-only view for closed vouchers */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">구분: </span>
                      <span className="font-medium">
                        {editVoucher.type === "D" ? "수입" : "지출"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">일자: </span>
                      <span className="font-medium">
                        {editVoucher.date.slice(0, 10)}
                      </span>
                    </div>
                    {editVoucher.description && (
                      <div className="col-span-2">
                        <span className="text-gray-500">적요: </span>
                        <span>{editVoucher.description}</span>
                      </div>
                    )}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-2 py-2 text-left font-medium">계정과목</th>
                        <th className="px-2 py-2 text-right font-medium">금액</th>
                        <th className="px-2 py-2 text-left font-medium">적요</th>
                        <th className="px-2 py-2 text-left font-medium">거래처</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editVoucher.items.map((it) => (
                        <tr key={it.id} className="border-b border-gray-100">
                          <td className="px-2 py-1.5">
                            {it.account.code} - {it.account.name}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {fmtAmount(it.amount)}
                          </td>
                          <td className="px-2 py-1.5">{it.description || ""}</td>
                          <td className="px-2 py-1.5">{it.counterpart || ""}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-2 py-2 text-right">합계</td>
                        <td className="px-2 py-2 text-right font-mono">
                          {fmtAmount(editVoucher.totalAmount)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                /* editable form */
                <>
                  {/* tabs */}
                  <div className="flex gap-1">
                    {(["D", "C"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setEditTab(t)}
                        className={`px-5 py-2 rounded-t-lg text-sm font-semibold transition-colors ${
                          editTab === t
                            ? t === "D"
                              ? "bg-blue-600 text-white"
                              : "bg-red-600 text-white"
                            : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                        }`}
                      >
                        {t === "D" ? "수입" : "지출"}
                      </button>
                    ))}
                  </div>

                  {/* header fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        거래일자
                      </label>
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        전표적요
                      </label>
                      <input
                        type="text"
                        value={editHeaderDesc}
                        onChange={(e) => setEditHeaderDesc(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                  </div>

                  {/* items */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600">
                          <th className="px-2 py-2 text-left font-medium">계정과목</th>
                          <th className="px-2 py-2 text-right font-medium w-28">금액</th>
                          <th className="px-2 py-2 text-left font-medium">적요</th>
                          <th className="px-2 py-2 text-left font-medium w-24">
                            {editTab === "D" ? "납부자" : "거래처"}
                          </th>
                          <th className="px-2 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editItems.map((it) => (
                          <tr key={it.key} className="border-b border-gray-100">
                            <td className="px-2 py-1.5">
                              <select
                                value={it.accountId ?? ""}
                                onChange={(e) =>
                                  updateEditItem(
                                    it.key,
                                    "accountId",
                                    e.target.value ? Number(e.target.value) : null
                                  )
                                }
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                              >
                                <option value="">-- 선택 --</option>
                                {editLeafAccounts.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.code} - {a.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={it.amount}
                                onChange={(e) =>
                                  updateEditItem(it.key, "amount", e.target.value)
                                }
                                onBlur={() => handleEditAmountBlur(it.key, it.amount)}
                                onFocus={() => handleEditAmountFocus(it.key, it.amount)}
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={it.description}
                                onChange={(e) =>
                                  updateEditItem(it.key, "description", e.target.value)
                                }
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={it.counterpart}
                                onChange={(e) =>
                                  updateEditItem(it.key, "counterpart", e.target.value)
                                }
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                onClick={() => removeEditItem(it.key)}
                                className="text-red-400 hover:text-red-600"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-2 py-2 text-right">합계</td>
                          <td
                            className={`px-2 py-2 text-right ${
                              editTab === "D" ? "text-blue-700" : "text-red-700"
                            }`}
                          >
                            {fmtAmount(editTotal)}
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={addEditItem}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm border border-dashed border-gray-400 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    행 추가
                  </button>
                </>
              )}
            </div>

            {/* modal footer */}
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              {!editVoucher.isClosed && (
                <>
                  <button
                    onClick={handleEditDelete}
                    className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    삭제
                  </button>
                  <button
                    onClick={handleEditSave}
                    disabled={editSaving}
                    className="px-5 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors font-medium"
                  >
                    {editSaving ? "저장 중..." : "수정"}
                  </button>
                </>
              )}
              <button
                onClick={closeEditModal}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
