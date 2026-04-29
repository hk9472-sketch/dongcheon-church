// SQL 결과 → 엑셀에서 바로 열리는 CSV 파일로 다운로드.
// UTF-8 BOM 으로 한글 깨짐 방지. 값 안에 콤마/쌍따옴표/줄바꿈 있어도 안전 quoting.

interface SqlSelectResult {
  type: "select" | "execute";
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // 콤마/쌍따옴표/줄바꿈 포함 시 quote + 내부 " 는 ""
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function downloadSqlResultCsv(result: SqlSelectResult, baseName = "query") {
  if (result.type !== "select" || !result.columns || !result.rows) return;
  const cols = result.columns;
  const header = cols.map((c) => csvEscape(c)).join(",");
  const lines = result.rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","));
  const csv = "﻿" + [header, ...lines].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseName}_${fmtTimestamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
