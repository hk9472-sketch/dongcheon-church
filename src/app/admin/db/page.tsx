"use client";

import { useCallback, useEffect, useState } from "react";
import BoardMigration from "./BoardMigration";
import HelpButton from "@/components/HelpButton";

type Tab = "visitor-stats" | "site-settings" | "visit-logs" | "import" | "board-migrate" | "user-migrate";

interface VisitorStat {
  id: number;
  date: string;
  count: number;
}

interface SiteSetting {
  id: number;
  key: string;
  value: string;
}

interface VisitLogEntry {
  id: number;
  ip: string;
  path: string;
  referer: string | null;
  userAgent: string | null;
  userId: number | null;
  createdAt: string;
}

// SQL 덤프에서 counter 테이블 INSERT 문을 파싱하여 JSON 데이터로 변환 (클라이언트)
interface ParsedCounterData {
  counterMain: { date: number; unique_counter: number; pageview: number }[];
  counterIp: { date: number; ip: string }[];
  counterReferer: { date: number; hit: number; referer: string }[];
}

function parseCounterSqlClient(sql: string): ParsedCounterData {
  const result: ParsedCounterData = { counterMain: [], counterIp: [], counterReferer: [] };

  // 단일/멀티 로우 INSERT 모두 지원:
  //   INSERT INTO `counter_main` VALUES (1, 20230101, 5, 10);
  //   INSERT INTO `counter_main` VALUES (1, 20230101, 5, 10), (2, 20230102, 8, 15);
  const lines = sql.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("INSERT INTO")) continue;

    // 어떤 테이블인지 판별
    let tableName = "";
    if (/counter_main/i.test(trimmed)) tableName = "counter_main";
    else if (/counter_ip/i.test(trimmed)) tableName = "counter_ip";
    else if (/counter_referer/i.test(trimmed)) tableName = "counter_referer";
    else continue;

    // VALUES 이후의 전체 문자열 추출
    const valuesIdx = trimmed.search(/VALUES\s*/i);
    if (valuesIdx === -1) continue;
    const afterValues = trimmed.substring(valuesIdx).replace(/^VALUES\s*/i, "").replace(/;\s*$/, "");

    // 개별 (...) 로우 추출: 괄호 안에 문자열('...')이 있을 수 있으므로 상태 기반 파싱
    const rows = extractRowGroups(afterValues);

    for (const rowStr of rows) {
      const vals = parseValueList(rowStr);
      if (tableName === "counter_main" && vals.length >= 4) {
        const date = Number(vals[1]);
        if (date > 0) result.counterMain.push({ date, unique_counter: Number(vals[2]) || 0, pageview: Number(vals[3]) || 0 });
      } else if (tableName === "counter_ip" && vals.length >= 3) {
        const date = Number(vals[1]);
        if (date > 0) result.counterIp.push({ date, ip: String(vals[2] || "") });
      } else if (tableName === "counter_referer" && vals.length >= 4) {
        const date = Number(vals[1]);
        if (date > 0) result.counterReferer.push({ date, hit: Number(vals[2]) || 0, referer: String(vals[3] || "") });
      }
    }
  }
  return result;
}

// "(...), (...), (...)" 형태에서 각 괄호 안의 내용을 추출 (substring으로 O(n) 최적화)
function extractRowGroups(str: string): string[] {
  const rows: string[] = [];
  let i = 0;
  while (i < str.length) {
    while (i < str.length && str[i] !== "(") i++;
    if (i >= str.length) break;
    i++; // '(' 건너뛰기
    const start = i;
    let depth = 1;
    let inString = false;
    let escape = false;
    while (i < str.length && depth > 0) {
      const ch = str[i];
      if (escape) { escape = false; i++; continue; }
      if (ch === "\\") { escape = true; i++; continue; }
      if (ch === "'") { inString = !inString; i++; continue; }
      if (inString) { i++; continue; }
      if (ch === "(") depth++;
      if (ch === ")") { depth--; if (depth === 0) break; }
      i++;
    }
    if (i > start) rows.push(str.substring(start, i));
    i++; // ')' 건너뛰기
  }
  return rows;
}

// SQL VALUES 목록에서 개별 값 추출 (substring으로 O(n) 최적화)
function parseValueList(str: string): (string | null)[] {
  const vals: (string | null)[] = [];
  let i = 0;
  while (i < str.length) {
    while (i < str.length && (str[i] === " " || str[i] === "\t")) i++;
    if (i >= str.length) break;
    if (str[i] === "'") {
      i++;
      const parts: string[] = [];
      let start = i;
      while (i < str.length) {
        if (str[i] === "\\" && i + 1 < str.length) { parts.push(str.substring(start, i)); parts.push(str[i + 1]); i += 2; start = i; }
        else if (str[i] === "'" && i + 1 < str.length && str[i + 1] === "'") { parts.push(str.substring(start, i)); parts.push("'"); i += 2; start = i; }
        else if (str[i] === "'") { parts.push(str.substring(start, i)); i++; break; }
        else { i++; }
      }
      vals.push(parts.join(""));
    } else if (str.substring(i, i + 4).toUpperCase() === "NULL") {
      vals.push(null); i += 4;
    } else {
      const start = i;
      while (i < str.length && str[i] !== ",") i++;
      vals.push(str.substring(start, i).trim());
    }
    while (i < str.length && (str[i] === " " || str[i] === "\t")) i++;
    if (i < str.length && str[i] === ",") i++;
  }
  return vals;
}

