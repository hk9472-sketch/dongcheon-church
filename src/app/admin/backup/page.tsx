"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import HelpButton from "@/components/HelpButton";

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin inline-block" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

async function downloadFromApi(url: string, fallbackName: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: "다운로드에 실패했습니다." }));
    throw new Error(data.message || "다운로드에 실패했습니다.");
  }
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";\n]+)"?/);
  const filename = match ? match[1] : fallbackName;

  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objUrl);
}

export default function BackupPage() {
  const [downloading, setDownloading] = useState<string | null>(null);

  // FTP 원격 백업 상태
  const [ftpHost, setFtpHost] = useState("");
  const [ftpPort, setFtpPort] = useState("21");
  const [ftpUser, setFtpUser] = useState("");
  const [ftpPassword, setFtpPassword] = useState("");
  const [ftpRemotePath, setFtpRemotePath] = useState("/backup/dongcheon");
  const [ftpEnabled, setFtpEnabled] = useState(false);
  const [ftpScheduleHour, setFtpScheduleHour] = useState("2");
  const [ftpScheduleMinute, setFtpScheduleMinute] = useState("0");
  const [ftpBackupType, setFtpBackupType] = useState("full");
  const [ftpKeepDays, setFtpKeepDays] = useState("30");
  const [ftpLastBackup, setFtpLastBackup] = useState<string | null>(null);
  const [ftpLastResult, setFtpLastResult] = useState<string | null>(null);
  const [ftpSaving, setFtpSaving] = useState(false);
  const [ftpRunning, setFtpRunning] = useState<string | null>(null);
  const [ftpMessage, setFtpMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [ftpSettingsLoaded, setFtpSettingsLoaded] = useState(false);

  const loadFtpSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/backup/ftp");
      if (!res.ok) return;
      const data = await res.json();
      setFtpHost(data.host || "");
      setFtpPort(data.port || "21");
      setFtpUser(data.user || "");
      setFtpPassword(data.password || "");
      setFtpRemotePath(data.remotePath || "/backup/dongcheon");
      setFtpEnabled(data.enabled ?? false);
      setFtpScheduleHour(data.scheduleHour || "2");
      setFtpScheduleMinute(data.scheduleMinute || "0");
      setFtpBackupType(data.backupType || "full");
      setFtpKeepDays(data.keepDays || "30");
      setFtpLastBackup(data.lastBackup || null);
      setFtpLastResult(data.lastResult || null);
    } catch {
      // ignore
    } finally {
      setFtpSettingsLoaded(true);
    }
  }, []);

  const saveFtpSettings = async () => {
    setFtpSaving(true);
    setFtpMessage(null);
    try {
      const res = await fetch("/api/admin/backup/ftp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: ftpHost,
          port: ftpPort,
          user: ftpUser,
          password: ftpPassword,
          remotePath: ftpRemotePath,
          enabled: ftpEnabled,
          scheduleHour: ftpScheduleHour,
          scheduleMinute: ftpScheduleMinute,
          backupType: ftpBackupType,
          keepDays: ftpKeepDays,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFtpMessage({ type: "success", text: data.message || "저장되었습니다." });
      } else {
        setFtpMessage({ type: "error", text: data.message || "저장에 실패했습니다." });
      }
    } catch {
      setFtpMessage({ type: "error", text: "저장에 실패했습니다." });
    } finally {
      setFtpSaving(false);
    }
  };

  const [filesSubtype, setFilesSubtype] = useState<"all" | "added" | "modified" | "incremental">("incremental");

  const runFtpBackup = async (type: "db" | "files" | "full") => {
    setFtpRunning(type);
    setFtpMessage(null);
    try {
      const res = await fetch("/api/admin/backup/ftp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, subtype: filesSubtype }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFtpMessage({ type: "success", text: data.message });
        setFtpLastBackup(data.lastBackup || null);
        setFtpLastResult(data.message);
      } else {
        setFtpMessage({ type: "error", text: data.message || "백업에 실패했습니다." });
        await loadFtpSettings();
      }
    } catch {
      setFtpMessage({ type: "error", text: "FTP 백업 요청에 실패했습니다." });
    } finally {
      setFtpRunning(null);
    }
  };

  // 첨부파일: 게시판(폴더) 목록
  const [folders, setFolders] = useState<{ name: string; title: string }[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [foldersLoading, setFoldersLoading] = useState(true);

  // DB: 테이블 목록
  const [tables, setTables] = useState<{ name: string; comment: string }[]>([]);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [tablesLoading, setTablesLoading] = useState(true);

  useEffect(() => {
    // 폴더 목록 로드
    fetch("/api/admin/backup?type=list-folders")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.folders)) {
          setFolders(d.folders);
          setSelectedFolders(new Set(d.folders.map((f: { name: string }) => f.name)));
        }
      })
      .catch(() => {})
      .finally(() => setFoldersLoading(false));

    // 테이블 목록 로드
    fetch("/api/admin/backup?type=list-tables")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.tables)) {
          setTables(d.tables);
          setSelectedTables(new Set(d.tables.map((t: { name: string }) => t.name)));
        }
      })
      .catch(() => {})
      .finally(() => setTablesLoading(false));

    // FTP 설정 로드
    loadFtpSettings();
  }, [loadFtpSettings]);

  const toggleFolder = (name: string) => {
    setSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAllFolders = () => {
    if (selectedFolders.size === folders.length) {
      setSelectedFolders(new Set());
    } else {
      setSelectedFolders(new Set(folders.map((f) => f.name)));
    }
  };

  const toggleTable = (name: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAllTables = () => {
    if (selectedTables.size === tables.length) {
      setSelectedTables(new Set());
    } else {
      setSelectedTables(new Set(tables.map((t) => t.name)));
    }
  };

  const handleDownload = async (type: string) => {
    setDownloading(type);
    try {
      if (type === "source") {
        await downloadFromApi("/api/admin/backup?type=source", "backup-source.zip");
      } else if (type === "files") {
        if (selectedFolders.size === 0) {
          alert("백업할 게시판을 선택해주세요.");
          return;
        }
        const params = new URLSearchParams({ type: "files" });
        [...selectedFolders].forEach((f) => params.append("folders", f));
        await downloadFromApi(`/api/admin/backup?${params}`, "backup-files.zip");
      } else if (type === "db") {
        if (selectedTables.size === 0) {
          alert("백업할 테이블을 선택해주세요.");
          return;
        }
        const params = new URLSearchParams({ type: "db" });
        [...selectedTables].forEach((t) => params.append("tables", t));
        await downloadFromApi(`/api/admin/backup?${params}`, "backup-db.sql");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "다운로드에 실패했습니다.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h1 className="text-base font-bold text-gray-800 flex items-center gap-2">백업 <HelpButton slug="admin-backup" /></h1>
        <p className="text-xs text-gray-500 mt-1">
          홈페이지 프로그램, 첨부파일, 데이터베이스를 백업합니다.
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* ─── 홈페이지 프로그램 백업 ─── */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">💻</span>
                <h2 className="text-sm font-bold text-gray-800">홈페이지 프로그램 백업</h2>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                소스코드(src, prisma, public 등)를 ZIP 파일로 다운로드합니다. node_modules, .next, data 디렉토리는 제외됩니다.
              </p>
            </div>
            <button
              onClick={() => handleDownload("source")}
              disabled={downloading !== null}
              className="px-4 py-2 text-sm text-white rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {downloading === "source" ? <><Spinner /> 다운로드 중...</> : "다운로드"}
            </button>
          </div>
        </div>

        {/* ─── 첨부파일 백업 ─── */}
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">📁</span>
                <h2 className="text-sm font-bold text-gray-800">첨부파일 백업</h2>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                게시판별 첨부파일을 선택하여 ZIP 파일로 다운로드합니다.
              </p>
            </div>
            <button
              onClick={() => handleDownload("files")}
              disabled={downloading !== null || selectedFolders.size === 0}
              className="px-4 py-2 text-sm text-white rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {downloading === "files" ? <><Spinner /> 다운로드 중...</> : "다운로드"}
            </button>
          </div>

          {foldersLoading ? (
            <div className="text-xs text-gray-400 py-2">폴더 목록 로딩 중...</div>
          ) : folders.length === 0 ? (
            <div className="text-xs text-gray-400 py-2">첨부파일 폴더가 없습니다.</div>
          ) : (
            <div className="bg-white rounded border border-green-200 p-2">
              <label className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-gray-700 border-b border-gray-100 mb-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedFolders.size === folders.length}
                  onChange={toggleAllFolders}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-green-600"
                />
                전체선택 ({selectedFolders.size}/{folders.length})
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-0.5 max-h-40 overflow-y-auto">
                {folders.map((folder) => (
                  <label
                    key={folder.name}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 hover:bg-green-50 rounded cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFolders.has(folder.name)}
                      onChange={() => toggleFolder(folder.name)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-green-600 shrink-0"
                    />
                    <span className="truncate">
                      {folder.title ? `${folder.title} (${folder.name})` : folder.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── DB 백업 ─── */}
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🗄️</span>
                <h2 className="text-sm font-bold text-gray-800">DB 백업 (덤프)</h2>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                테이블을 선택하여 SQL 덤프 파일로 다운로드합니다.
              </p>
            </div>
            <button
              onClick={() => handleDownload("db")}
              disabled={downloading !== null || selectedTables.size === 0}
              className="px-4 py-2 text-sm text-white rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {downloading === "db" ? <><Spinner /> 다운로드 중...</> : "다운로드"}
            </button>
          </div>

          {tablesLoading ? (
            <div className="text-xs text-gray-400 py-2">테이블 목록 로딩 중...</div>
          ) : tables.length === 0 ? (
            <div className="text-xs text-gray-400 py-2">테이블 목록을 불러올 수 없습니다.</div>
          ) : (
            <div className="bg-white rounded border border-purple-200 p-2">
              <label className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-gray-700 border-b border-gray-100 mb-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedTables.size === tables.length}
                  onChange={toggleAllTables}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600"
                />
                전체선택 ({selectedTables.size}/{tables.length})
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-0.5 max-h-40 overflow-y-auto">
                {tables.map((table) => (
                  <label
                    key={table.name}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 hover:bg-purple-50 rounded cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTables.has(table.name)}
                      onChange={() => toggleTable(table.name)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 shrink-0"
                    />
                    <span className="truncate">
                      {table.name}{table.comment ? ` (${table.comment})` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── FTP 원격 백업 ─── */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🌐</span>
            <h2 className="text-sm font-bold text-gray-800">FTP 원격 백업</h2>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed mb-4">
            DB 덤프 및 첨부파일을 FTP 서버에 원격 백업합니다.
          </p>

          {/* FTP 설정 폼 */}
          <div className="bg-white rounded border border-amber-200 p-3 mb-4">
            <h3 className="text-xs font-bold text-gray-700 mb-2">FTP 설정</h3>
            {!ftpSettingsLoaded ? (
              <div className="text-xs text-gray-400 py-2">설정 로딩 중...</div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-0.5">호스트</label>
                    <input
                      type="text"
                      value={ftpHost}
                      onChange={(e) => setFtpHost(e.target.value)}
                      placeholder="ftp.example.com"
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-amber-400 focus:border-amber-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-0.5">포트</label>
                    <input
                      type="text"
                      value={ftpPort}
                      onChange={(e) => setFtpPort(e.target.value)}
                      placeholder="21"
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-amber-400 focus:border-amber-400 outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-0.5">사용자</label>
                    <input
                      type="text"
                      value={ftpUser}
                      onChange={(e) => setFtpUser(e.target.value)}
                      placeholder="ftp_user"
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-amber-400 focus:border-amber-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-0.5">비밀번호</label>
                    <input
                      type="password"
                      value={ftpPassword}
                      onChange={(e) => setFtpPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-amber-400 focus:border-amber-400 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">원격 경로</label>
                  <input
                    type="text"
                    value={ftpRemotePath}
                    onChange={(e) => setFtpRemotePath(e.target.value)}
                    placeholder="/backup/dongcheon"
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-amber-400 focus:border-amber-400 outline-none"
                  />
                </div>

                {/* 백업 옵션 */}
                <div className="border-t border-gray-200 pt-2 mt-1">
                  <h4 className="text-xs font-bold text-gray-600 mb-2">정기 백업 옵션</h4>
                  <div className="space-y-2">
                    {/* 켜기/끄기 */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div
                        onClick={() => setFtpEnabled(!ftpEnabled)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${ftpEnabled ? "bg-amber-500" : "bg-gray-300"}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${ftpEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                      </div>
                      <span className={`text-xs font-medium ${ftpEnabled ? "text-amber-700" : "text-gray-400"}`}>
                        정기 백업 {ftpEnabled ? "활성" : "비활성"}
                      </span>
                    </label>

                    {/* 시간 설정 */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 w-16">백업 시간</label>
                      <select value={ftpScheduleHour} onChange={(e) => setFtpScheduleHour(e.target.value)}
                        className="px-2 py-1 text-xs border rounded w-16">
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={String(i)}>{String(i).padStart(2, "0")}시</option>
                        ))}
                      </select>
                      <select value={ftpScheduleMinute} onChange={(e) => setFtpScheduleMinute(e.target.value)}
                        className="px-2 py-1 text-xs border rounded w-16">
                        {[0, 10, 20, 30, 40, 50].map((m) => (
                          <option key={m} value={String(m)}>{String(m).padStart(2, "0")}분</option>
                        ))}
                      </select>
                    </div>

                    {/* 백업 유형 */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 w-16">백업 유형</label>
                      <select value={ftpBackupType} onChange={(e) => setFtpBackupType(e.target.value)}
                        className="px-2 py-1 text-xs border rounded">
                        <option value="full">전체 (DB + 첨부파일)</option>
                        <option value="db">DB만</option>
                        <option value="files">첨부파일만</option>
                      </select>
                    </div>

                    {/* 보관 기간 */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 w-16">보관 기간</label>
                      <select value={ftpKeepDays} onChange={(e) => setFtpKeepDays(e.target.value)}
                        className="px-2 py-1 text-xs border rounded">
                        <option value="7">7일</option>
                        <option value="14">14일</option>
                        <option value="30">30일</option>
                        <option value="60">60일</option>
                        <option value="90">90일</option>
                        <option value="365">1년</option>
                        <option value="0">무제한</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={saveFtpSettings}
                    disabled={ftpSaving}
                    className="px-3 py-1.5 text-xs text-white rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {ftpSaving ? <><Spinner /> 저장 중...</> : "설정 저장"}
                  </button>
                  {ftpMessage && ftpMessage.type === "success" && !ftpRunning && (
                    <span className="text-xs text-green-600">{ftpMessage.text}</span>
                  )}
                  {ftpMessage && ftpMessage.type === "error" && !ftpRunning && (
                    <span className="text-xs text-red-600">{ftpMessage.text}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 마지막 백업 정보 */}
          <div className="bg-white rounded border border-amber-200 p-3 mb-4">
            <h3 className="text-xs font-bold text-gray-700 mb-1">마지막 백업</h3>
            {ftpLastBackup ? (
              <div className="text-xs text-gray-600">
                <span className="font-medium">
                  {new Date(ftpLastBackup).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                </span>
                {ftpLastResult && (
                  <span className={`ml-2 ${ftpLastResult.startsWith("성공") ? "text-green-600" : "text-red-600"}`}>
                    ({ftpLastResult.length > 80 ? ftpLastResult.slice(0, 80) + "..." : ftpLastResult})
                  </span>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-400">백업 이력이 없습니다.</div>
            )}
          </div>

          {/* 백업 실행 버튼 */}
          <div className="bg-white rounded border border-amber-200 p-3 mb-4">
            <h3 className="text-xs font-bold text-gray-700 mb-2">백업 실행</h3>

            {/* 첨부 subtype 선택 (files / full 에 적용) */}
            <div className="flex items-center gap-2 mb-2 text-xs">
              <span className="text-gray-600">첨부 범위:</span>
              <select
                value={filesSubtype}
                onChange={(e) => setFilesSubtype(e.target.value as "all" | "added" | "modified" | "incremental")}
                disabled={ftpRunning !== null}
                className="px-2 py-1 text-xs border border-gray-300 rounded"
              >
                <option value="incremental">증분 (신규+수정)</option>
                <option value="added">신규만</option>
                <option value="modified">수정만</option>
                <option value="all">전체</option>
              </select>
              <span className="text-gray-400 text-[11px]">— DB 백업엔 영향 없음. 모두 단일 압축 파일.</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => runFtpBackup("db")}
                disabled={ftpRunning !== null}
                className="px-3 py-1.5 text-xs text-white rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {ftpRunning === "db" ? <><Spinner /> DB 백업 중...</> : "DB 백업 (.sql.gz)"}
              </button>
              <button
                onClick={() => runFtpBackup("files")}
                disabled={ftpRunning !== null}
                className="px-3 py-1.5 text-xs text-white rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {ftpRunning === "files" ? <><Spinner /> 첨부 백업 중...</> : "첨부 백업 (.tar.gz)"}
              </button>
              <button
                onClick={() => runFtpBackup("full")}
                disabled={ftpRunning !== null}
                className="px-3 py-1.5 text-xs text-white rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {ftpRunning === "full" ? <><Spinner /> 전체 백업 중...</> : "전체 백업 (DB+첨부)"}
              </button>
            </div>
            {ftpRunning && (
              <div className="mt-2 text-xs text-amber-700">
                <Spinner /> FTP 백업을 진행하고 있습니다. 잠시 기다려주세요...
              </div>
            )}
            {ftpMessage && !ftpRunning && !ftpSaving && (
              <div className={`mt-2 text-xs ${ftpMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {ftpMessage.text}
              </div>
            )}
          </div>

          {/* 백업 이력 */}
          <BackupHistorySection />

          {/* 원격 파일 탐색 */}
          <BackupBrowserSection />

          {/* 정기 백업 안내 */}
          <div className={`rounded border p-3 ${ftpEnabled ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-300"}`}>
            <p className={`text-xs font-medium mb-1 ${ftpEnabled ? "text-green-800" : "text-gray-600"}`}>
              ※ 정기 백업 {ftpEnabled ? "활성" : "비활성"} — 매일 {ftpScheduleHour.padStart(2, "0")}:{ftpScheduleMinute.padStart(2, "0")} / {ftpBackupType === "full" ? "전체" : ftpBackupType === "db" ? "DB" : "첨부파일"} / {ftpKeepDays === "0" ? "무제한 보관" : `${ftpKeepDays}일 보관`}
            </p>
            <p className="text-xs text-gray-600 mb-2">
              서버 crontab에 아래 명령을 등록하세요.
            </p>
            <code className="block text-[11px] bg-white/80 border border-gray-200 rounded px-2 py-1.5 text-gray-800 break-all leading-relaxed">
              {ftpScheduleMinute} {ftpScheduleHour} * * * curl -s -X POST http://localhost:3000/api/admin/backup/ftp -H &quot;Content-Type: application/json&quot; -d &apos;{`{"type":"${ftpBackupType}","scheduled":true}`}&apos;
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// 백업 이력 (최근 30건)
// ================================================================
interface HistoryItem {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  type: string;
  trigger: string;
  success: boolean;
  filesCount: number;
  details: string | null;
  errorMessage: string | null;
}

function BackupHistorySection() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backup/history?limit=30", { cache: "no-store" });
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function fmtDuration(ms: number | null) {
    if (ms == null) return "-";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}초`;
    return `${Math.floor(ms / 60_000)}분 ${Math.floor((ms % 60_000) / 1000)}초`;
  }

  return (
    <div className="bg-white rounded border border-amber-200 p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-700">백업 이력 (최근 30건)</h3>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "..." : "새로고침"}
        </button>
      </div>
      {loading && items.length === 0 ? (
        <div className="text-xs text-gray-400">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-gray-400">백업 이력이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-left py-1.5 pr-2 font-medium">시각</th>
                <th className="text-left py-1.5 pr-2 font-medium">종류</th>
                <th className="text-left py-1.5 pr-2 font-medium">트리거</th>
                <th className="text-left py-1.5 pr-2 font-medium">상태</th>
                <th className="text-right py-1.5 pr-2 font-medium">파일수</th>
                <th className="text-right py-1.5 pr-2 font-medium">소요시간</th>
                <th className="text-center py-1.5 font-medium">상세</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <Fragment key={it.id}>
                  <tr className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-1.5 pr-2 font-mono">
                      {new Date(it.startedAt).toLocaleString("ko-KR", {
                        timeZone: "Asia/Seoul",
                        month: "2-digit", day: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="py-1.5 pr-2">
                      {it.type === "full" ? "전체" : it.type === "db" ? "DB" : it.type === "files" ? "첨부" : it.type}
                    </td>
                    <td className="py-1.5 pr-2 text-gray-500">
                      {it.trigger === "scheduled" ? "정기" : "수동"}
                    </td>
                    <td className="py-1.5 pr-2">
                      {it.success ? (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold text-green-700 bg-green-100 rounded">성공</span>
                      ) : it.endedAt ? (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold text-red-700 bg-red-100 rounded">실패</span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold text-gray-600 bg-gray-100 rounded">진행중</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">{it.filesCount}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-gray-500">{fmtDuration(it.durationMs)}</td>
                    <td className="py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => setOpenId(openId === it.id ? null : it.id)}
                        className="text-blue-600 hover:underline"
                      >
                        {openId === it.id ? "닫기" : "보기"}
                      </button>
                    </td>
                  </tr>
                  {openId === it.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={7} className="px-2 py-2 text-[11px] text-gray-700">
                        {it.details && (
                          <pre className="whitespace-pre-wrap break-all border border-gray-200 rounded bg-white p-2 mb-1.5">{it.details}</pre>
                        )}
                        {it.errorMessage && (
                          <pre className="whitespace-pre-wrap break-all border border-red-200 rounded bg-red-50 p-2 text-red-700">{it.errorMessage}</pre>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ================================================================
// 원격 파일 탐색 (NAS FTP LIST 기반)
// ================================================================
interface BrowseEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string | null;
}

function BackupBrowserSection() {
  const [path, setPath] = useState<string | null>(null); // null = 초기, ftp_remote_path 사용
  const [root, setRoot] = useState<string>("/");
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(p: string | null) {
    setLoading(true);
    setError(null);
    try {
      const url = p ? `/api/admin/backup/browse?path=${encodeURIComponent(p)}` : "/api/admin/backup/browse";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "조회 실패");
        setEntries([]);
        return;
      }
      setPath(data.path);
      setRoot(data.root);
      setParent(data.parent);
      setEntries(data.entries || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(null);
  }, []);

  function fmtSize(b: number) {
    if (b < 1024) return `${b}B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)}MB`;
    return `${(b / 1024 / 1024 / 1024).toFixed(2)}GB`;
  }

  return (
    <div className="bg-white rounded border border-amber-200 p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-700">원격 파일 탐색 (NAS)</h3>
        <button
          type="button"
          onClick={() => load(path)}
          disabled={loading}
          className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "..." : "새로고침"}
        </button>
      </div>

      <div className="text-xs text-gray-600 mb-2 font-mono break-all">
        📂 {path || "(loading)"}
      </div>

      {parent !== null && parent !== path && (
        <button
          type="button"
          onClick={() => load(parent)}
          className="text-xs text-blue-600 hover:underline mb-2"
        >
          ↑ 상위 폴더
        </button>
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-2">{error}</div>
      )}

      {loading && entries.length === 0 ? (
        <div className="text-xs text-gray-400">불러오는 중...</div>
      ) : entries.length === 0 ? (
        <div className="text-xs text-gray-400">디렉터리가 비어있습니다.</div>
      ) : (
        <div className="border border-gray-200 rounded max-h-72 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-gray-500">
                <th className="text-left py-1.5 px-2 font-medium">이름</th>
                <th className="text-right py-1.5 px-2 font-medium w-24">크기</th>
                <th className="text-left py-1.5 px-2 font-medium w-40">수정</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="py-1.5 px-2">
                    {e.isDir ? (
                      <button
                        type="button"
                        onClick={() => load(`${path}/${e.name}`.replace(/\/+/g, "/"))}
                        className="text-blue-600 hover:underline text-left"
                      >
                        📁 {e.name}/
                      </button>
                    ) : (
                      <span className="text-gray-700">📄 {e.name}</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-gray-500">
                    {e.isDir ? "-" : fmtSize(e.size)}
                  </td>
                  <td className="py-1.5 px-2 text-gray-500 font-mono text-[10px]">{e.modified || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
