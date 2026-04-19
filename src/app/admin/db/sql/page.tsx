"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HelpButton from "@/components/HelpButton";

// ============================================================
// 타입 정의
// ============================================================
interface TableInfo {
  name: string;
  rows: number;
  engine: string;
  size: string;
  comment: string;
}

interface ColumnInfo {
  field: string;
  type: string;
  null: string;
  key: string;
  default: string | null;
  extra: string;
  comment: string;
}

interface IndexInfo {
  keyName: string;
  seq: number;
  columnName: string;
  nonUnique: number;
  indexType: string;
}

interface SqlResult {
  type: "select" | "execute";
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  affectedRows?: number;
  executionTime: number;
  error?: string;
}

type Tab = "structure" | "data" | "sql";

// ============================================================
// 메인 컴포넌트
// ============================================================
export default function SqlManagementPage() {
  // 테이블 목록
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState("");

  // 탭
  const [activeTab, setActiveTab] = useState<Tab>("structure");

  // 구조 탭
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [createTableSql, setCreateTableSql] = useState("");
  const [structureLoading, setStructureLoading] = useState(false);
  const [showDdl, setShowDdl] = useState(false);

  // 컬럼 추가 폼
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newCol, setNewCol] = useState({ name: "", type: "VARCHAR", length: "255", nullable: true, defaultVal: "", after: "" });

  // 데이터 탭
  const [dataColumns, setDataColumns] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<Record<string, unknown>[]>([]);
  const [dataPage, setDataPage] = useState(1);
  const [dataTotalPages, setDataTotalPages] = useState(1);
  const [dataTotal, setDataTotal] = useState(0);
  const [dataLimit, setDataLimit] = useState(50);
  const [dataLoading, setDataLoading] = useState(false);
  const [primaryKeys, setPrimaryKeys] = useState<string[]>([]);

  // 행 편집
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  // SQL 탭
  const [sqlQuery, setSqlQuery] = useState("");
  const [sqlResult, setSqlResult] = useState<SqlResult | null>(null);
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlHistory, setSqlHistory] = useState<string[]>([]);
  const sqlRef = useRef<HTMLTextAreaElement>(null);

  // 메시지
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const showMsg = (text: string, type: "success" | "error" | "info" = "info") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  // ============================================================
  // 테이블 목록 로드
  // ============================================================
  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const res = await fetch("/api/admin/db/sql?action=tables");
      const data = await res.json();
      if (data.tables) setTables(data.tables);
      else if (data.error) showMsg(data.error, "error");
    } catch {
      showMsg("테이블 목록 로드 실패", "error");
    } finally {
      setTablesLoading(false);
    }
  }, []);

  useEffect(() => { loadTables(); }, [loadTables]);

  // ============================================================
  // 테이블 구조 로드
  // ============================================================
  const loadStructure = useCallback(async (table: string) => {
    setStructureLoading(true);
    try {
      const res = await fetch(`/api/admin/db/sql?action=describe&table=${encodeURIComponent(table)}`);
      const data = await res.json();
      if (data.error) { showMsg(data.error, "error"); return; }
      setColumns(data.columns || []);
      setIndexes(data.indexes || []);
      setCreateTableSql(data.createTable || "");
      setPrimaryKeys((data.columns || []).filter((c: ColumnInfo) => c.key === "PRI").map((c: ColumnInfo) => c.field));
    } catch {
      showMsg("구조 로드 실패", "error");
    } finally {
      setStructureLoading(false);
    }
  }, []);

  // ============================================================
  // 데이터 로드
  // ============================================================
  const loadData = useCallback(async (table: string, page: number, limit: number) => {
    setDataLoading(true);
    setEditingRow(null);
    try {
      const res = await fetch(`/api/admin/db/sql?action=data&table=${encodeURIComponent(table)}&page=${page}&limit=${limit}`);
      const data = await res.json();
      if (data.error) { showMsg(data.error, "error"); return; }
      setDataColumns(data.columns || []);
      setDataRows(data.rows || []);
      setDataTotal(data.total || 0);
      setDataTotalPages(data.totalPages || 1);
      setDataPage(data.page || 1);
    } catch {
      showMsg("데이터 로드 실패", "error");
    } finally {
      setDataLoading(false);
    }
  }, []);

  // 테이블 선택 시 구조 + 데이터 로드
  useEffect(() => {
    if (selectedTable) {
      loadStructure(selectedTable);
      loadData(selectedTable, 1, dataLimit);
    }
  }, [selectedTable, loadStructure, loadData, dataLimit]);

  // ============================================================
  // SQL 쿼리 실행
  // ============================================================
  const executeQuery = async (query?: string) => {
    const q = (query || sqlQuery).trim();
    if (!q) return;

    // 파괴적 쿼리 확인
    if (/^\s*(DROP|TRUNCATE|DELETE)\s/i.test(q)) {
      if (!confirm(`이 쿼리는 데이터를 변경/삭제합니다. 실행하시겠습니까?\n\n${q}`)) return;
    }

    setSqlLoading(true);
    setSqlResult(null);
    try {
      const res = await fetch("/api/admin/db/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (data.error) {
        setSqlResult({ type: "select", executionTime: 0, error: data.error });
      } else {
        setSqlResult(data);
        if (data.type === "execute") {
          showMsg(`쿼리 실행 완료: ${data.affectedRows}행 영향 (${data.executionTime}ms)`, "success");
          // 구조/데이터 변경 시 새로고침
          if (selectedTable) {
            loadStructure(selectedTable);
            loadData(selectedTable, dataPage, dataLimit);
          }
          loadTables();
        }
      }
      // 히스토리 추가
      setSqlHistory((prev) => {
        const next = [q, ...prev.filter((h) => h !== q)];
        return next.slice(0, 20);
      });
    } catch (e) {
      setSqlResult({ type: "select", executionTime: 0, error: String(e) });
    } finally {
      setSqlLoading(false);
    }
  };

  // ============================================================
  // 컬럼 추가
  // ============================================================
  const addColumn = async () => {
    if (!selectedTable || !newCol.name.trim()) return;
    let typeDef = newCol.type;
    if (newCol.length && ["VARCHAR", "CHAR", "INT", "BIGINT", "DECIMAL"].includes(newCol.type)) {
      typeDef += `(${newCol.length})`;
    }
    let sql = `ALTER TABLE \`${selectedTable}\` ADD COLUMN \`${newCol.name.trim()}\` ${typeDef}`;
    if (!newCol.nullable) sql += " NOT NULL";
    if (newCol.defaultVal) sql += ` DEFAULT '${newCol.defaultVal.replace(/'/g, "\\'")}'`;
    if (newCol.after) sql += ` AFTER \`${newCol.after}\``;

    if (!confirm(`다음 쿼리를 실행하시겠습니까?\n\n${sql}`)) return;
    await executeQuery(sql);
    setShowAddColumn(false);
    setNewCol({ name: "", type: "VARCHAR", length: "255", nullable: true, defaultVal: "", after: "" });
  };

  // ============================================================
  // 행 수정
  // ============================================================
  const updateRow = async (rowIndex: number) => {
    if (!selectedTable || primaryKeys.length === 0) return;
    const row = dataRows[rowIndex];
    const setClauses: string[] = [];
    const whereClauses: string[] = [];

    for (const col of dataColumns) {
      if (primaryKeys.includes(col)) {
        const v = row[col];
        whereClauses.push(`\`${col}\` = ${v === null ? "NULL" : `'${String(v).replace(/'/g, "\\'")}'`}`);
      }
    }

    for (const [col, val] of Object.entries(editValues)) {
      if (val === "NULL") {
        setClauses.push(`\`${col}\` = NULL`);
      } else {
        setClauses.push(`\`${col}\` = '${val.replace(/'/g, "\\'")}'`);
      }
    }

    if (setClauses.length === 0 || whereClauses.length === 0) return;
    const sql = `UPDATE \`${selectedTable}\` SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")} LIMIT 1`;
    await executeQuery(sql);
    setEditingRow(null);
    setEditValues({});
  };

  // ============================================================
  // 행 삭제
  // ============================================================
  const deleteRow = async (rowIndex: number) => {
    if (!selectedTable || primaryKeys.length === 0) return;
    const row = dataRows[rowIndex];
    const whereClauses: string[] = [];

    for (const col of primaryKeys) {
      const v = row[col];
      whereClauses.push(`\`${col}\` = ${v === null ? "NULL" : `'${String(v).replace(/'/g, "\\'")}'`}`);
    }

    const sql = `DELETE FROM \`${selectedTable}\` WHERE ${whereClauses.join(" AND ")} LIMIT 1`;
    if (!confirm(`이 행을 삭제하시겠습니까?\n\n${sql}`)) return;
    await executeQuery(sql);
  };

  // ============================================================
  // 필터된 테이블 목록
  // ============================================================
  const filteredTables = tableFilter
    ? tables.filter((t) => t.name.toLowerCase().includes(tableFilter.toLowerCase()))
    : tables;

  // ============================================================
  // 셀 값 표시
  // ============================================================
  const renderCell = (value: unknown) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-300 italic">NULL</span>;
    }
    const str = String(value);
    if (str.length > 100) {
      return <span title={str}>{str.slice(0, 100)}...</span>;
    }
    return str;
  };

  const tabItems: { key: Tab; label: string }[] = [
    { key: "structure", label: "구조" },
    { key: "data", label: "데이터" },
    { key: "sql", label: "SQL" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">SQL 관리 <HelpButton slug="admin-sql" /></h1>
        <button
          onClick={loadTables}
          className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
        >
          새로고침
        </button>
      </div>

      {message && (
        <div className={`px-4 py-2 rounded text-sm border ${
          message.type === "success" ? "bg-green-50 border-green-200 text-green-700"
          : message.type === "error" ? "bg-red-50 border-red-200 text-red-700"
          : "bg-blue-50 border-blue-200 text-blue-700"
        }`}>
          {message.text}
        </div>
      )}

      {/* 모바일: 테이블 드롭다운 */}
      <div className="lg:hidden">
        <select
          value={selectedTable || ""}
          onChange={(e) => setSelectedTable(e.target.value || null)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        >
          <option value="">테이블 선택...</option>
          {tables.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}{t.comment ? ` - ${t.comment}` : ""} ({t.rows})
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-4">
        {/* ===== 왼쪽: 테이블 목록 ===== */}
        <aside className="w-56 shrink-0 hidden lg:block">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden sticky top-24">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-600">테이블 ({tables.length})</span>
              </div>
              <input
                type="text"
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                placeholder="필터..."
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
              />
            </div>
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
              {tablesLoading ? (
                <div className="p-4 text-center text-gray-400 text-xs">로딩 중...</div>
              ) : (
                filteredTables.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => setSelectedTable(t.name)}
                    title={t.comment ? `${t.name} - ${t.comment}` : t.name}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                      selectedTable === t.name ? "bg-blue-50 text-blue-700 border-l-2 border-l-blue-600" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate font-mono text-xs">{t.name}</span>
                      <span className="text-xs text-gray-400 ml-1 shrink-0">{t.rows}</span>
                    </div>
                    {t.comment && (
                      <div className="text-[10px] text-gray-400 truncate mt-0.5">{t.comment}</div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* ===== 오른쪽: 탭 콘텐츠 ===== */}
        <div className="flex-1 min-w-0">
          {!selectedTable ? (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400">
              <p className="text-sm">왼쪽에서 테이블을 선택하세요</p>
              <p className="text-xs mt-2">또는 아래 SQL 탭에서 직접 쿼리를 실행할 수 있습니다</p>
              <button
                onClick={() => { setActiveTab("sql"); setSelectedTable("_sql_only"); }}
                className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                SQL 쿼리 실행
              </button>
            </div>
          ) : (
            <>
              {/* 테이블명 + 탭 */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-700 font-mono">{selectedTable === "_sql_only" ? "SQL 쿼리" : selectedTable}</span>
                  {selectedTable !== "_sql_only" && (
                    <span className="text-xs text-gray-400">{dataTotal.toLocaleString()}행</span>
                  )}
                </div>
                <div className="flex border-b border-gray-200">
                  {tabItems.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setActiveTab(t.key)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === t.key
                          ? "border-blue-600 text-blue-600"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* ─── 구조 탭 ─── */}
                {activeTab === "structure" && selectedTable !== "_sql_only" && (
                  <div className="p-4 space-y-4">
                    {structureLoading ? (
                      <div className="py-8 text-center text-gray-400 text-sm">로딩 중...</div>
                    ) : (
                      <>
                        {/* 컬럼 테이블 */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-200 text-gray-500">
                                <th className="py-2 px-2 text-left font-medium">Field</th>
                                <th className="py-2 px-2 text-left font-medium">Type</th>
                                <th className="py-2 px-2 text-center font-medium">Null</th>
                                <th className="py-2 px-2 text-center font-medium">Key</th>
                                <th className="py-2 px-2 text-left font-medium">Default</th>
                                <th className="py-2 px-2 text-left font-medium">Extra</th>
                                <th className="py-2 px-2 text-left font-medium">Comment</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {columns.map((col) => (
                                <tr key={col.field} className="hover:bg-gray-50">
                                  <td className="py-1.5 px-2 font-mono font-medium">
                                    {col.key === "PRI" && <span className="text-yellow-500 mr-1" title="Primary Key">🔑</span>}
                                    {col.field}
                                  </td>
                                  <td className="py-1.5 px-2 text-blue-600 font-mono">{col.type}</td>
                                  <td className="py-1.5 px-2 text-center">{col.null === "YES" ? <span className="text-green-600">YES</span> : <span className="text-gray-400">NO</span>}</td>
                                  <td className="py-1.5 px-2 text-center">
                                    {col.key && <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${
                                      col.key === "PRI" ? "bg-yellow-100 text-yellow-700" :
                                      col.key === "UNI" ? "bg-purple-100 text-purple-700" :
                                      "bg-gray-100 text-gray-600"
                                    }`}>{col.key}</span>}
                                  </td>
                                  <td className="py-1.5 px-2 font-mono">{col.default !== null ? col.default : <span className="text-gray-300">NULL</span>}</td>
                                  <td className="py-1.5 px-2 text-gray-500">{col.extra}</td>
                                  <td className="py-1.5 px-2 text-gray-500" title={col.comment}>{col.comment}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* 컬럼 추가 버튼 */}
                        <div>
                          {!showAddColumn ? (
                            <button
                              onClick={() => setShowAddColumn(true)}
                              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              + 컬럼 추가
                            </button>
                          ) : (
                            <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/30 space-y-3">
                              <h4 className="text-xs font-bold text-gray-700">컬럼 추가</h4>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <input
                                  type="text"
                                  placeholder="컬럼명"
                                  value={newCol.name}
                                  onChange={(e) => setNewCol({ ...newCol, name: e.target.value })}
                                  className="border rounded px-2 py-1 text-xs"
                                />
                                <select
                                  value={newCol.type}
                                  onChange={(e) => setNewCol({ ...newCol, type: e.target.value })}
                                  className="border rounded px-2 py-1 text-xs"
                                >
                                  {["INT", "BIGINT", "VARCHAR", "CHAR", "TEXT", "MEDIUMTEXT", "LONGTEXT", "TINYINT", "SMALLINT", "FLOAT", "DOUBLE", "DECIMAL", "DATE", "DATETIME", "TIMESTAMP", "BOOLEAN", "BLOB", "JSON", "ENUM"].map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  placeholder="길이"
                                  value={newCol.length}
                                  onChange={(e) => setNewCol({ ...newCol, length: e.target.value })}
                                  className="border rounded px-2 py-1 text-xs"
                                />
                                <select
                                  value={newCol.after}
                                  onChange={(e) => setNewCol({ ...newCol, after: e.target.value })}
                                  className="border rounded px-2 py-1 text-xs"
                                >
                                  <option value="">맨 끝</option>
                                  {columns.map((c) => (
                                    <option key={c.field} value={c.field}>AFTER {c.field}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex items-center gap-4">
                                <label className="flex items-center gap-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={newCol.nullable}
                                    onChange={(e) => setNewCol({ ...newCol, nullable: e.target.checked })}
                                  />
                                  NULL 허용
                                </label>
                                <input
                                  type="text"
                                  placeholder="Default 값"
                                  value={newCol.defaultVal}
                                  onChange={(e) => setNewCol({ ...newCol, defaultVal: e.target.value })}
                                  className="border rounded px-2 py-1 text-xs flex-1"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button onClick={addColumn} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">추가 실행</button>
                                <button onClick={() => setShowAddColumn(false)} className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">취소</button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 인덱스 */}
                        {indexes.length > 0 && (
                          <div>
                            <h4 className="text-xs font-bold text-gray-600 mb-2">인덱스</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-gray-200 text-gray-500">
                                    <th className="py-1.5 px-2 text-left font-medium">Key Name</th>
                                    <th className="py-1.5 px-2 text-left font-medium">Column</th>
                                    <th className="py-1.5 px-2 text-center font-medium">Unique</th>
                                    <th className="py-1.5 px-2 text-left font-medium">Type</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {indexes.map((idx, i) => (
                                    <tr key={`${idx.keyName}-${idx.seq}-${i}`} className="hover:bg-gray-50">
                                      <td className="py-1 px-2 font-mono">{idx.keyName}</td>
                                      <td className="py-1 px-2 font-mono">{idx.columnName}</td>
                                      <td className="py-1 px-2 text-center">{idx.nonUnique === 0 ? "YES" : "NO"}</td>
                                      <td className="py-1 px-2 text-gray-500">{idx.indexType}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* CREATE TABLE DDL */}
                        {createTableSql && (
                          <div>
                            <button
                              onClick={() => setShowDdl(!showDdl)}
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <span className={`transition-transform ${showDdl ? "rotate-90" : ""}`}>▶</span>
                              CREATE TABLE SQL
                            </button>
                            {showDdl && (
                              <pre className="mt-2 p-3 bg-gray-900 text-green-400 text-xs rounded overflow-x-auto max-h-64 overflow-y-auto">
                                {createTableSql}
                              </pre>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ─── 데이터 탭 ─── */}
                {activeTab === "data" && selectedTable !== "_sql_only" && (
                  <div>
                    {/* 상단 컨트롤 */}
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">페이지당</span>
                        <select
                          value={dataLimit}
                          onChange={(e) => {
                            setDataLimit(parseInt(e.target.value, 10));
                            if (selectedTable) loadData(selectedTable, 1, parseInt(e.target.value, 10));
                          }}
                          className="border rounded px-2 py-1 text-xs"
                        >
                          {[20, 50, 100, 200].map((n) => (
                            <option key={n} value={n}>{n}건</option>
                          ))}
                        </select>
                        <span className="text-xs text-gray-400">
                          ({dataTotal.toLocaleString()}건 중 {((dataPage - 1) * dataLimit) + 1}-{Math.min(dataPage * dataLimit, dataTotal)})
                        </span>
                      </div>
                      {primaryKeys.length === 0 && (
                        <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">PK 없음 - 수정/삭제 불가</span>
                      )}
                    </div>

                    {dataLoading ? (
                      <div className="py-8 text-center text-gray-400 text-sm">로딩 중...</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200 text-gray-500 bg-gray-50">
                              {primaryKeys.length > 0 && <th className="py-2 px-2 text-center font-medium w-20">관리</th>}
                              {dataColumns.map((col) => (
                                <th key={col} className="py-2 px-2 text-left font-medium font-mono whitespace-nowrap">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {dataRows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                {primaryKeys.length > 0 && (
                                  <td className="py-1.5 px-2 text-center whitespace-nowrap">
                                    {editingRow === idx ? (
                                      <div className="flex gap-1">
                                        <button onClick={() => updateRow(idx)} className="text-blue-600 hover:underline">저장</button>
                                        <button onClick={() => { setEditingRow(null); setEditValues({}); }} className="text-gray-400 hover:underline">취소</button>
                                      </div>
                                    ) : (
                                      <div className="flex gap-1">
                                        <button
                                          onClick={() => {
                                            setEditingRow(idx);
                                            const vals: Record<string, string> = {};
                                            for (const col of dataColumns) {
                                              vals[col] = row[col] === null ? "NULL" : String(row[col]);
                                            }
                                            setEditValues(vals);
                                          }}
                                          className="text-blue-600 hover:underline"
                                        >수정</button>
                                        <button onClick={() => deleteRow(idx)} className="text-red-500 hover:underline">삭제</button>
                                      </div>
                                    )}
                                  </td>
                                )}
                                {dataColumns.map((col) => (
                                  <td key={col} className="py-1.5 px-2 font-mono max-w-[200px] truncate" title={row[col] !== null ? String(row[col]) : "NULL"}>
                                    {editingRow === idx && !primaryKeys.includes(col) ? (
                                      <input
                                        type="text"
                                        value={editValues[col] || ""}
                                        onChange={(e) => setEditValues({ ...editValues, [col]: e.target.value })}
                                        className="w-full border rounded px-1 py-0.5 text-xs font-mono"
                                      />
                                    ) : (
                                      renderCell(row[col])
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                            {dataRows.length === 0 && (
                              <tr>
                                <td colSpan={dataColumns.length + (primaryKeys.length > 0 ? 1 : 0)} className="py-8 text-center text-gray-400">
                                  데이터가 없습니다
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* 페이지네이션 */}
                    {dataTotalPages > 1 && (
                      <div className="flex items-center justify-center gap-1 py-3 border-t border-gray-100">
                        {dataPage > 1 && (
                          <button onClick={() => selectedTable && loadData(selectedTable, dataPage - 1, dataLimit)}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">&lt;</button>
                        )}
                        {Array.from({ length: Math.min(9, dataTotalPages) }, (_, i) => {
                          const start = Math.max(1, Math.min(dataPage - 4, dataTotalPages - 8));
                          return start + i;
                        }).filter((p) => p <= dataTotalPages).map((p) => (
                          <button
                            key={p}
                            onClick={() => selectedTable && loadData(selectedTable, p, dataLimit)}
                            className={`px-2 py-1 text-xs rounded ${p === dataPage ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                          >{p}</button>
                        ))}
                        {dataPage < dataTotalPages && (
                          <button onClick={() => selectedTable && loadData(selectedTable, dataPage + 1, dataLimit)}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">&gt;</button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── SQL 탭 ─── */}
                {activeTab === "sql" && (
                  <div className="p-4 space-y-4">
                    {/* 빠른 삽입 버튼 */}
                    {selectedTable && selectedTable !== "_sql_only" && (
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => setSqlQuery(`SELECT * FROM \`${selectedTable}\` LIMIT 50`)}
                          className="px-2 py-1 text-[10px] bg-gray-100 rounded hover:bg-gray-200 font-mono"
                        >SELECT *</button>
                        <button
                          onClick={() => setSqlQuery(`DESCRIBE \`${selectedTable}\``)}
                          className="px-2 py-1 text-[10px] bg-gray-100 rounded hover:bg-gray-200 font-mono"
                        >DESCRIBE</button>
                        <button
                          onClick={() => setSqlQuery(`SHOW CREATE TABLE \`${selectedTable}\``)}
                          className="px-2 py-1 text-[10px] bg-gray-100 rounded hover:bg-gray-200 font-mono"
                        >SHOW CREATE</button>
                        <button
                          onClick={() => setSqlQuery(`SELECT COUNT(*) FROM \`${selectedTable}\``)}
                          className="px-2 py-1 text-[10px] bg-gray-100 rounded hover:bg-gray-200 font-mono"
                        >COUNT(*)</button>
                      </div>
                    )}

                    {/* 쿼리 입력 */}
                    <div>
                      <textarea
                        ref={sqlRef}
                        value={sqlQuery}
                        onChange={(e) => setSqlQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            executeQuery();
                          }
                        }}
                        rows={6}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        placeholder="SQL 쿼리를 입력하세요... (Ctrl+Enter로 실행)"
                      />
                    </div>

                    {/* 실행 + 히스토리 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => executeQuery()}
                          disabled={sqlLoading || !sqlQuery.trim()}
                          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          {sqlLoading ? "실행 중..." : "실행 (Ctrl+Enter)"}
                        </button>
                        <button
                          onClick={() => { setSqlQuery(""); setSqlResult(null); }}
                          className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        >
                          초기화
                        </button>
                      </div>
                      {sqlHistory.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => { if (e.target.value) setSqlQuery(e.target.value); }}
                          className="border rounded px-2 py-1.5 text-xs max-w-[300px]"
                        >
                          <option value="">히스토리 ({sqlHistory.length})</option>
                          {sqlHistory.map((h, i) => (
                            <option key={i} value={h}>{h.length > 60 ? h.slice(0, 60) + "..." : h}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* 결과 */}
                    {sqlResult && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-600">
                            {sqlResult.error ? "오류" : sqlResult.type === "select" ? `결과: ${sqlResult.rowCount}행` : `실행 완료: ${sqlResult.affectedRows}행 영향`}
                          </span>
                          {!sqlResult.error && (
                            <span className="text-xs text-gray-400">{sqlResult.executionTime}ms</span>
                          )}
                        </div>

                        {sqlResult.error ? (
                          <div className="p-3 text-sm text-red-600 bg-red-50">{sqlResult.error}</div>
                        ) : sqlResult.type === "select" && sqlResult.rows ? (
                          <div className="overflow-x-auto max-h-96 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0">
                                <tr className="bg-gray-100 border-b border-gray-200 text-gray-600">
                                  <th className="py-1.5 px-2 text-center font-medium text-gray-400 w-8">#</th>
                                  {sqlResult.columns?.map((col) => (
                                    <th key={col} className="py-1.5 px-2 text-left font-medium font-mono whitespace-nowrap">{col}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {sqlResult.rows.map((row, i) => (
                                  <tr key={i} className="hover:bg-gray-50">
                                    <td className="py-1 px-2 text-center text-gray-300">{i + 1}</td>
                                    {sqlResult.columns?.map((col) => (
                                      <td key={col} className="py-1 px-2 font-mono max-w-[300px] truncate" title={row[col] !== null ? String(row[col]) : "NULL"}>
                                        {renderCell(row[col])}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-3 text-sm text-green-700 bg-green-50">
                            쿼리가 성공적으로 실행되었습니다. ({sqlResult.affectedRows}행 영향, {sqlResult.executionTime}ms)
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