export default function AdminDbPage() {
  const [tab, setTab] = useState<Tab>("visitor-stats");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");

  // Data states
  const [visitorStats, setVisitorStats] = useState<VisitorStat[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSetting[]>([]);
  const [visitLogs, setVisitLogs] = useState<VisitLogEntry[]>([]);

  // Edit states
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newSettingKey, setNewSettingKey] = useState("");
  const [newSettingValue, setNewSettingValue] = useState("");
  const [message, setMessage] = useState("");

  // Import states
  const [importDb, setImportDb] = useState("pkistdc");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState("");
  const [importConnInfo, setImportConnInfo] = useState<ConnInfo>({
    host: "", port: 3306, user: "", password: "", database: "",
  });
  const [importConnStatus, setImportConnStatus] = useState("");
  // SQL 파일 이관 상태
  const [importSqlFile, setImportSqlFile] = useState<File | null>(null);
  const [importParsedData, setImportParsedData] = useState<ParsedCounterData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tab,
        page: String(page),
        ...(keyword && tab === "visit-logs" ? { keyword } : {}),
      });
      const res = await fetch(`/api/admin/db?${params}`);
      const data = await res.json();

      if (tab === "visitor-stats") {
        setVisitorStats(data.records || []);
      } else if (tab === "site-settings") {
        setSiteSettings(data.records || []);
      } else if (tab === "visit-logs") {
        setVisitLogs(data.records || []);
      }
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setMessage("데이터 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [tab, page, keyword]);

  useEffect(() => {
    if (tab !== "import" && tab !== "board-migrate" && tab !== "user-migrate") {
      fetchData();
    }
  }, [tab, page, fetchData]);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  };

  // -- 방문자 카운트 수정 --
  const handleUpdateCount = async (id: number) => {
    const res = await fetch("/api/admin/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update-visitor-count",
        id,
        count: parseInt(editValue, 10),
      }),
    });
    const data = await res.json();
    if (data.success) {
      setEditingId(null);
      showMessage("수정 완료");
      fetchData();
    } else {
      showMessage(data.error || "수정 실패");
    }
  };

  // -- 사이트 설정 추가/수정 --
  const handleUpsertSetting = async (key: string, value: string) => {
    const res = await fetch("/api/admin/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert-setting", key, value }),
    });
    const data = await res.json();
    if (data.success) {
      setEditingId(null);
      setNewSettingKey("");
      setNewSettingValue("");
      showMessage("저장 완료");
      fetchData();
    } else {
      showMessage(data.error || "저장 실패");
    }
  };

  // -- 삭제 --
  const handleDelete = async (tabName: string, ids: number[]) => {
    if (!confirm(`${ids.length}건을 삭제하시겠습니까?`)) return;
    const res = await fetch("/api/admin/db", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab: tabName, ids }),
    });
    const data = await res.json();
    if (data.success) {
      showMessage(`${data.count}건 삭제 완료`);
      fetchData();
    } else {
      showMessage(data.error || "삭제 실패");
    }
  };

  // -- 전체 로그 삭제 --
  const handleDeleteAllLogs = async () => {
    if (!confirm("모든 방문 로그를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."))
      return;
    const res = await fetch("/api/admin/db", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab: "visit-logs-all" }),
    });
    const data = await res.json();
    if (data.success) {
      showMessage(`${data.count}건 삭제 완료`);
      fetchData();
    } else {
      showMessage(data.error || "삭제 실패");
    }
  };

  // -- 접속 테스트 (방문 데이터) --
  const handleImportTestConn = async () => {
    setImportConnStatus("테스트 중...");
    try {
      const res = await fetch("/api/admin/db/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "test-connection", connectionInfo: importConnInfo }),
      });
      const data = await res.json();
      setImportConnStatus(
        data.success
          ? `접속 성공${data.hasCounterTable ? " (counter_main 확인)" : " (counter_main 없음)"}`
          : `오류: ${data.error}`
      );
    } catch (e) {
      setImportConnStatus(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // -- 테이블 초기화 --
  const handleTruncate = async (tableName: string, label: string) => {
    if (!confirm(`[${label}] 테이블의 모든 데이터를 삭제하고 AUTO_INCREMENT를 초기화하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      const res = await fetch("/api/admin/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "truncate-table", tableName }),
      });
      const data = await res.json();
      showMessage(data.success ? data.message : `오류: ${data.error}`);
    } catch (e) {
      showMessage(`초기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // -- SQL 파일 이관 (방문 데이터) --
  const handleImportSqlFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportSqlFile(file);
    setImportParsedData(null);
    setImportResult("");
    setImportLoading(true);
    try {
      const chunk = await file.slice(0, 10240).arrayBuffer();
      let enc = "utf-8";
      try { new TextDecoder("utf-8", { fatal: true }).decode(chunk); }
      catch { enc = "euc-kr"; }
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder(enc).decode(buffer);
      const parsed = parseCounterSqlClient(text);
      const total = parsed.counterMain.length + parsed.counterIp.length + parsed.counterReferer.length;
      if (total === 0) {
        setImportResult("파일에서 counter 테이블 INSERT 문을 찾을 수 없습니다.");
      } else {
        setImportParsedData(parsed);
        setImportResult(`파싱 완료: counter_main ${parsed.counterMain.length.toLocaleString()}건, counter_ip ${parsed.counterIp.length.toLocaleString()}건, counter_referer ${parsed.counterReferer.length.toLocaleString()}건`);
      }
    } catch (err) {
      setImportResult(`파일 읽기 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportSql = async () => {
    if (!importParsedData) return;
    const pd = importParsedData;
    if (!confirm(
      `SQL 파일 데이터를 이관하시겠습니까?\n\ncounter_main: ${pd.counterMain.length.toLocaleString()}건\ncounter_ip: ${pd.counterIp.length.toLocaleString()}건\ncounter_referer: ${pd.counterReferer.length.toLocaleString()}건`
    )) return;
    setImportLoading(true);
    setImportResult("이관 중...");

    // 청크 단위로 전송 (한 번에 5000건씩)
    const CHUNK = 5000;
    const results = { counterMain: 0, counterIp: 0, counterReferer: 0, errors: [] as string[] };

    try {
      // counter_main 전송
      for (let i = 0; i < pd.counterMain.length; i += CHUNK) {
        const chunk = pd.counterMain.slice(i, i + CHUNK);
        const res = await fetch("/api/admin/db/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "json", counterMain: chunk }),
        });
        const data = await res.json();
        if (data.success) results.counterMain += data.results?.counterMain || chunk.length;
        else results.errors.push(data.error || "counter_main 실패");
        setImportResult(`이관 중... counter_main ${Math.min(i + CHUNK, pd.counterMain.length)}/${pd.counterMain.length}`);
      }

      // counter_ip 전송
      for (let i = 0; i < pd.counterIp.length; i += CHUNK) {
        const chunk = pd.counterIp.slice(i, i + CHUNK);
        const res = await fetch("/api/admin/db/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "json", counterIp: chunk }),
        });
        const data = await res.json();
        if (data.success) results.counterIp += data.results?.counterIp || chunk.length;
        else results.errors.push(data.error || "counter_ip 실패");
        setImportResult(`이관 중... counter_ip ${Math.min(i + CHUNK, pd.counterIp.length)}/${pd.counterIp.length}`);
      }

      // counter_referer 전송
      for (let i = 0; i < pd.counterReferer.length; i += CHUNK) {
        const chunk = pd.counterReferer.slice(i, i + CHUNK);
        const res = await fetch("/api/admin/db/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "json", counterReferer: chunk }),
        });
        const data = await res.json();
        if (data.success) results.counterReferer += data.results?.counterReferer || chunk.length;
        else results.errors.push(data.error || "counter_referer 실패");
        setImportResult(`이관 중... counter_referer ${Math.min(i + CHUNK, pd.counterReferer.length)}/${pd.counterReferer.length}`);
      }

      setImportResult(
        `이관 완료: counter_main ${results.counterMain.toLocaleString()}건, counter_ip ${results.counterIp.toLocaleString()}건, counter_referer ${results.counterReferer.toLocaleString()}건` +
        (results.errors.length ? `\n\n오류:\n${results.errors.join("\n")}` : "")
      );
      setImportParsedData(null);
    } catch (e) {
      setImportResult(`이관 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImportLoading(false);
    }
  };

  // -- 데이터 이관 --
  const handleImport = async (method: "direct" | "json", jsonData?: string) => {
    setImportLoading(true);
    setImportResult("");
    try {
      let body;
      if (method === "direct") {
        body = {
          source: "direct",
          legacyDb: importDb,
          ...(importConnInfo.host ? { connectionInfo: importConnInfo } : {}),
        };
      } else {
        const parsed = JSON.parse(jsonData || "{}");
        body = { source: "json", ...parsed };
      }

      const res = await fetch("/api/admin/db/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(
          `${data.message}\n${data.results?.errors?.length ? "\n오류:\n" + data.results.errors.join("\n") : ""}`
        );
      } else {
        setImportResult(`오류: ${data.error}\n${data.detail || ""}`);
      }
    } catch (e) {
      setImportResult(`이관 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImportLoading(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "visitor-stats", label: "방문자 통계" },
    { key: "site-settings", label: "사이트 설정" },
    { key: "visit-logs", label: "방문 로그" },
    { key: "import", label: "방문 데이터 이관" },
    { key: "board-migrate", label: "게시판 이관" },
    { key: "user-migrate", label: "사용자 이관" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">DB 관리 <HelpButton slug="admin-db" /></h1>

      {message && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded text-sm">
          {message}
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setPage(1);
              setKeyword("");
              setEditingId(null);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 방문자 통계 탭 */}
      {tab === "visitor-stats" && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">
              일별 방문자 카운트 ({total}건)
            </h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">로딩 중...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-xs">
                  <th className="py-2 px-4 text-left font-medium">ID</th>
                  <th className="py-2 px-4 text-left font-medium">날짜</th>
                  <th className="py-2 px-4 text-right font-medium">방문자 수</th>
                  <th className="py-2 px-4 text-center font-medium">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visitorStats.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="py-2 px-4 text-gray-400 text-xs">{r.id}</td>
                    <td className="py-2 px-4">{r.date}</td>
                    <td className="py-2 px-4 text-right">
                      {editingId === r.id ? (
                        <input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-24 border rounded px-2 py-1 text-right text-sm"
                        />
                      ) : (
                        r.count.toLocaleString()
                      )}
                    </td>
                    <td className="py-2 px-4 text-center space-x-1">
                      {editingId === r.id ? (
                        <>
                          <button
                            onClick={() => handleUpdateCount(r.id)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-gray-500 hover:underline"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(r.id);
                              setEditValue(String(r.count));
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDelete("visitor-stats", [r.id])}
                            className="text-xs text-red-500 hover:underline"
                          >
                            삭제
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {visitorStats.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-400">
                      데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* 사이트 설정 탭 */}
      {tab === "site-settings" && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-700">
              사이트 설정 ({total}건)
            </h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">로딩 중...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-xs">
                  <th className="py-2 px-4 text-left font-medium">ID</th>
                  <th className="py-2 px-4 text-left font-medium">키 (key)</th>
                  <th className="py-2 px-4 text-left font-medium">값 (value)</th>
                  <th className="py-2 px-4 text-center font-medium">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {siteSettings.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="py-2 px-4 text-gray-400 text-xs">{r.id}</td>
                    <td className="py-2 px-4 font-mono text-xs">{r.key}</td>
                    <td className="py-2 px-4">
                      {editingId === r.id ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full border rounded px-2 py-1 text-sm"
                        />
                      ) : (
                        <span className="break-all">{r.value}</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-center space-x-1">
                      {editingId === r.id ? (
                        <>
                          <button
                            onClick={() =>
                              handleUpsertSetting(r.key, editValue)
                            }
                            className="text-xs text-blue-600 hover:underline"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-gray-500 hover:underline"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(r.id);
                              setEditValue(r.value);
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            수정
                          </button>
                          <button
                            onClick={() =>
                              handleDelete("site-settings", [r.id])
                            }
                            className="text-xs text-red-500 hover:underline"
                          >
                            삭제
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {siteSettings.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-400">
                      설정이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* 새 설정 추가 */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
            <h3 className="text-xs font-bold text-gray-600 mb-2">새 설정 추가</h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="키"
                value={newSettingKey}
                onChange={(e) => setNewSettingKey(e.target.value)}
                className="border rounded px-2 py-1 text-sm flex-1"
              />
              <input
                type="text"
                placeholder="값"
                value={newSettingValue}
                onChange={(e) => setNewSettingValue(e.target.value)}
                className="border rounded px-2 py-1 text-sm flex-1"
              />
              <button
                onClick={() => {
                  if (newSettingKey.trim()) {
                    handleUpsertSetting(newSettingKey.trim(), newSettingValue);
                  }
                }}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 방문 로그 탭 */}
      {tab === "visit-logs" && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-bold text-gray-700">
              방문 로그 ({total.toLocaleString()}건)
            </h2>
            <div className="flex gap-2">
              <div className="flex">
                <input
                  type="text"
                  placeholder="IP, 경로, 리퍼러 검색"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setPage(1);
                      fetchData();
                    }
                  }}
                  className="border rounded-l px-2 py-1 text-sm w-48"
                />
                <button
                  onClick={() => {
                    setPage(1);
                    fetchData();
                  }}
                  className="px-3 py-1 bg-gray-600 text-white text-sm rounded-r hover:bg-gray-700"
                >
                  검색
                </button>
              </div>
              <button
                onClick={handleDeleteAllLogs}
                className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
              >
                전체 삭제
              </button>
            </div>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">로딩 중...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs">
                    <th className="py-2 px-3 text-left font-medium">ID</th>
                    <th className="py-2 px-3 text-left font-medium">IP</th>
                    <th className="py-2 px-3 text-left font-medium">경로</th>
                    <th className="py-2 px-3 text-left font-medium">리퍼러</th>
                    <th className="py-2 px-3 text-left font-medium">일시</th>
                    <th className="py-2 px-3 text-center font-medium">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visitLogs.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="py-1.5 px-3 text-gray-400 text-xs">
                        {r.id}
                      </td>
                      <td className="py-1.5 px-3 font-mono text-xs">
                        {r.ip}
                      </td>
                      <td
                        className="py-1.5 px-3 text-xs max-w-[200px] truncate"
                        title={r.path}
                      >
                        {r.path}
                      </td>
                      <td
                        className="py-1.5 px-3 text-xs max-w-[200px] truncate text-gray-500"
                        title={r.referer || ""}
                      >
                        {r.referer || "-"}
                      </td>
                      <td className="py-1.5 px-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString("ko-KR")}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <button
                          onClick={() => handleDelete("visit-logs", [r.id])}
                          className="text-xs text-red-500 hover:underline"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                  {visitLogs.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 text-center text-gray-400"
                      >
                        데이터가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* 데이터 이관 탭 */}
      {tab === "import" && (
        <div className="space-y-6">
          {/* 레거시 DB 구조 안내 */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-bold text-gray-700">
                pkistdc.net 레거시 테이블 구조
              </h2>
            </div>
            <div className="p-4 text-sm text-gray-600 space-y-2">
              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">{`counter_main:    no, date(unix), unique_counter, pageview
counter_ip:      no, date(unix), ip(varchar 15)
counter_referer: no, date(unix), hit, referer(varchar 255)`}</pre>
              <p className="text-xs text-gray-500">
                <strong>이관 매핑:</strong><br />
                counter_main.unique_counter → visitor_counts.count (일별 순 방문자)<br />
                counter_ip → visit_logs (IP별 방문 기록)<br />
                counter_referer → visit_logs (리퍼러별 방문 기록)
              </p>
            </div>
          </div>

          {/* 테이블 초기화 */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-red-50 border-b border-red-200">
              <h2 className="text-sm font-bold text-red-700">이관 전 테이블 초기화</h2>
              <p className="text-xs text-red-600 mt-1">
                이관 전에 기존 데이터를 삭제하고 AUTO_INCREMENT를 초기화합니다.
              </p>
            </div>
            <div className="p-4 flex flex-wrap gap-2">
              {[
                { table: "VisitorCount", label: "방문자 통계" },
                { table: "VisitLog", label: "방문 로그" },
              ].map(({ table, label }) => (
                <button
                  key={table}
                  onClick={() => handleTruncate(table, label)}
                  className="px-3 py-1.5 bg-red-100 text-red-700 text-xs rounded border border-red-300 hover:bg-red-200"
                >
                  {label} 초기화
                </button>
              ))}
            </div>
          </div>

          {/* SQL 파일 업로드 (유일한 이관 방법) */}
          <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
            <div className="px-4 py-3 bg-green-50 border-b border-green-200">
              <h2 className="text-sm font-bold text-green-700">SQL 파일 업로드</h2>
              <p className="text-xs text-green-600 mt-1">
                mysqldump 파일에서 <code className="bg-green-100 px-1 rounded">counter_main</code>, <code className="bg-green-100 px-1 rounded">counter_ip</code>, <code className="bg-green-100 px-1 rounded">counter_referer</code> INSERT 문을 추출하여 이관합니다.
              </p>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-xs text-gray-600 mb-1">SQL 파일 업로드</label>
                  <label className="flex items-center gap-2 px-3 py-2 border border-dashed rounded cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-colors">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className="text-sm text-gray-500 truncate">
                      {importSqlFile
                        ? `${importSqlFile.name}${importParsedData ? ` (파싱 완료)` : importLoading ? " (파싱 중...)" : ""}`
                        : ".sql 파일 선택"}
                    </span>
                    <input type="file" accept=".sql,.txt" onChange={handleImportSqlFile} className="hidden" />
                  </label>
                </div>
              </div>
              {!importParsedData && !importSqlFile && (
                <p className="text-xs text-gray-400">mysqldump / Navicat 덤프 파일에서 counter 테이블 INSERT 문을 자동 파싱합니다. (파일 업로드 시 즉시 미리보기)</p>
              )}
              {importParsedData && (
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <p className="text-xs font-bold text-green-800 mb-2">파싱된 데이터 (이관 가능)</p>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {[
                      { label: "counter_main (방문통계)", count: importParsedData.counterMain.length },
                      { label: "counter_ip (방문로그)", count: importParsedData.counterIp.length },
                      { label: "counter_referer (리퍼러)", count: importParsedData.counterReferer.length },
                    ].map(({ label, count }) => (
                      <div key={label} className="text-center">
                        <div className="text-lg font-bold text-green-700">{count.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleImportSql}
                      disabled={importLoading}
                      className="px-4 py-1.5 bg-green-700 text-white text-sm rounded hover:bg-green-800 disabled:opacity-50"
                    >
                      {importLoading ? "이관 중..." : "이관 실행"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 이관 결과 */}
          {importResult && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h2 className="text-sm font-bold text-gray-700">이관 결과</h2>
              </div>
              <pre className="p-4 text-sm whitespace-pre-wrap">{importResult}</pre>
            </div>
          )}
        </div>
      )}

      {/* 게시판 이관 탭 */}
      {tab === "board-migrate" && <BoardMigration />}

      {/* 사용자 이관 탭 */}
      {tab === "user-migrate" && <UserMigrationTab />}
    </div>
  );
}

// ============================================================
// 서버 접속 정보 타입 + 공통 입력 패널
// ============================================================
interface ConnInfo {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function ConnInfoPanel({
  connInfo,
  onChange,
  onTest,
  testStatus,
  placeholder,
}: {
  connInfo: ConnInfo;
  onChange: (info: ConnInfo) => void;
  onTest: () => void;
  testStatus: string;
  placeholder?: Partial<ConnInfo>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        원격 서버 접속정보를 입력하세요. 비워두면 현재 서버의 레거시 DB를 사용합니다.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Host</label>
          <input
            type="text"
            value={connInfo.host}
            onChange={(e) => onChange({ ...connInfo, host: e.target.value })}
            className="w-full border rounded px-2 py-1.5 text-sm font-mono"
            placeholder={String(placeholder?.host ?? "jd1.nskorea.com")}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Port</label>
          <input
            type="number"
            value={connInfo.port}
            onChange={(e) => onChange({ ...connInfo, port: parseInt(e.target.value) || 3306 })}
            className="w-full border rounded px-2 py-1.5 text-sm"
            placeholder="3306"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">User</label>
          <input
            type="text"
            value={connInfo.user}
            onChange={(e) => onChange({ ...connInfo, user: e.target.value })}
            className="w-full border rounded px-2 py-1.5 text-sm font-mono"
            placeholder={String(placeholder?.user ?? "")}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Password</label>
          <input
            type="password"
            value={connInfo.password}
            onChange={(e) => onChange({ ...connInfo, password: e.target.value })}
            className="w-full border rounded px-2 py-1.5 text-sm font-mono"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-600 mb-1">Database</label>
          <input
            type="text"
            value={connInfo.database}
            onChange={(e) => onChange({ ...connInfo, database: e.target.value })}
            className="w-full border rounded px-2 py-1.5 text-sm font-mono"
            placeholder={String(placeholder?.database ?? "")}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onTest}
          disabled={!connInfo.host}
          className="px-3 py-1.5 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 disabled:opacity-40"
        >
          접속 테스트
        </button>
        {testStatus && (
          <span
            className={`text-xs ${
              testStatus.startsWith("접속 성공") ? "text-green-600" : testStatus === "테스트 중..." ? "text-gray-500" : "text-red-600"
            }`}
          >
            {testStatus}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 사용자 이관 컴포넌트
// ============================================================
interface LegacyUserPreview {
  no: number;
  userId: string;
  name: string;
  email: string;
  level: number;
  isAdmin: number;
  regDate: string | null;
  alreadyExists: boolean;
  hasPassword: boolean;
  excludedReason?: "current-login" | null;
}

// SQL 에서 zetyx_member_table 의 CREATE TABLE + INSERT 문만 추출 (클라이언트).
// CREATE TABLE 이 서버 파서에 전달되어야 컬럼 순서가 정확히 매핑된다.
function extractMemberSqlOnly(sql: string): string {
  const esc = "zetyx_member_table".replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts: string[] = [];

  // 1) CREATE TABLE 블록 (괄호 짝 맞는 곳까지 + 뒤따르는 옵션/세미콜론)
  const createRe = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?\`?${esc}\`?\\s*\\(`,
    "gi"
  );
  const cm = createRe.exec(sql);
  if (cm) {
    const start = cm.index;
    let i = cm.index + cm[0].length;
    let depth = 1;
    let inStr = false;
    let inBt = false;
    while (i < sql.length && depth > 0) {
      const c = sql[i];
      if (inStr) {
        if (c === "\\" && i + 1 < sql.length) { i += 2; continue; }
        if (c === "'") inStr = false;
      } else if (inBt) {
        if (c === "`") inBt = false;
      } else {
        if (c === "'") inStr = true;
        else if (c === "`") inBt = true;
        else if (c === "(") depth++;
        else if (c === ")") { depth--; if (depth === 0) { i++; break; } }
      }
      i++;
    }
    // 괄호 이후 ENGINE=, CHARSET 등 옵션을 세미콜론까지 포함
    while (i < sql.length && sql[i] !== ";") i++;
    if (i < sql.length) i++; // 세미콜론 포함
    parts.push(sql.substring(start, i));
  }

  // 2) INSERT 문들
  const insertRe = new RegExp(`INSERT\\s+INTO\\s+\`?${esc}\`?`, "gi");
  let match;
  while ((match = insertRe.exec(sql)) !== null) {
    const start = match.index;
    let pos = start + match[0].length;
    let inStr = false;
    while (pos < sql.length) {
      if (inStr) {
        if (sql[pos] === "\\") { pos += 2; continue; }
        if (sql[pos] === "'") {
          if (pos + 1 < sql.length && sql[pos + 1] === "'") { pos += 2; continue; }
          inStr = false;
        }
        pos++; continue;
      }
      if (sql[pos] === "'") { inStr = true; pos++; continue; }
      if (sql[pos] === ";") { pos++; break; }
      pos++;
    }
    parts.push(sql.substring(start, pos));
    insertRe.lastIndex = pos;
  }
  return parts.join("\n");
}

// fetch 응답을 JSON 으로 파싱하되, 서버가 HTML 오류 페이지(413/500 등) 를
// 반환할 때 "Unexpected token '<'" 대신 친절한 오류 메시지를 던지도록 한다.
async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (ct.includes("application/json") || text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`JSON 파싱 실패 (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
  }
  // HTML/plain 응답
  const snippet = text.replace(/\s+/g, " ").slice(0, 200);
  if (res.status === 413) {
    throw new Error(`요청 본문이 너무 큽니다 (HTTP 413). 서버의 Nginx client_max_body_size / Node body limit 를 확인하세요. 응답: ${snippet}`);
  }
  if (res.status >= 500) {
    throw new Error(`서버 오류 (HTTP ${res.status}). 서버 로그를 확인하세요. 응답: ${snippet}`);
  }
  throw new Error(`예상치 못한 응답 (HTTP ${res.status}, ${ct}): ${snippet}`);
}

function UserMigrationTab() {
  // SQL 파일 업로드만 사용 (MySQL 직접 접속 옵션 제거 2026-04-18)
  const method: "sql" = "sql";
  const [legacyDb, setLegacyDb] = useState("pkistdc");
  const [connInfo, setConnInfo] = useState<ConnInfo>({
    host: "", port: 3306, user: "", password: "", database: "",
  });
  const [connTestStatus, setConnTestStatus] = useState("");
  // SQL 파일 방법
  const [sqlContent, setSqlContent] = useState("");
  const [sqlFileRef, setSqlFileRef] = useState<File | null>(null);
  // 공통
  const [users, setUsers] = useState<LegacyUserPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    total: number;
    migrated: number;
    skipped: number;
    skippedCurrentLogin?: number;
    currentLoginId?: string;
    errorCount: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState("");
  const [truncateMsg, setTruncateMsg] = useState("");

  const handleTestConn = async () => {
    setConnTestStatus("테스트 중...");
    try {
      const res = await fetch("/api/admin/db/migrate-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-connection", connectionInfo: connInfo }),
      });
      const data = await parseJsonResponse<any>(res);
      setConnTestStatus(
        data.success
          ? `접속 성공${data.hasMemberTable ? " (zetyx_member_table 확인)" : " (zetyx_member_table 없음)"}`
          : `오류: ${data.error}`
      );
    } catch (e) {
      setConnTestStatus(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleTruncateUser = async () => {
    if (!confirm("[User] 테이블을 초기화하시겠습니까?\n\n현재 로그인한 사용자 계정만 남기고 모두 삭제합니다.\n삭제된 사용자의 세션은 자동으로 정리됩니다 (본인 세션은 유지).\n이 작업은 되돌릴 수 없습니다.")) return;
    setTruncateMsg("초기화 중...");
    try {
      // User 삭제 시 Session.user onDelete:Cascade 로 타 사용자 세션은 자동 제거.
      // 이전 버전은 Session 먼저 truncate 했다가 본인 세션까지 날려 403 이 났음.
      const res = await fetch("/api/admin/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "truncate-table", tableName: "User" }),
      });
      const data = await parseJsonResponse<any>(res);
      setTruncateMsg(data.success ? (data.message || "User 테이블 초기화 완료") : `오류: ${data.error}`);
      setUsers([]);
      setPreviewLoaded(false);
      setResult(null);
    } catch (e) {
      setTruncateMsg(`초기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // 방법 1: 원격 서버 직접 조회
  const loadDirectPreview = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const body: Record<string, unknown> = { action: "preview", legacyDb };
      if (connInfo.host) body.connectionInfo = connInfo;

      const res = await fetch("/api/admin/db/migrate-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseJsonResponse<any>(res);
      if (data.error) {
        setError(data.error);
      } else {
        setUsers(data.users || []);
        setPreviewLoaded(true);
      }
    } catch (e) {
      setError(`조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const executeDirectMigration = async () => {
    const toMigrate = users.filter((u) => !u.alreadyExists && !u.excludedReason).length;
    const excluded = users.filter((u) => !!u.excludedReason).length;
    const note = excluded > 0
      ? `\n\n현재 로그인한 본인(동일 userId) ${excluded}명은 자동 제외됩니다.`
      : "";
    if (!confirm(`${toMigrate}명의 사용자를 이관하시겠습니까?\n\n기존에 존재하는 사용자는 건너뜁니다.${note}`)) return;
    setMigrating(true);
    setError("");
    setResult(null);
    try {
      const body: Record<string, unknown> = { legacyDb, skipExisting: true };
      if (connInfo.host) body.connectionInfo = connInfo;

      const res = await fetch("/api/admin/db/migrate-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseJsonResponse<any>(res);
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
        await loadDirectPreview();
      }
    } catch (e) {
      setError(`이관 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setMigrating(false);
    }
  };

  // 방법 2: SQL 파일 업로드
  const handleSqlFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSqlFileRef(file);
    setUsers([]);
    setPreviewLoaded(false);
    setResult(null);
    setError("");
    try {
      // 인코딩 자동 감지
      const chunk = await file.slice(0, 10240).arrayBuffer();
      let enc = "utf-8";
      try { new TextDecoder("utf-8", { fatal: true }).decode(chunk); }
      catch { enc = "euc-kr"; }
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder(enc).decode(buffer);
      // member_table INSERT 문만 추출
      const extracted = extractMemberSqlOnly(text);
      setSqlContent(extracted);
      if (!extracted) {
        setError("파일에서 zetyx_member_table INSERT 문을 찾을 수 없습니다.");
      }
    } catch (err) {
      setError(`파일 읽기 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const loadSqlPreview = async () => {
    if (!sqlContent) { setError("SQL 파일을 먼저 업로드하세요."); return; }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/db/migrate-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview-sql", sql: sqlContent }),
      });
      const data = await parseJsonResponse<any>(res);
      if (data.error) {
        setError(data.error);
      } else {
        setUsers(data.users || []);
        setPreviewLoaded(true);
      }
    } catch (e) {
      setError(`조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const executeSqlMigration = async () => {
    if (!sqlContent) { setError("SQL 파일을 먼저 업로드하세요."); return; }
    const toMigrate = users.filter((u) => !u.alreadyExists && !u.excludedReason).length;
    const excluded = users.filter((u) => !!u.excludedReason).length;
    const note = excluded > 0
      ? `\n\n현재 로그인한 본인(동일 userId) ${excluded}명은 자동 제외됩니다.`
      : "";
    if (!confirm(`${toMigrate}명의 사용자를 이관하시겠습니까?\n\n기존에 존재하는 사용자는 건너뜁니다.${note}`)) return;
    setMigrating(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/db/migrate-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import-sql", sql: sqlContent, skipExisting: true }),
      });
      const data = await parseJsonResponse<any>(res);
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
        await loadSqlPreview();
      }
    } catch (e) {
      setError(`이관 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setMigrating(false);
    }
  };

  const excludedUsers = users.filter((u) => !!u.excludedReason);
  const newUsers = users.filter((u) => !u.alreadyExists && !u.excludedReason);
  const existingUsers = users.filter((u) => u.alreadyExists && !u.excludedReason);

  return (
    <div className="space-y-6">
      {/* 비밀번호 안내 */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h3 className="text-sm font-bold text-amber-800 mb-2">비밀번호 이관 안내</h3>
        <div className="text-xs text-amber-700 space-y-1">
          <p>제로보드 4.1은 MySQL의 <code className="bg-amber-100 px-1 rounded">PASSWORD()</code> 함수로 비밀번호를 해시합니다.</p>
          <p>이 해시는 <strong>단방향(one-way)</strong>이므로 원래 비밀번호를 복원할 수 없습니다.</p>
          <p className="font-medium text-amber-900 mt-2">이관 후 로그인 방식:</p>
          <ul className="list-disc ml-4 space-y-0.5">
            <li>이관된 사용자의 레거시 해시가 <code className="bg-amber-100 px-1 rounded">legacyPwHash</code> 필드에 저장됩니다.</li>
            <li>로그인 시 MySQL <code className="bg-amber-100 px-1 rounded">PASSWORD()</code> 함수로 레거시 해시를 비교합니다.</li>
            <li>레거시 비밀번호로 로그인 성공 시 자동으로 bcrypt 해시로 업그레이드됩니다.</li>
            <li><strong>즉, 사용자는 기존 비밀번호로 그대로 로그인할 수 있습니다.</strong></li>
          </ul>
          <p className="text-amber-600 mt-2">* MySQL 8에서 PASSWORD() 함수가 제거된 경우, 레거시 해시 비교가 불가능할 수 있습니다.</p>
        </div>
      </div>

      {/* 테이블 초기화 */}
      <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
        <div className="px-4 py-3 bg-red-50 border-b border-red-200">
          <h2 className="text-sm font-bold text-red-700">이관 전 테이블 초기화</h2>
          <p className="text-xs text-red-600 mt-1">
            <strong>현재 로그인한 사용자 계정만 남기고</strong> 모두 삭제됩니다.
            덤프 업로드 시에도 동일 userId 는 자동 제외되어 본인 권한이 보호됩니다.
          </p>
        </div>
        <div className="p-4 flex items-center gap-3">
          <button
            onClick={handleTruncateUser}
            className="px-3 py-1.5 bg-red-100 text-red-700 text-xs rounded border border-red-300 hover:bg-red-200"
          >
            User 테이블 초기화
          </button>
          {truncateMsg && (
            <span className={`text-xs ${truncateMsg.includes("오류") ? "text-red-600" : "text-green-600"}`}>
              {truncateMsg}
            </span>
          )}
        </div>
      </div>

      {/* SQL 파일 업로드 (유일한 이관 방법) */}
      {true && (
        <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
          <div className="px-4 py-3 bg-green-50 border-b border-green-200">
            <h2 className="text-sm font-bold text-green-700">방법 2: SQL 파일 업로드 이관</h2>
            <p className="text-xs text-green-600 mt-1">
              제로보드 SQL 백업 파일을 업로드하면 <code className="bg-green-100 px-1 rounded">zetyx_member_table</code> 데이터를 추출하여 이관합니다.
            </p>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs text-gray-600 mb-1">SQL 파일 업로드</label>
                <label className="flex items-center gap-2 px-3 py-2 border border-dashed rounded cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-colors">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <span className="text-sm text-gray-500 truncate">
                    {sqlFileRef
                      ? `${sqlFileRef.name}${sqlContent ? ` (${Math.round(sqlContent.length / 1024)}KB 추출됨)` : " (처리 중...)"}`
                      : ".sql 파일 선택"}
                  </span>
                  <input type="file" accept=".sql,.txt" onChange={handleSqlFileUpload} className="hidden" />
                </label>
              </div>
              {sqlContent && (
                <button
                  onClick={loadSqlPreview}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? "조회 중..." : "사용자 조회"}
                </button>
              )}
            </div>
            {!sqlContent && !sqlFileRef && (
              <p className="text-xs text-gray-400">SQL 덤프 파일(mysqldump)에서 zetyx_member_table INSERT 문을 자동으로 추출합니다.</p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-green-800 mb-2">이관 결과</h3>
          <div className="text-sm text-green-700 space-y-1">
            <p>
              전체: {result.total}명 | 이관됨: <strong>{result.migrated}명</strong>
              {" | "}건너뜀(기존): {result.skipped}명
              {!!result.skippedCurrentLogin && (
                <> {" | "}제외(로그인 본인 <code className="bg-green-100 px-1 rounded">{result.currentLoginId}</code>): {result.skippedCurrentLogin}명</>
              )}
              {" | "}오류: {result.errorCount}건
            </p>
            {result.errors.length > 0 && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-600">
                {result.errors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 미리보기 결과 */}
      {previewLoaded && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">
              레거시 사용자 목록 (총 {users.length}명)
              {newUsers.length > 0 && (
                <span className="ml-2 text-blue-600 font-normal">이관 대상: {newUsers.length}명</span>
              )}
              {existingUsers.length > 0 && (
                <span className="ml-2 text-gray-400 font-normal">이미 존재: {existingUsers.length}명</span>
              )}
              {excludedUsers.length > 0 && (
                <span className="ml-2 text-orange-600 font-normal">로그인 본인 제외: {excludedUsers.length}명</span>
              )}
            </h2>
            {newUsers.length > 0 && (
              <button
                onClick={executeSqlMigration}
                disabled={migrating}
                className="px-4 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
              >
                {migrating ? "이관 중..." : `${newUsers.length}명 이관 실행`}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 bg-gray-50">
                  <th className="py-2 px-3 text-left font-medium">No</th>
                  <th className="py-2 px-3 text-left font-medium">아이디</th>
                  <th className="py-2 px-3 text-left font-medium">이름</th>
                  <th className="py-2 px-3 text-left font-medium">이메일</th>
                  <th className="py-2 px-3 text-center font-medium">레벨</th>
                  <th className="py-2 px-3 text-center font-medium">관리</th>
                  <th className="py-2 px-3 text-center font-medium">비밀번호</th>
                  <th className="py-2 px-3 text-left font-medium">가입일</th>
                  <th className="py-2 px-3 text-center font-medium">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => (
                  <tr key={u.no} className={`hover:bg-gray-50 ${(u.alreadyExists || u.excludedReason) ? "opacity-50" : ""}`}>
                    <td className="py-1.5 px-3 text-gray-400">{u.no}</td>
                    <td className="py-1.5 px-3 font-mono font-medium">{u.userId}</td>
                    <td className="py-1.5 px-3">{u.name}</td>
                    <td className="py-1.5 px-3 text-gray-500">{u.email || "-"}</td>
                    <td className="py-1.5 px-3 text-center">{u.level}</td>
                    <td className="py-1.5 px-3 text-center">
                      {u.isAdmin <= 2 ? (
                        <span className="px-1 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-bold">
                          {u.isAdmin === 1 ? "전체" : "그룹"}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      {u.hasPassword ? (
                        <span className="text-green-600">O</span>
                      ) : (
                        <span className="text-red-400">X</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-gray-500">
                      {u.regDate ? new Date(u.regDate).toLocaleDateString("ko-KR") : "-"}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      {u.excludedReason === "current-login" ? (
                        <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px]" title="현재 로그인한 본인 계정이므로 이관에서 제외됩니다.">
                          로그인 본인
                        </span>
                      ) : u.alreadyExists ? (
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">이관됨</span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">대기</span>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-400">
                      사용자 데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// 페이징 컴포넌트
function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 4);
  const end = Math.min(totalPages, page + 4);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-center gap-1 py-3 border-t border-gray-100">
      {page > 1 && (
        <button
          onClick={() => onPageChange(page - 1)}
          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
        >
          &lt;
        </button>
      )}
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`px-2 py-1 text-xs rounded ${
            p === page
              ? "bg-blue-600 text-white"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          {p}
        </button>
      ))}
      {page < totalPages && (
        <button
          onClick={() => onPageChange(page + 1)}
          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
        >
          &gt;
        </button>
      )}
    </div>
  );
}
