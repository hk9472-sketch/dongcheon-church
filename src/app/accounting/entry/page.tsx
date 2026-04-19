"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type: string; // D=수입, C=지출
  parentId: number | null;
  level: number;
  isActive: boolean;
}

interface VoucherItem {
  key: string; // client-side key
  accountId: number | null;
  amount: string;
  description: string;
  counterpart: string;
}

interface SavedVoucher {
  id: number;
  voucherNo: string;
  type: string;
  date: string;
  description: string;
  totalAmount: number;
  isClosed: boolean;
  items: {
    id: number;
    seq: number;
    accountId: number;
    amount: number;
    description: string;
    counterpart: string;
    account: { code: string; name: string };
  }[];
}

/* ───── helpers ───── */
function todayKST(): string {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmtAmount(n: number): string {
  return n.toLocaleString("ko-KR");
}

function parseAmount(s: string): number {
  return parseInt(s.replace(/[^0-9-]/g, ""), 10) || 0;
}

let keySeq = 0;
function nextKey(): string {
  return `item-${++keySeq}-${Date.now()}`;
}

function emptyItem(): VoucherItem {
  return { key: nextKey(), accountId: null, amount: "", description: "", counterpart: "" };
}

/* ───── component ───── */
export default function VoucherEntryPage() {
  // tab: D=수입, C=지출
  const [tab, setTab] = useState<"D" | "C">("D");
  const [units, setUnits] = useState<AccUnit[]>([]);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<AccAccount[]>([]);
  const [date, setDate] = useState(todayKST());
  const [voucherNo, setVoucherNo] = useState("");
  const [headerDesc, setHeaderDesc] = useState("");
  const [items, setItems] = useState<VoucherItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // editing existing voucher
  const [editingId, setEditingId] = useState<number | null>(null);

  // today's vouchers
  const [todayVouchers, setTodayVouchers] = useState<SavedVoucher[]>([]);

  /* ────── 엑셀 업로드 (일괄 등록) ────── */
  interface ImportRow {
    rowIndex: number;
    unitRaw: string;
    typeRaw: string;
    dateRaw: string;
    headerDesc: string;
    accountRaw: string;
    amountRaw: string;
    description: string;
    unitId: number | null;
    type: "D" | "C" | null;
    date: string | null;
    accountId: number | null;
    amount: number | null;
    errors: string[];
  }
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---- fetch units ---- */
  useEffect(() => {
    fetch("/api/accounting/units")
      .then((r) => r.json())
      .then((d: AccUnit[]) => {
        if (Array.isArray(d) && d.length > 0) {
          setUnits(d);
          setUnitId(d[0].id);
        }
      })
      .catch(() => {});
  }, []);

  /* ---- fetch accounts when unit changes ---- */
  useEffect(() => {
    if (!unitId) return;
    fetch(`/api/accounting/accounts?unitId=${unitId}`)
      .then((r) => r.json())
      .then((d: AccAccount[]) => {
        if (Array.isArray(d)) setAccounts(d);
      })
      .catch(() => setAccounts([]));
  }, [unitId]);

  /* ---- fetch next voucher no ---- */
  const fetchNextNo = useCallback(() => {
    if (!unitId || !date) return;
    fetch(`/api/accounting/vouchers/next-no?unitId=${unitId}&date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.voucherNo) setVoucherNo(d.voucherNo);
      })
      .catch(() => {});
  }, [unitId, date]);

  useEffect(() => {
    if (!editingId) fetchNextNo();
  }, [fetchNextNo, editingId]);

  /* ---- fetch today's vouchers ---- */
  const fetchTodayVouchers = useCallback(() => {
    if (!unitId) return;
    fetch(
      `/api/accounting/vouchers?unitId=${unitId}&dateFrom=${date}&dateTo=${date}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setTodayVouchers(d);
        else if (d.vouchers) setTodayVouchers(d.vouchers);
      })
      .catch(() => setTodayVouchers([]));
  }, [unitId, date]);

  useEffect(() => {
    fetchTodayVouchers();
  }, [fetchTodayVouchers]);

  /* ---- filtered leaf accounts for current tab ---- */
  const leafAccounts = useMemo(() => {
    const parentIds = new Set(
      accounts.filter((a) => a.parentId !== null).map((a) => a.parentId)
    );
    return accounts.filter(
      (a) => a.type === tab && a.isActive && !parentIds.has(a.id)
    );
  }, [accounts, tab]);

  /* ---- total ---- */
  const total = useMemo(
    () => items.reduce((s, it) => s + parseAmount(it.amount), 0),
    [items]
  );

  /* ---- grid navigation ---- */
  const COLS = ["account", "amount", "desc", "counter"] as const;
  const tableRef = useRef<HTMLTableSectionElement>(null);

  function getCell(row: number, col: number): HTMLElement | null {
    if (!tableRef.current) return null;
    const tr = tableRef.current.children[row] as HTMLTableRowElement | undefined;
    if (!tr) return null;
    const td = tr.children[col] as HTMLTableCellElement | undefined;
    if (!td) return null;
    return td.querySelector("select, input") as HTMLElement | null;
  }

  function handleCellKeyDown(
    e: React.KeyboardEvent,
    rowIdx: number,
    colIdx: number
  ) {
    const { key } = e;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return;

    // select 요소에서 좌우 화살표는 드롭다운 조작이므로 무시
    if (
      (key === "ArrowLeft" || key === "ArrowRight") &&
      (e.target as HTMLElement).tagName === "SELECT"
    ) return;

    // input에서 좌우 화살표는 커서가 텍스트 양끝에 있을 때만 셀 이동
    if (key === "ArrowLeft" || key === "ArrowRight") {
      const input = e.target as HTMLInputElement;
      if (input.tagName === "INPUT") {
        const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
        const atEnd =
          input.selectionStart === input.value.length &&
          input.selectionEnd === input.value.length;
        if (key === "ArrowLeft" && !atStart) return;
        if (key === "ArrowRight" && !atEnd) return;
      }
    }

    e.preventDefault();
    let nextRow = rowIdx;
    let nextCol = colIdx;

    if (key === "ArrowUp") nextRow = Math.max(0, rowIdx - 1);
    if (key === "ArrowDown") nextRow = rowIdx + 1;
    if (key === "ArrowLeft") nextCol = Math.max(0, colIdx - 1);
    if (key === "ArrowRight") nextCol = Math.min(COLS.length - 1, colIdx + 1);

    // 마지막 행에서 아래로 → 행 추가
    if (key === "ArrowDown" && nextRow >= items.length) {
      setItems((prev) => [...prev, emptyItem()]);
      requestAnimationFrame(() => {
        getCell(nextRow, nextCol)?.focus();
      });
      return;
    }

    getCell(nextRow, nextCol)?.focus();
  }

  /* ---- auto-add row when editing last row ---- */
  function handleLastRowEdit(rowIdx: number) {
    if (rowIdx === items.length - 1) {
      setItems((prev) => [...prev, emptyItem()]);
    }
  }

  /* ---- item handlers ---- */
  function updateItem(key: string, field: keyof VoucherItem, value: string | number | null) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, [field]: value } : it))
    );
  }

  function removeItem(key: string) {
    setItems((prev) => {
      const next = prev.filter((it) => it.key !== key);
      return next.length === 0 ? [emptyItem()] : next;
    });
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  /* ---- reset form ---- */
  function resetForm() {
    setEditingId(null);
    setHeaderDesc("");
    setItems([emptyItem()]);
    setMessage(null);
    fetchNextNo();
  }

  /* ---- populate form for editing ---- */
  function loadVoucher(v: SavedVoucher) {
    setEditingId(v.id);
    setTab(v.type as "D" | "C");
    setDate(v.date.slice(0, 10));
    setVoucherNo(v.voucherNo);
    setHeaderDesc(v.description || "");
    setItems(
      v.items.map((it) => ({
        key: nextKey(),
        accountId: it.accountId,
        amount: String(it.amount),
        description: it.description || "",
        counterpart: it.counterpart || "",
      }))
    );
    if (v.isClosed) {
      setMessage({ type: "err", text: "마감된 전표는 수정할 수 없습니다." });
    } else {
      setMessage(null);
    }
  }

  /* ---- save (create or update) ---- */
  async function handleSave() {
    if (!unitId) return;
    const validItems = items.filter((it) => it.accountId && parseAmount(it.amount) > 0);
    if (validItems.length === 0) {
      setMessage({ type: "err", text: "최소 1개 이상의 항목을 입력하세요." });
      return;
    }

    setSaving(true);
    setMessage(null);

    const payload = {
      unitId,
      type: tab,
      date,
      description: headerDesc,
      items: validItems.map((it, i) => ({
        seq: i + 1,
        accountId: it.accountId,
        amount: parseAmount(it.amount),
        description: it.description,
        counterpart: it.counterpart,
      })),
    };

    try {
      let res: Response;
      if (editingId) {
        res = await fetch(`/api/accounting/vouchers/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/accounting/vouchers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "저장에 실패했습니다.");
      }

      setMessage({
        type: "ok",
        text: editingId ? "전표가 수정되었습니다." : "전표가 저장되었습니다.",
      });
      resetForm();
      fetchTodayVouchers();
    } catch (e: unknown) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "오류가 발생했습니다." });
    } finally {
      setSaving(false);
    }
  }

  /* ---- delete ---- */
  async function handleDelete() {
    if (!editingId) return;
    if (!confirm("이 전표를 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`/api/accounting/vouchers/${editingId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "삭제에 실패했습니다.");
      }
      setMessage({ type: "ok", text: "전표가 삭제되었습니다." });
      resetForm();
      fetchTodayVouchers();
    } catch (e: unknown) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "오류가 발생했습니다." });
    }
  }

  /* ---- amount blur formatting ---- */
  function handleAmountBlur(key: string, raw: string) {
    const n = parseAmount(raw);
    if (n > 0) {
      updateItem(key, "amount", fmtAmount(n));
    }
  }

  function handleAmountFocus(key: string, raw: string) {
    const n = parseAmount(raw);
    updateItem(key, "amount", n > 0 ? String(n) : "");
  }

  /* ────── 엑셀 템플릿 다운로드 (CSV, UTF-8 BOM — 엑셀에서 바로 열림) ────── */
  function handleDownloadTemplate() {
    const headers = [
      "회계단위",
      "수입지출구분",
      "전표일자",
      "전표적요",
      "계정과목",
      "금액",
      "적요",
    ];
    const sample = [
      units[0]?.code || units[0]?.name || "본회계",
      "수입",
      todayKST(),
      "주일헌금",
      leafAccounts[0]?.code || "",
      "100000",
      "샘플 적요",
    ];
    const csv =
      "\uFEFF" +
      [headers.join(","), sample.map((s) => `"${String(s).replace(/"/g, '""')}"`).join(",")].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "voucher-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ────── 엑셀 파일 선택 → 서버로 전송하여 파싱 미리보기 ────── */
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImportMsg(null);
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/accounting/voucher/import", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "파싱 실패");
      setImportRows(data.rows || []);
      if (data.errorCount > 0) {
        setImportMsg({
          type: "err",
          text: `총 ${data.total}행 중 ${data.errorCount}개 행에 오류가 있습니다. 오류 행은 저장되지 않습니다.`,
        });
      } else {
        setImportMsg({ type: "ok", text: `총 ${data.total}행을 검사했습니다. 확인 후 "일괄 등록" 을 눌러주세요.` });
      }
    } catch (err: unknown) {
      setImportMsg({
        type: "err",
        text: err instanceof Error ? err.message : "업로드 실패",
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /* ────── 일괄 등록 (미리보기에서 오류 없는 행만 전송) ────── */
  async function handleBulkCommit() {
    if (!importRows || importRows.length === 0) return;
    const valid = importRows.filter((r) => r.errors.length === 0);
    if (valid.length === 0) {
      setImportMsg({ type: "err", text: "저장할 유효한 행이 없습니다." });
      return;
    }
    if (!confirm(`${valid.length}개 행을 전표로 등록합니다. 진행할까요?`)) return;

    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch("/api/accounting/voucher/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          rows: valid.map((r) => ({
            unitId: r.unitId,
            type: r.type,
            date: r.date,
            headerDesc: r.headerDesc,
            accountId: r.accountId,
            amount: r.amount,
            description: r.description,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "등록 실패");
      setImportMsg({
        type: "ok",
        text: `${data.count}건의 전표가 등록되었습니다.`,
      });
      setImportRows(null);
      fetchTodayVouchers();
    } catch (err: unknown) {
      setImportMsg({
        type: "err",
        text: err instanceof Error ? err.message : "등록 실패",
      });
    } finally {
      setImporting(false);
    }
  }

  /* ======================================== render ======================================== */
  return (
    <div className="space-y-6">
      {/* title + 엑셀 업로드 도구 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">전표입력 <HelpButton slug="accounting-entry" /></h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            title="엑셀 업로드용 양식을 다운로드합니다 (CSV, 엑셀에서 열림)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M4 6h16M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
            </svg>
            양식 다운로드
          </button>
          <label
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg text-white cursor-pointer transition-colors ${
              importing ? "bg-emerald-400" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
            </svg>
            {importing ? "처리 중..." : "엑셀 업로드"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              disabled={importing}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1">
        {(["D", "C"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (!editingId) {
                setItems([emptyItem()]);
              }
            }}
            className={`px-6 py-2.5 rounded-t-lg text-sm font-semibold transition-colors ${
              tab === t
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

      {/* form card */}
      <div className={`bg-white rounded-lg shadow-sm border-t-4 ${
        tab === "D" ? "border-blue-500" : "border-red-500"
      } p-4 md:p-6 space-y-4`}>
        {/* message */}
        {message && (
          <div
            className={`px-4 py-2.5 rounded-lg text-sm ${
              message.type === "ok"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* header fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 회계단위 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              회계단위
            </label>
            <select
              value={unitId ?? ""}
              onChange={(e) => {
                setUnitId(Number(e.target.value));
                if (!editingId) resetForm();
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* 전표번호 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              전표번호
            </label>
            <input
              type="text"
              readOnly
              value={voucherNo}
              className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500"
            />
          </div>

          {/* 거래일자 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              전표일자
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          {/* 전표적요 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              전표적요
            </label>
            <input
              type="text"
              value={headerDesc}
              onChange={(e) => setHeaderDesc(e.target.value)}
              placeholder="전표 전체에 대한 적요"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
        </div>

        {/* items table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="px-2 py-2 text-left font-medium w-1/4">계정과목</th>
                <th className="px-2 py-2 text-right font-medium w-32">금액</th>
                <th className="px-2 py-2 text-left font-medium">적요</th>
                <th className="px-2 py-2 text-left font-medium w-32">
                  {tab === "D" ? "납부자" : "거래처"}
                </th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody ref={tableRef}>
              {items.map((it, rowIdx) => (
                <tr key={it.key} className="border-b border-gray-100">
                  {/* 계정과목 */}
                  <td className="px-2 py-1.5">
                    <select
                      value={it.accountId ?? ""}
                      onChange={(e) => {
                        updateItem(
                          it.key,
                          "accountId",
                          e.target.value ? Number(e.target.value) : null
                        );
                        handleLastRowEdit(rowIdx);
                      }}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIdx, 0)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    >
                      <option value="">-- 선택 --</option>
                      {leafAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* 금액 */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={it.amount}
                      onChange={(e) => {
                        updateItem(it.key, "amount", e.target.value);
                        handleLastRowEdit(rowIdx);
                      }}
                      onBlur={() => handleAmountBlur(it.key, it.amount)}
                      onFocus={() => handleAmountFocus(it.key, it.amount)}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIdx, 1)}
                      placeholder="0"
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </td>

                  {/* 적요 */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={it.description}
                      onChange={(e) => {
                        updateItem(it.key, "description", e.target.value);
                        handleLastRowEdit(rowIdx);
                      }}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIdx, 2)}
                      placeholder="항목 적요"
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </td>

                  {/* 납부자/거래처 */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={it.counterpart}
                      onChange={(e) => {
                        updateItem(it.key, "counterpart", e.target.value);
                        handleLastRowEdit(rowIdx);
                      }}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIdx, 3)}
                      placeholder={tab === "D" ? "납부자" : "거래처"}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </td>

                  {/* 삭제 */}
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => removeItem(it.key)}
                      className="text-red-400 hover:text-red-600 transition-colors"
                      title="삭제"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}

              {/* 합계 */}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-2 py-2 text-right">합계</td>
                <td className={`px-2 py-2 text-right ${tab === "D" ? "text-blue-700" : "text-red-700"}`}>
                  {fmtAmount(total)}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* add row + action buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={addItem}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-dashed border-gray-400 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            행 추가
          </button>

          <div className="flex-1" />

          {editingId && (
            <>
              <button
                onClick={handleDelete}
                className="px-5 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                삭제
              </button>
              <button
                onClick={resetForm}
                className="px-5 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
            </>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? "저장 중..." : editingId ? "수정" : "저장"}
          </button>
        </div>
      </div>

      {/* ─── today's vouchers ─── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-bold text-gray-700">
            오늘의 전표 ({date})
          </h2>
        </div>

        {todayVouchers.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            오늘 입력된 전표가 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {todayVouchers.map((v) => (
              <button
                key={v.id}
                onClick={() => loadVoucher(v)}
                className={`w-full text-left px-4 py-3 hover:bg-teal-50 transition-colors ${
                  editingId === v.id ? "bg-teal-50 ring-1 ring-teal-300" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* type badge */}
                  <span
                    className={`shrink-0 px-2 py-0.5 text-xs font-bold rounded ${
                      v.type === "D"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {v.type === "D" ? "수입" : "지출"}
                  </span>

                  {/* voucher no */}
                  <span className="text-sm font-mono text-gray-600">
                    {v.voucherNo}
                  </span>

                  {/* items summary */}
                  <span className="text-sm text-gray-500 truncate flex-1">
                    {v.items
                      .map(
                        (it) =>
                          `${it.account?.name || ""} ${fmtAmount(it.amount)}`
                      )
                      .join(", ")}
                  </span>

                  {/* total */}
                  <span
                    className={`shrink-0 text-sm font-semibold ${
                      v.type === "D" ? "text-blue-700" : "text-red-700"
                    }`}
                  >
                    {fmtAmount(v.totalAmount)}
                  </span>

                  {/* closed icon */}
                  {v.isClosed && (
                    <svg
                      className="w-4 h-4 text-gray-400 shrink-0"
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
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── 엑셀 업로드 미리보기 모달 ─── */}
      {importRows !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-800">
                엑셀 업로드 미리보기 ({importRows.length}행)
              </h2>
              <button
                onClick={() => {
                  setImportRows(null);
                  setImportMsg(null);
                }}
                className="text-gray-400 hover:text-gray-600"
                title="닫기"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {importMsg && (
              <div
                className={`mx-5 mt-3 px-3 py-2 rounded text-sm ${
                  importMsg.type === "ok"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {importMsg.text}
              </div>
            )}

            <div className="flex-1 overflow-auto p-5">
              <table className="w-full text-xs border border-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-gray-600">
                    <th className="px-2 py-1.5 border-b text-center w-10">행</th>
                    <th className="px-2 py-1.5 border-b text-left">회계단위</th>
                    <th className="px-2 py-1.5 border-b text-center w-16">구분</th>
                    <th className="px-2 py-1.5 border-b text-left w-24">일자</th>
                    <th className="px-2 py-1.5 border-b text-left">전표적요</th>
                    <th className="px-2 py-1.5 border-b text-left">계정과목</th>
                    <th className="px-2 py-1.5 border-b text-right w-24">금액</th>
                    <th className="px-2 py-1.5 border-b text-left">적요</th>
                    <th className="px-2 py-1.5 border-b text-left">검증</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r) => (
                    <tr
                      key={r.rowIndex}
                      className={
                        r.errors.length > 0
                          ? "bg-red-50"
                          : "hover:bg-gray-50"
                      }
                    >
                      <td className="px-2 py-1 border-b text-center text-gray-500">{r.rowIndex}</td>
                      <td className="px-2 py-1 border-b">{r.unitRaw}</td>
                      <td className="px-2 py-1 border-b text-center">{r.typeRaw}</td>
                      <td className="px-2 py-1 border-b">{r.dateRaw}</td>
                      <td className="px-2 py-1 border-b">{r.headerDesc}</td>
                      <td className="px-2 py-1 border-b">{r.accountRaw}</td>
                      <td className="px-2 py-1 border-b text-right">{r.amountRaw}</td>
                      <td className="px-2 py-1 border-b">{r.description}</td>
                      <td className="px-2 py-1 border-b">
                        {r.errors.length === 0 ? (
                          <span className="text-emerald-600">OK</span>
                        ) : (
                          <span className="text-red-600">{r.errors.join(", ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setImportRows(null);
                  setImportMsg(null);
                }}
                className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleBulkCommit}
                disabled={
                  importing ||
                  importRows.filter((r) => r.errors.length === 0).length === 0
                }
                className="px-4 py-1.5 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors font-medium"
              >
                {importing
                  ? "등록 중..."
                  : `일괄 등록 (${importRows.filter((r) => r.errors.length === 0).length}건)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
