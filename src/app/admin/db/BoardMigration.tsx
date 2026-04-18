"use client";

import { useState, useRef, useEffect } from "react";

interface ConnectionInfo {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface LegacyBoard {
  slug: string;
  title: string;
  postCount: number;
  postsPerPage: number;
  groupNo: number;
}

interface TargetBoard {
  id: number;
  slug: string;
  title: string;
  totalPosts: number;
}

interface DetectedBoard {
  slug: string;
  title: string;
  postCount: number;
  commentCount: number;
  categoryCount: number;
}

interface MigrationResult {
  success: boolean;
  message: string;
  stats?: {
    posts: number;
    comments: number;
    categories: number;
    errors: string[];
    files: string[];
  };
  error?: string;
  detail?: string;
}

// 칼럼 매핑 관련 타입
interface TargetFieldDef {
  field: string;
  label: string;
  type: string;
}

interface ColumnMappingEntry {
  sourceIndex: number;
  sourceColumn: string;
  targetField: string;
  sampleValues: (string | null)[];
}

interface MappingPreview {
  boardSlug: string;
  tableType: "post" | "comment" | "category";
  sourceColumns: string[];
  defaultMapping: ColumnMappingEntry[];
  sampleRows: (string | null)[][];
  totalRows: number;
  targetFields: TargetFieldDef[];
}

interface ConfirmedMapping {
  post: string[];
  comment: string[];
  category: string[];
}

interface MappingPreset {
  name: string;
  createdAt: string;
  mapping: ConfirmedMapping;
}

type MappingStep = "idle" | "loading" | "review" | "confirmed";

// localStorage 키
const PRESETS_STORAGE_KEY = "dc-migration-mapping-presets";

function loadPresets(): MappingPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MappingPreset[];
  } catch {
    return [];
  }
}

function savePresets(presets: MappingPreset[]) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

// 인코딩 자동 감지 (파일 첫 10KB 기반)
async function detectFileEncoding(file: File): Promise<string> {
  const chunk = await file.slice(0, 10240).arrayBuffer();
  const bytes = new Uint8Array(chunk);
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return "utf-8";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(chunk);
    return "utf-8";
  } catch {
    return "euc-kr";
  }
}

// 특정 테이블의 INSERT 문만 추출 (매핑 미리보기용 - 전체 SQL 전송 방지)
function extractTableSqlOnly(sql: string, tableName: string): string {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`INSERT\\s+INTO\\s+\`?${escaped}\`?`, "gi");
  const parts: string[] = [];
  let match;
  while ((match = regex.exec(sql)) !== null) {
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
        pos++;
        continue;
      }
      if (sql[pos] === "'") { inStr = true; pos++; continue; }
      if (sql[pos] === ";") { pos++; break; }
      pos++;
    }
    parts.push(sql.substring(start, pos));
    regex.lastIndex = pos;
    if (parts.length >= 3) break;
  }
  return parts.join("\n");
}

export default function BoardMigration() {
  // 공통
  const [targetBoards, setTargetBoards] = useState<TargetBoard[]>([]);
  const [migrationLog, setMigrationLog] = useState<string[]>([]);

  // 방법 1: 원격 서버 접속
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    host: "", port: 3306, user: "", password: "", database: "",
  });
  const [connected, setConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [legacyBoards, setLegacyBoards] = useState<LegacyBoard[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [directTarget, setDirectTarget] = useState<string>("new");
  const [migrating, setMigrating] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // 방법 2: SQL dump
  const [sqlContent, setSqlContent] = useState("");
  const [sqlMigrating, setSqlMigrating] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectedBoards, setDetectedBoards] = useState<DetectedBoard[]>([]);
  const [selectedDumpBoards, setSelectedDumpBoards] = useState<Set<string>>(new Set());
  const [dumpTargets, setDumpTargets] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [encoding, setEncoding] = useState<string>("auto");
  const [fileRef, setFileRef] = useState<File | null>(null);

  // 칼럼 매핑 확인
  const [mappingStep, setMappingStep] = useState<MappingStep>("idle");
  const [mappingPreview, setMappingPreview] = useState<MappingPreview | null>(null);
  const [currentMapping, setCurrentMapping] = useState<ColumnMappingEntry[]>([]);
  const [mappingTableType, setMappingTableType] = useState<"post" | "comment" | "category">("post");
  const [confirmedMapping, setConfirmedMapping] = useState<ConfirmedMapping | null>(null);
  // MySQL 직접 이관 UI 제거(2026-04-18). 기본값을 "sql" 로 고정.
  const [mappingMethod, setMappingMethod] = useState<"direct" | "sql">("sql");
  const [mappingBoardSlug, setMappingBoardSlug] = useState<string | null>(null);
  // SQL dump 방식: 게시판별 확인된 매핑 저장
  const [dumpMappings, setDumpMappings] = useState<Record<string, ConfirmedMapping>>({});

  // 매핑 프리셋 저장/불러오기
  const [savedPresets, setSavedPresets] = useState<MappingPreset[]>(() => loadPresets());
  const [presetName, setPresetName] = useState("");

  // 테이블 초기화
  const [truncating, setTruncating] = useState(false);
  const [truncateMsg, setTruncateMsg] = useState("");

  const addLog = (msg: string) => {
    setMigrationLog((prev) => [...prev, `[${new Date().toLocaleTimeString("ko-KR")}] ${msg}`]);
  };

  // 테이블 초기화 (AUTO_INCREMENT 포함)
  const handleTruncate = async (tableName: string) => {
    if (!confirm(`정말로 ${tableName} 테이블의 모든 데이터를 삭제하시겠습니까?\nAUTO_INCREMENT도 함께 초기화됩니다.\n이 작업은 되돌릴 수 없습니다.`)) return;
    setTruncating(true);
    setTruncateMsg("");
    addLog(`${tableName} 테이블 초기화 시작...`);
    try {
      const res = await fetch("/api/admin/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "truncate-table", tableName }),
      });
      const data = await res.json();
      if (data.success) {
        setTruncateMsg(data.message || `${tableName} 초기화 완료`);
        addLog(`초기화 완료: ${data.message}`);
      } else {
        setTruncateMsg(`실패: ${data.error}`);
        addLog(`초기화 실패: ${data.error}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTruncateMsg(`오류: ${msg}`);
      addLog(`초기화 오류: ${msg}`);
    } finally {
      setTruncating(false);
    }
  };

  // 대상 게시판 목록 로드
  const loadTargetBoards = async () => {
    try {
      const res = await fetch("/api/admin/db/migrate?action=list-targets");
      const data = await res.json();
      if (data.boards) setTargetBoards(data.boards);
    } catch {
      addLog("대상 게시판 목록 조회 실패");
    }
  };

  // 컴포넌트 마운트 시 대상 게시판 목록 로드
  useEffect(() => {
    loadTargetBoards();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // 칼럼 매핑 미리보기
  // ============================================================

  const fetchMappingPreview = async (
    boardSlug: string,
    tableType: "post" | "comment" | "category",
    method: "sql" | "direct",
  ) => {
    setMappingStep("loading");
    setMappingTableType(tableType);
    setMappingMethod(method);
    setMappingBoardSlug(boardSlug);
    addLog(`[${boardSlug}] ${tableType === "post" ? "게시글" : tableType === "comment" ? "댓글" : "카테고리"} 칼럼 매핑 정보 조회 중...`);

    try {
      const body: Record<string, unknown> = {
        action: "preview-mapping",
        previewMethod: method,
        boardSlug,
        tableType,
      };

      if (method === "sql") {
        // 해당 테이블의 INSERT 문만 추출하여 전송 (전체 SQL 전송 방지)
        const tblName = tableType === "comment" ? `zetyx_board_comment_${boardSlug}`
          : tableType === "category" ? `zetyx_board_category_${boardSlug}`
          : `zetyx_board_${boardSlug}`;
        body.sql = extractTableSqlOnly(sqlContent, tblName);
      } else {
        body.connectionInfo = connectionInfo;
      }

      const res = await fetch("/api/admin/db/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        setMappingPreview(data);
        setCurrentMapping(data.defaultMapping);
        setMappingStep("review");
        addLog(`  ${data.sourceColumns.length}개 칼럼 감지, ${data.totalRows}건 데이터`);
      } else {
        addLog(`  매핑 조회 실패: ${data.error}`);
        // 데이터가 없으면 자동 스킵
        if (data.error?.includes("조회 실패")) {
          handleEmptyTableSkip(boardSlug, tableType, method);
        } else {
          setMappingStep("idle");
        }
      }
    } catch (e) {
      addLog(`  매핑 조회 오류: ${e instanceof Error ? e.message : String(e)}`);
      // 테이블 없는 경우 (댓글/카테고리) 자동 스킵
      handleEmptyTableSkip(boardSlug, tableType, method);
    }
  };

  // 데이터 없는 테이블 자동 스킵
  const handleEmptyTableSkip = (boardSlug: string, tableType: "post" | "comment" | "category", method: "sql" | "direct") => {
    const typeLabel = tableType === "post" ? "게시글" : tableType === "comment" ? "댓글" : "카테고리";
    addLog(`  ${typeLabel} 데이터 없음 - 기본 매핑 사용`);

    if (tableType === "post") {
      // 게시글이 없으면 전체 스킵
      setConfirmedMapping({ post: [], comment: [], category: [] });
      setMappingStep("confirmed");
    } else if (tableType === "comment") {
      setConfirmedMapping(prev => ({
        post: prev?.post || [],
        comment: [],
        category: prev?.category || [],
      }));
      fetchMappingPreview(boardSlug, "category", method);
    } else {
      // 카테고리까지 완료
      setConfirmedMapping(prev => ({
        post: prev?.post || [],
        comment: prev?.comment || [],
        category: [],
      }));
      finalizeMappingConfirmation(boardSlug, {
        post: confirmedMapping?.post || [],
        comment: confirmedMapping?.comment || [],
        category: [],
      });
    }
  };

  const handleMappingChange = (sourceIndex: number, newTargetField: string) => {
    setCurrentMapping(prev =>
      prev.map(entry =>
        entry.sourceIndex === sourceIndex
          ? { ...entry, targetField: newTargetField }
          : entry
      )
    );
  };

  const confirmMapping = () => {
    if (!mappingPreview || !mappingBoardSlug) return;

    const mappingArray = currentMapping.map(e => e.targetField);

    if (mappingTableType === "post") {
      setConfirmedMapping({
        post: mappingArray,
        comment: [],
        category: [],
      });
      // 댓글 매핑으로 진행
      fetchMappingPreview(mappingBoardSlug, "comment", mappingMethod);
    } else if (mappingTableType === "comment") {
      setConfirmedMapping(prev => ({
        post: prev?.post || [],
        comment: mappingArray,
        category: [],
      }));
      // 카테고리 매핑으로 진행
      fetchMappingPreview(mappingBoardSlug, "category", mappingMethod);
    } else {
      // 카테고리까지 완료
      const finalMapping: ConfirmedMapping = {
        post: confirmedMapping?.post || [],
        comment: confirmedMapping?.comment || [],
        category: mappingArray,
      };
      setConfirmedMapping(finalMapping);
      finalizeMappingConfirmation(mappingBoardSlug, finalMapping);
    }
  };

  const finalizeMappingConfirmation = (boardSlug: string, mapping: ConfirmedMapping) => {
    setMappingStep("confirmed");
    addLog(`[${boardSlug}] 칼럼 매핑 확인 완료`);

    // SQL dump 방식이면 게시판별 매핑 저장
    if (mappingMethod === "sql") {
      setDumpMappings(prev => ({
        ...prev,
        [boardSlug]: mapping,
      }));
    }
  };

  const resetMapping = () => {
    setMappingStep("idle");
    setMappingPreview(null);
    setCurrentMapping([]);
    setConfirmedMapping(null);
    setMappingBoardSlug(null);
  };

  // ============================================================
  // 매핑 프리셋 저장/불러오기
  // ============================================================

  const saveCurrentAsPreset = (name: string) => {
    if (!name.trim() || !confirmedMapping) return;
    const preset: MappingPreset = {
      name: name.trim(),
      createdAt: new Date().toLocaleString("ko-KR"),
      mapping: confirmedMapping,
    };
    const updated = [preset, ...savedPresets.filter(p => p.name !== name.trim())];
    setSavedPresets(updated);
    savePresets(updated);
    setPresetName("");
    addLog(`매핑 프리셋 "${name.trim()}" 저장 완료`);
  };

  const deletePreset = (name: string) => {
    const updated = savedPresets.filter(p => p.name !== name);
    setSavedPresets(updated);
    savePresets(updated);
    addLog(`매핑 프리셋 "${name}" 삭제`);
  };

  const applyPresetToMapping = (preset: MappingPreset) => {
    // 현재 리뷰 중인 매핑에 프리셋의 해당 테이블 타입 매핑을 적용
    if (!mappingPreview) return;
    const presetArray = mappingTableType === "post" ? preset.mapping.post
      : mappingTableType === "comment" ? preset.mapping.comment
      : preset.mapping.category;
    if (!presetArray.length) return;

    setCurrentMapping(prev =>
      prev.map((entry, idx) => ({
        ...entry,
        targetField: idx < presetArray.length ? presetArray[idx] : "_skip",
      }))
    );
    addLog(`프리셋 "${preset.name}" 적용 (${mappingTableType})`);
  };

  // 프리셋을 선택된 모든 dump 게시판에 일괄 적용
  const applyPresetToAllDumpBoards = (preset: MappingPreset) => {
    const boards = detectedBoards.filter(b => selectedDumpBoards.has(b.slug));
    const updated = { ...dumpMappings };
    for (const board of boards) {
      updated[board.slug] = preset.mapping;
    }
    setDumpMappings(updated);
    addLog(`프리셋 "${preset.name}"을 선택된 ${boards.length}개 게시판에 일괄 적용`);
  };

  // ============================================================
  // 방법 1: 원격 MySQL 서버 접속
  // ============================================================

  // 접속 테스트
  const testConnection = async () => {
    if (!connectionInfo.host || !connectionInfo.user || !connectionInfo.database) {
      setConnectionMessage("호스트, 사용자, DB명을 입력하세요.");
      return;
    }

    setTestingConnection(true);
    setConnectionMessage("");
    setConnected(false);
    setLegacyBoards([]);
    addLog(`접속 테스트: ${connectionInfo.host}:${connectionInfo.port}/${connectionInfo.database}...`);

    try {
      const res = await fetch("/api/admin/db/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test-connection",
          connectionInfo,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setConnected(true);
        setConnectionMessage(data.message + (data.hasAdminTable ? " (제로보드 테이블 확인)" : " (zetyx_admin_table 없음)"));
        addLog(`접속 성공: ${data.message}`);
        await loadTargetBoards();
      } else {
        setConnectionMessage(data.error || "접속 실패");
        addLog(`접속 실패: ${data.error}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setConnectionMessage(`접속 오류: ${msg}`);
      addLog(`접속 오류: ${msg}`);
    } finally {
      setTestingConnection(false);
    }
  };

  // 원격 게시판 목록 조회
  const loadLegacyBoards = async () => {
    setLoadingBoards(true);
    setLegacyBoards([]);
    addLog("레거시 게시판 목록 조회 중...");

    try {
      const res = await fetch("/api/admin/db/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "list-legacy",
          connectionInfo,
        }),
      });
      const data = await res.json();

      if (data.error) {
        addLog(`오류: ${data.error}`);
      } else if (data.boards) {
        setLegacyBoards(data.boards);
        addLog(`${data.boards.length}개 게시판 발견`);
      }
    } catch (e) {
      addLog(`조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingBoards(false);
    }
  };

  // 직접 이관 실행
  const runDirectMigration = async (boardSlug: string) => {
    setMigrating(true);
    const isNew = directTarget === "new";
    addLog(`게시판 '${boardSlug}' 이관 시작... (대상: ${isNew ? "새 게시판 생성" : `ID ${directTarget}`})`);

    try {
      const body: Record<string, unknown> = {
        method: "direct",
        connectionInfo,
        boardSlug,
      };
      if (isNew) {
        body.createNew = true;
      } else {
        body.targetBoardId = parseInt(directTarget, 10);
      }

      // 확인된 매핑이 있으면 포함
      if (confirmedMapping && confirmedMapping.post.length > 0) {
        body.columnMapping = confirmedMapping;
      }

      const res = await fetch("/api/admin/db/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result: MigrationResult = await res.json();
      handleMigrationResult(result);
      if (result.success) {
        await loadTargetBoards();
        resetMapping();
      }
    } catch (e) {
      addLog(`이관 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setMigrating(false);
    }
  };

  // ============================================================
  // 방법 2: SQL dump
  // ============================================================

  // 파일 업로드 (인코딩 자동 감지)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileRef(file);
    addLog(`파일 로드 중: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

    try {
      let enc = encoding;
      if (enc === "auto") {
        enc = await detectFileEncoding(file);
        setEncoding(enc);
      }

      const buffer = await file.arrayBuffer();
      const text = new TextDecoder(enc).decode(buffer);
      setSqlContent(text);
      addLog(`파일 로드 완료: ${text.length.toLocaleString()}자 (인코딩: ${enc})`);

      // 클라이언트에서 게시판 감지 (서버 호출 없음 → 응답대기 해결)
      detectBoardsClient(text);
      await loadTargetBoards();
    } catch (err) {
      addLog(`파일 읽기 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 인코딩 변경 시 파일 재로드
  const reloadWithEncoding = async (newEncoding: string) => {
    setEncoding(newEncoding);
    if (!fileRef) return;

    try {
      const buffer = await fileRef.arrayBuffer();
      const enc = newEncoding === "auto" ? await detectFileEncoding(fileRef) : newEncoding;
      const text = new TextDecoder(enc).decode(buffer);
      setSqlContent(text);
      addLog(`인코딩 변경: ${enc} → ${text.length.toLocaleString()}자 재로드`);
      detectBoardsClient(text);
    } catch (err) {
      addLog(`인코딩 변경 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 클라이언트 측 게시판 감지 (서버 호출 없이 SQL 직접 파싱 → 응답대기 해결)
  const detectBoardsClient = (sql: string) => {
    if (!sql || sql.length < 10) return;

    setDetecting(true);
    setDetectedBoards([]);
    setSelectedDumpBoards(new Set());
    setDumpTargets({});
    setDumpMappings({});
    addLog("게시판 자동 감지 중...");

    try {
      const boardMap = new Map<string, DetectedBoard>();
      let hasAdminTable = false;
      let hasMemberTable = false;

      // INSERT INTO 패턴으로 테이블 감지 및 행 수 카운트
      const insertRegex = /INSERT\s+INTO\s+`?(zetyx_\w+)`?\s+(?:\([^)]*\)\s+)?VALUES\s*/gi;
      let match;

      while ((match = insertRegex.exec(sql)) !== null) {
        const fullTable = match[1];
        if (fullTable === "zetyx_admin_table") hasAdminTable = true;
        if (fullTable === "zetyx_member_table") hasMemberTable = true;

        let slug: string;
        let type: "post" | "comment" | "category" | "other";

        if (fullTable.startsWith("zetyx_board_comment_")) {
          slug = fullTable.substring("zetyx_board_comment_".length);
          type = "comment";
        } else if (fullTable.startsWith("zetyx_board_category_")) {
          slug = fullTable.substring("zetyx_board_category_".length);
          type = "category";
        } else if (fullTable.startsWith("zetyx_board_")) {
          slug = fullTable.substring("zetyx_board_".length);
          type = "post";
        } else {
          type = "other";
          slug = "";
        }

        // VALUES 이후 행 수 카운트 (top-level 괄호 쌍)
        let rowCount = 0;
        let pos = match.index + match[0].length;
        let inStr = false;
        let depth = 0;

        while (pos < sql.length) {
          const ch = sql[pos];
          if (inStr) {
            if (ch === "\\") { pos += 2; continue; }
            if (ch === "'") {
              if (pos + 1 < sql.length && sql[pos + 1] === "'") { pos += 2; continue; }
              inStr = false;
            }
            pos++;
            continue;
          }
          if (ch === "'") { inStr = true; pos++; continue; }
          if (ch === "(") { if (depth === 0) rowCount++; depth++; pos++; continue; }
          if (ch === ")") { depth--; pos++; continue; }
          if (ch === ";" && depth === 0) break;
          pos++;
        }
        insertRegex.lastIndex = pos;

        if (type === "other") continue;

        if (!boardMap.has(slug)) {
          boardMap.set(slug, { slug, title: slug, postCount: 0, commentCount: 0, categoryCount: 0 });
        }
        const board = boardMap.get(slug)!;
        if (type === "post") board.postCount += rowCount;
        else if (type === "comment") board.commentCount += rowCount;
        else if (type === "category") board.categoryCount += rowCount;
      }

      // admin_table에서 게시판 제목 추출
      if (hasAdminTable) {
        const adminPattern = /INSERT\s+INTO\s+`?zetyx_admin_table`?\s+VALUES\s*\(\s*'([^'\\]*(?:\\.[^'\\]*)*)'\s*,\s*\d+\s*,\s*'([^'\\]*(?:\\.[^'\\]*)*)'/gi;
        let am;
        while ((am = adminPattern.exec(sql)) !== null) {
          const aSlug = am[1].replace(/\\'/g, "'");
          const aTitle = am[2].replace(/\\'/g, "'");
          if (boardMap.has(aSlug)) {
            boardMap.get(aSlug)!.title = aTitle || aSlug;
          }
        }
      }

      const boards = Array.from(boardMap.values()).sort((a, b) => b.postCount - a.postCount);
      setDetectedBoards(boards);

      const autoSelected = new Set<string>();
      const targets: Record<string, string> = {};
      for (const b of boards) {
        if (b.postCount > 0) autoSelected.add(b.slug);
        // slug가 일치하는 기존 게시판이 있으면 자동 매핑, 없으면 새 게시판 생성
        const matched = targetBoards.find(
          (tb) => tb.slug.toLowerCase() === b.slug.toLowerCase()
        );
        targets[b.slug] = matched ? String(matched.id) : "new";
      }
      setSelectedDumpBoards(autoSelected);
      setDumpTargets(targets);

      addLog(`${boards.length}개 게시판 감지 (게시글 있는 게시판: ${autoSelected.size}개)`);
      if (hasAdminTable) addLog("  zetyx_admin_table 데이터 포함");
      if (hasMemberTable) addLog("  zetyx_member_table 데이터 포함");
    } catch (e) {
      addLog(`감지 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDetecting(false);
    }
  };

  // dump 이관 실행 (선택된 게시판들 순차 실행)
  const runDumpMigration = async () => {
    const boardsToMigrate = detectedBoards.filter((b) => selectedDumpBoards.has(b.slug));
    if (boardsToMigrate.length === 0) {
      addLog("이관할 게시판을 선택하세요.");
      return;
    }
    if (!sqlContent.trim()) {
      addLog("SQL 데이터가 필요합니다.");
      return;
    }

    // 매핑 미확인 게시판 경고
    const unmapped = boardsToMigrate.filter(b => !dumpMappings[b.slug]);
    if (unmapped.length > 0) {
      if (!confirm(`${unmapped.map(b => b.slug).join(", ")} 게시판의 칼럼 매핑이 확인되지 않았습니다.\n기본 매핑으로 진행하시겠습니까?`)) {
        return;
      }
    }

    setSqlMigrating(true);
    addLog(`=== ${boardsToMigrate.length}개 게시판 이관 시작 ===`);

    for (const board of boardsToMigrate) {
      const target = dumpTargets[board.slug] || "new";
      const isNew = target === "new";
      addLog(`[${board.slug}] 이관 시작... (대상: ${isNew ? "새 게시판 생성" : `ID ${target}`})`);

      try {
        const body: Record<string, unknown> = {
          method: "sql",
          boardName: board.slug,
          sql: sqlContent,
        };
        if (isNew) {
          body.createNew = true;
        } else {
          body.targetBoardId = parseInt(target, 10);
        }

        // 확인된 매핑이 있으면 포함
        const boardMapping = dumpMappings[board.slug];
        if (boardMapping && boardMapping.post.length > 0) {
          body.columnMapping = boardMapping;
        }

        // 항상 FormData 사용 (대용량 JSON.stringify 블로킹 방지 → 응답대기 해결)
        const formData = new FormData();
        formData.append("method", "sql");
        formData.append("boardName", board.slug);
        formData.append("sqlFile", new Blob([sqlContent], { type: "text/plain" }), "dump.sql");
        if (isNew) {
          formData.append("createNew", "true");
        } else {
          formData.append("targetBoardId", target);
        }
        if (boardMapping && boardMapping.post.length > 0) {
          formData.append("columnMapping", JSON.stringify(boardMapping));
        }
        const res = await fetch("/api/admin/db/migrate", {
          method: "POST",
          body: formData,
        });

        const result: MigrationResult = await res.json();
        if (result.success) {
          addLog(`  [${board.slug}] ${result.message}`);
          if (result.stats?.errors?.length) {
            for (const err of result.stats.errors.slice(0, 5)) {
              addLog(`    경고: ${err}`);
            }
            if (result.stats.errors.length > 5) {
              addLog(`    ... 외 ${result.stats.errors.length - 5}건의 경고`);
            }
          }
        } else {
          addLog(`  [${board.slug}] 실패: ${result.error}${result.detail ? ` - ${result.detail}` : ""}`);
        }
      } catch (e) {
        addLog(`  [${board.slug}] 오류: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    addLog(`=== 이관 완료 ===`);
    await loadTargetBoards();
    setSqlMigrating(false);
  };

  // 공통: 이관 결과 로그
  const handleMigrationResult = (result: MigrationResult) => {
    if (result.success) {
      addLog(`성공: ${result.message}`);
      if (result.stats?.errors?.length) {
        for (const err of result.stats.errors.slice(0, 20)) {
          addLog(`  경고: ${err}`);
        }
        if (result.stats.errors.length > 20) {
          addLog(`  ... 외 ${result.stats.errors.length - 20}건의 경고`);
        }
      }
      if (result.stats?.files?.length) {
        addLog(`  첨부파일 ${result.stats.files.length}건 수동 복사 필요`);
      }
    } else {
      addLog(`실패: ${result.error}${result.detail ? `\n  ${result.detail}` : ""}`);
    }
  };

  // 대상 게시판 선택 드롭다운
  const TargetSelect = ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded px-2 py-1.5 text-sm w-full"
    >
      <option value="new">새 게시판 생성</option>
      {targetBoards.map((b) => (
        <option key={b.id} value={String(b.id)}>
          {b.title} ({b.slug}) - {b.totalPosts}건
        </option>
      ))}
    </select>
  );

  // 접속정보 필드 업데이트
  const updateConn = (field: keyof ConnectionInfo, value: string | number) => {
    setConnectionInfo((prev) => ({ ...prev, [field]: value }));
    setConnected(false);
    setConnectionMessage("");
  };

  // ============================================================
  // 칼럼 매핑 확인 UI
  // ============================================================
  const renderMappingReview = () => {
    if (mappingStep === "loading") {
      return (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            칼럼 매핑 정보 조회 중...
          </div>
        </div>
      );
    }

    if (mappingStep !== "review" || !mappingPreview) return null;

    const isDirectMethod = mappingMethod === "direct";
    const bgClass = isDirectMethod ? "bg-blue-50 border-blue-200" : "bg-green-50 border-green-200";
    const textClass = isDirectMethod ? "text-blue-700" : "text-green-700";
    const btnClass = isDirectMethod ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700";

    // 유효성 검사
    const assigned = currentMapping.filter(e => e.targetField !== "_skip");
    const targetFieldCounts = new Map<string, number>();
    for (const e of assigned) {
      targetFieldCounts.set(e.targetField, (targetFieldCounts.get(e.targetField) || 0) + 1);
    }
    const duplicates = Array.from(targetFieldCounts.entries()).filter(([, count]) => count > 1);

    const requiredFields = mappingTableType === "post"
      ? ["no", "subject", "memo"]
      : mappingTableType === "comment"
        ? ["no", "parent", "memo"]
        : ["no", "name"];
    const missingRequired = requiredFields.filter(f => !assigned.some(e => e.targetField === f));

    const typeLabel = mappingTableType === "post" ? "게시글" : mappingTableType === "comment" ? "댓글" : "카테고리";
    const stepNum = mappingTableType === "post" ? 1 : mappingTableType === "comment" ? 2 : 3;

    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className={`px-4 py-3 border-b ${bgClass}`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold ${textClass}`}>
              칼럼 매핑 확인 - {mappingPreview.boardSlug}
              <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-normal">
                {typeLabel}
              </span>
            </h3>
            <span className="text-xs text-gray-500">{stepNum}/3 단계</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            전체 {mappingPreview.totalRows.toLocaleString()}건 중 처음 {mappingPreview.sampleRows.length}건 미리보기.
            각 소스 칼럼이 올바른 대상 필드에 매핑되었는지 확인하세요.
          </p>
        </div>

        {/* 저장된 프리셋 불러오기 */}
        {savedPresets.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 shrink-0">저장된 프리셋:</span>
            {savedPresets.map(p => (
              <button
                key={p.name}
                onClick={() => applyPresetToMapping(p)}
                className="px-2 py-0.5 text-xs bg-white border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300"
                title={`${p.createdAt}에 저장`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-500">
                <th className="py-2 px-3 text-left font-medium w-8">#</th>
                <th className="py-2 px-3 text-left font-medium">소스 칼럼</th>
                <th className="py-2 px-3 text-left font-medium w-52">대상 필드</th>
                {mappingPreview.sampleRows.map((_, i) => (
                  <th key={i} className="py-2 px-3 text-left font-medium">샘플 {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {currentMapping.map((entry) => (
                <tr
                  key={entry.sourceIndex}
                  className={`hover:bg-gray-50 ${entry.targetField === "_skip" ? "opacity-40" : ""}`}
                >
                  <td className="py-1.5 px-3 text-gray-400">{entry.sourceIndex}</td>
                  <td className="py-1.5 px-3 font-mono font-medium">{entry.sourceColumn}</td>
                  <td className="py-1.5 px-3">
                    <select
                      value={entry.targetField}
                      onChange={(e) => handleMappingChange(entry.sourceIndex, e.target.value)}
                      className={`border rounded px-2 py-1 text-xs w-full ${
                        entry.targetField === "_skip" ? "text-gray-400" : ""
                      }`}
                    >
                      {mappingPreview.targetFields.map((tf) => (
                        <option key={tf.field} value={tf.field}>{tf.label}</option>
                      ))}
                    </select>
                  </td>
                  {entry.sampleValues.map((val, i) => (
                    <td
                      key={i}
                      className="py-1.5 px-3 font-mono max-w-[200px] truncate"
                      title={val ?? "NULL"}
                    >
                      {val !== null ? (
                        val.length > 50 ? val.substring(0, 50) + "..." : val
                      ) : (
                        <span className="text-gray-300 italic">NULL</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 유효성 경고 */}
        {(duplicates.length > 0 || missingRequired.length > 0) && (
          <div className="px-4 py-2 bg-yellow-50 border-t border-yellow-200 space-y-1">
            {duplicates.length > 0 && (
              <p className="text-xs text-yellow-700">
                경고: 중복 매핑된 필드가 있습니다 - {duplicates.map(([field]) => field).join(", ")}
              </p>
            )}
            {missingRequired.length > 0 && (
              <p className="text-xs text-yellow-700">
                경고: 필수 필드가 매핑되지 않았습니다 - {missingRequired.join(", ")}
              </p>
            )}
          </div>
        )}

        {/* 버튼 */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={resetMapping}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100"
          >
            취소
          </button>
          <button
            onClick={confirmMapping}
            className={`px-5 py-1.5 text-sm text-white rounded ${btnClass}`}
          >
            {mappingTableType === "category" ? "매핑 확인 완료" : "확인 및 다음"}
          </button>
        </div>
      </div>
    );
  };

  // 매핑 확인 완료 후 프리셋 저장 UI
  const renderPresetSaveBar = () => {
    if (mappingStep !== "confirmed" || !confirmedMapping) return null;

    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-600 shrink-0">이 매핑을 프리셋으로 저장:</span>
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && presetName.trim()) {
                saveCurrentAsPreset(presetName);
              }
            }}
            className="border rounded px-2 py-1 text-sm flex-1 min-w-[120px]"
            placeholder="프리셋 이름 (예: 제로보드 기본)"
          />
          <button
            onClick={() => saveCurrentAsPreset(presetName)}
            disabled={!presetName.trim()}
            className="px-3 py-1 bg-gray-700 text-white text-xs rounded hover:bg-gray-800 disabled:opacity-50"
          >
            저장
          </button>
        </div>
        {savedPresets.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100">
            <span className="text-xs text-gray-400">저장된 프리셋: </span>
            {savedPresets.map(p => (
              <span key={p.name} className="inline-flex items-center gap-1 mr-2">
                <span className="text-xs text-gray-600">{p.name}</span>
                <button
                  onClick={() => deletePreset(p.name)}
                  className="text-xs text-red-400 hover:text-red-600"
                  title="삭제"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ===== 이관 전 테이블 초기화 ===== */}
      <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
        <div className="px-4 py-3 bg-red-50 border-b border-red-200">
          <h2 className="text-sm font-bold text-red-700">이관 전 테이블 초기화</h2>
          <p className="text-xs text-red-600 mt-1">
            이관 전 기존 데이터를 삭제하고 AUTO_INCREMENT를 초기화합니다.
            <strong> 주의: 모든 데이터가 영구 삭제됩니다.</strong>
          </p>
        </div>
        <div className="p-4">
          <div className="flex gap-3 items-center flex-wrap">
            <button
              onClick={() => handleTruncate("Post")}
              disabled={truncating}
              className="px-4 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
            >
              게시글(Post) 초기화
            </button>
            <button
              onClick={() => handleTruncate("Comment")}
              disabled={truncating}
              className="px-4 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
            >
              댓글(Comment) 초기화
            </button>
            <button
              onClick={() => handleTruncate("Category")}
              disabled={truncating}
              className="px-4 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
            >
              카테고리(Category) 초기화
            </button>
            {truncating && <span className="text-xs text-gray-500">초기화 중...</span>}
            {truncateMsg && !truncating && (
              <span className={`text-xs ${truncateMsg.includes("실패") || truncateMsg.includes("오류") ? "text-red-500" : "text-green-600"}`}>
                {truncateMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ===== 방법 1 (MySQL 서버 접속 이관) 은 2026-04-18 UI에서 제거 =====
          아래 블록은 유지보수를 위해 남겨두되 false 가드로 렌더 안 함.
          SQL dump 업로드(방법 2) 만 실제로 사용. */}
      {false && (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
          <h2 className="text-sm font-bold text-blue-700">
            방법 1: MySQL 서버 접속 이관
          </h2>
          <p className="text-xs text-blue-600 mt-1">
            레거시 MySQL 서버에 접속하여 게시판 목록을 조회하고 하나씩 이관합니다.
          </p>
        </div>
        <div className="p-4 space-y-4">
          {/* 접속정보 입력 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-gray-600 mb-1">호스트</label>
              <input
                type="text"
                value={connectionInfo.host}
                onChange={(e) => updateConn("host", e.target.value)}
                className="border rounded px-3 py-1.5 text-sm w-full"
                placeholder="jd1.nskorea.com"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">포트</label>
              <input
                type="number"
                value={connectionInfo.port}
                onChange={(e) => updateConn("port", parseInt(e.target.value, 10) || 3306)}
                className="border rounded px-3 py-1.5 text-sm w-full"
                placeholder="3306"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">사용자</label>
              <input
                type="text"
                value={connectionInfo.user}
                onChange={(e) => updateConn("user", e.target.value)}
                className="border rounded px-3 py-1.5 text-sm w-full"
                placeholder="pkistdc"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">비밀번호</label>
              <input
                type="password"
                value={connectionInfo.password}
                onChange={(e) => updateConn("password", e.target.value)}
                className="border rounded px-3 py-1.5 text-sm w-full"
                placeholder="••••••"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">DB명</label>
              <input
                type="text"
                value={connectionInfo.database}
                onChange={(e) => updateConn("database", e.target.value)}
                className="border rounded px-3 py-1.5 text-sm w-full"
                placeholder="pkistdc"
              />
            </div>
          </div>

          {/* 접속 테스트 + 게시판 조회 버튼 */}
          <div className="flex gap-2 items-center flex-wrap">
            <button
              onClick={testConnection}
              disabled={testingConnection || !connectionInfo.host || !connectionInfo.user || !connectionInfo.database}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {testingConnection ? "접속 중..." : "접속 테스트"}
            </button>
            <button
              onClick={loadLegacyBoards}
              disabled={!connected || loadingBoards}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loadingBoards ? "조회 중..." : "게시판 목록 조회"}
            </button>
            {connectionMessage && (
              <span className={`text-xs ${connected ? "text-green-600" : "text-red-500"}`}>
                {connectionMessage}
              </span>
            )}
          </div>

          {/* 레거시 게시판 목록 */}
          {legacyBoards.length > 0 && (
            <div className="border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-500 text-xs">
                    <th className="py-2 px-3 text-left font-medium">게시판 ID</th>
                    <th className="py-2 px-3 text-left font-medium">게시판명</th>
                    <th className="py-2 px-3 text-right font-medium">게시글 수</th>
                    <th className="py-2 px-3 text-center font-medium w-48">이관 대상</th>
                    <th className="py-2 px-3 text-center font-medium w-32">실행</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {legacyBoards.map((board) => (
                    <tr
                      key={board.slug}
                      className={`hover:bg-gray-50 ${selectedBoard === board.slug ? "bg-blue-50" : ""}`}
                    >
                      <td className="py-2 px-3 font-mono text-xs">{board.slug}</td>
                      <td className="py-2 px-3">{board.title}</td>
                      <td className="py-2 px-3 text-right">{board.postCount.toLocaleString()}</td>
                      <td className="py-2 px-3">
                        {selectedBoard === board.slug ? (
                          <TargetSelect value={directTarget} onChange={setDirectTarget} />
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedBoard(board.slug);
                              setDirectTarget("new");
                              resetMapping();
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            선택
                          </button>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {selectedBoard === board.slug && (
                          <>
                            {mappingStep === "confirmed" && mappingBoardSlug === board.slug ? (
                              <button
                                onClick={() => runDirectMigration(board.slug)}
                                disabled={migrating}
                                className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {migrating ? "이관중" : "이관 실행"}
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  resetMapping();
                                  setConfirmedMapping(null);
                                  fetchMappingPreview(board.slug, "post", "direct");
                                }}
                                disabled={mappingStep === "loading"}
                                className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 disabled:opacity-50"
                              >
                                {mappingStep === "loading" && mappingBoardSlug === board.slug ? "조회중" : "칼럼 매핑 확인"}
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 방법 1: 매핑 확인 패널 */}
          {mappingMethod === "direct" && renderMappingReview()}
          {mappingMethod === "direct" && renderPresetSaveBar()}
        </div>
      </div>
      )}

      {/* ===== SQL dump 파일 이관 (유일한 방법) ===== */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-green-50 border-b border-green-200">
          <h2 className="text-sm font-bold text-green-700">
            SQL dump 파일 이관
          </h2>
          <p className="text-xs text-green-600 mt-1">
            제로보드 SQL 백업 파일(mysqldump)을 업로드하면 게시판을 자동 감지하여 이관합니다.
          </p>
        </div>
        <div className="p-4 space-y-4">
          {/* 파일 업로드 */}
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-600 mb-1">SQL 파일 업로드</label>
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed rounded cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-colors">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-sm text-gray-500 truncate">
                  {sqlContent ? `${(sqlContent.length / 1024).toFixed(0)}KB 로드됨` : ".sql 파일 선택"}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sql,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
            <div className="w-28">
              <label className="block text-xs text-gray-600 mb-1">인코딩</label>
              <select
                value={encoding}
                onChange={(e) => reloadWithEncoding(e.target.value)}
                className="border rounded px-2 py-2 text-sm w-full"
              >
                <option value="auto">자동감지</option>
                <option value="utf-8">UTF-8</option>
                <option value="euc-kr">EUC-KR</option>
              </select>
            </div>
            {sqlContent && !detecting && detectedBoards.length === 0 && (
              <button
                onClick={() => { detectBoardsClient(sqlContent); loadTargetBoards(); }}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
              >
                게시판 감지
              </button>
            )}
            {detecting && (
              <span className="text-xs text-gray-500 py-2">감지 중...</span>
            )}
          </div>

          {/* SQL 직접 입력 (접이식) */}
          <details className="text-sm">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
              또는 SQL 직접 입력 (INSERT INTO 문)
            </summary>
            <div className="mt-2 space-y-2">
              <textarea
                value={sqlContent}
                onChange={(e) => {
                  setSqlContent(e.target.value);
                  setDetectedBoards([]);
                  setSelectedDumpBoards(new Set());
                  setDumpMappings({});
                }}
                rows={8}
                className="w-full border rounded px-3 py-2 text-xs font-mono resize-y"
                placeholder={`INSERT INTO \`zetyx_board_DcNotice\` VALUES (1, -1, 0, 0, 1, '관리자', 'pw', '', '', '제목', '내용', '127.0.0.1', 1609459200, 50, 3, 'admin', 1, '', '', '', '', '', '', 0, 0, '', '', 2, 1, 0, 0, 0, 0, 0);\n\nINSERT INTO \`zetyx_board_comment_DcNotice\` VALUES (1, 1, '홍길동', 'pw', '댓글 내용', '127.0.0.1', 1609459300, '');`}
              />
              {sqlContent && detectedBoards.length === 0 && (
                <button
                  onClick={() => { detectBoardsClient(sqlContent); loadTargetBoards(); }}
                  disabled={detecting}
                  className="px-4 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {detecting ? "감지 중..." : "게시판 감지"}
                </button>
              )}
            </div>
          </details>

          {/* 감지된 게시판 목록 */}
          {detectedBoards.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-700">
                  감지된 게시판 ({detectedBoards.length}개)
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const all = new Set(detectedBoards.filter((b) => b.postCount > 0).map((b) => b.slug));
                      setSelectedDumpBoards(all);
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    전체 선택
                  </button>
                  <button
                    onClick={() => setSelectedDumpBoards(new Set())}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    전체 해제
                  </button>
                </div>
              </div>

              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-gray-500 text-xs">
                      <th className="py-2 px-3 text-center font-medium w-10">선택</th>
                      <th className="py-2 px-3 text-left font-medium">게시판 ID</th>
                      <th className="py-2 px-3 text-left font-medium">게시판명</th>
                      <th className="py-2 px-3 text-right font-medium">게시글</th>
                      <th className="py-2 px-3 text-right font-medium">댓글</th>
                      <th className="py-2 px-3 text-right font-medium">카테고리</th>
                      <th className="py-2 px-3 text-center font-medium w-44">이관 대상</th>
                      <th className="py-2 px-3 text-center font-medium w-24">매핑</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detectedBoards.map((board) => (
                      <tr
                        key={board.slug}
                        className={`hover:bg-gray-50 ${selectedDumpBoards.has(board.slug) ? "bg-green-50" : ""}`}
                      >
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedDumpBoards.has(board.slug)}
                            onChange={(e) => {
                              const next = new Set(selectedDumpBoards);
                              if (e.target.checked) {
                                next.add(board.slug);
                              } else {
                                next.delete(board.slug);
                              }
                              setSelectedDumpBoards(next);
                            }}
                            className="w-4 h-4 accent-green-600"
                          />
                        </td>
                        <td className="py-2 px-3 font-mono text-xs">{board.slug}</td>
                        <td className="py-2 px-3">{board.title}</td>
                        <td className="py-2 px-3 text-right">{board.postCount.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right text-gray-500">{board.commentCount.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right text-gray-500">{board.categoryCount}</td>
                        <td className="py-2 px-3">
                          <TargetSelect
                            value={dumpTargets[board.slug] || "new"}
                            onChange={(v) => setDumpTargets((prev) => ({ ...prev, [board.slug]: v }))}
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          {dumpMappings[board.slug] ? (
                            <span className="text-xs text-green-600 font-medium">확인됨</span>
                          ) : (
                            <button
                              onClick={() => {
                                resetMapping();
                                setConfirmedMapping(null);
                                fetchMappingPreview(board.slug, "post", "sql");
                              }}
                              disabled={mappingStep === "loading"}
                              className="text-xs text-green-600 hover:underline disabled:opacity-50"
                            >
                              {mappingStep === "loading" && mappingBoardSlug === board.slug ? "조회중" : "매핑 확인"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 프리셋 일괄 적용 */}
              {savedPresets.length > 0 && selectedDumpBoards.size > 0 && (
                <div className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded text-sm">
                  <span className="text-purple-700 font-medium text-xs">프리셋 일괄 적용:</span>
                  <select
                    className="border border-purple-300 rounded px-2 py-1 text-xs bg-white"
                    defaultValue=""
                    id="bulk-preset-select"
                  >
                    <option value="" disabled>프리셋 선택...</option>
                    {savedPresets.map((p, i) => (
                      <option key={i} value={i}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const sel = document.getElementById("bulk-preset-select") as HTMLSelectElement;
                      const idx = parseInt(sel.value);
                      if (!isNaN(idx) && savedPresets[idx]) {
                        applyPresetToAllDumpBoards(savedPresets[idx]);
                      }
                    }}
                    className="px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                  >
                    선택 게시판에 일괄 적용 ({selectedDumpBoards.size}개)
                  </button>
                  <span className="text-xs text-purple-500">
                    선택된 게시판에 매핑 프리셋을 한번에 적용합니다.
                  </span>
                </div>
              )}

              {/* 방법 2: 매핑 확인 패널 */}
              {mappingMethod === "sql" && renderMappingReview()}
              {mappingMethod === "sql" && renderPresetSaveBar()}

              {/* 이관 실행 */}
              <div className="flex gap-3 items-center">
                <button
                  onClick={runDumpMigration}
                  disabled={sqlMigrating || selectedDumpBoards.size === 0}
                  className="px-5 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {sqlMigrating ? "이관 중..." : `선택 항목 이관 실행 (${selectedDumpBoards.size}개)`}
                </button>
                {sqlMigrating && (
                  <span className="text-xs text-gray-500">대용량 이관은 시간이 걸릴 수 있습니다.</span>
                )}
                {!sqlMigrating && selectedDumpBoards.size > 0 && (
                  <span className="text-xs text-gray-400">
                    매핑 확인됨: {Object.keys(dumpMappings).filter(k => selectedDumpBoards.has(k)).length}/{selectedDumpBoards.size}개
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== 이관 로그 ===== */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">이관 로그</h2>
          {migrationLog.length > 0 && (
            <button
              onClick={() => setMigrationLog([])}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              지우기
            </button>
          )}
        </div>
        <div className="p-4 max-h-80 overflow-y-auto">
          {migrationLog.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              이관 작업을 실행하면 로그가 여기에 표시됩니다.
            </p>
          ) : (
            <pre className="text-xs text-gray-700 whitespace-pre-wrap space-y-0.5 font-mono">
              {migrationLog.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.includes("성공") || log.includes("완료")
                      ? "text-green-700"
                      : log.includes("실패") || log.includes("오류")
                        ? "text-red-600"
                        : log.includes("경고")
                          ? "text-yellow-600"
                          : ""
                  }
                >
                  {log}
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>

      {/* ===== 배치: 업데이트일자 보정 ===== */}
      <BatchFixUpdatedAt targetBoards={targetBoards} addLog={addLog} />

      {/* ===== 안내 ===== */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="text-sm font-bold text-yellow-800 mb-2">이관 안내</h3>
        <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
          <li>같은 게시판을 두 번 이관하면 데이터가 중복됩니다. 이관 전 대상 게시판의 기존 글을 확인하세요.</li>
          <li>회원 게시글은 아이디(userId)로 매핑됩니다. 회원 데이터를 먼저 이관하세요.</li>
          <li>첨부파일은 DB만 이관되며, 실제 파일은 서버에서 수동으로 복사해야 합니다.</li>
          <li>레거시 비밀번호는 원본 그대로 저장됩니다 (제로보드 PASSWORD() 해시).</li>
          <li>대용량 게시판은 이관에 시간이 걸릴 수 있습니다.</li>
          <li><strong>칼럼 매핑 확인</strong>: 이관 전 &apos;칼럼 매핑 확인&apos; 버튼으로 소스/타겟 칼럼이 올바르게 매핑되었는지 확인하세요.</li>
        </ul>
      </div>
    </div>
  );
}

// ============================================================
// 배치: 업데이트일자 보정 컴포넌트
// ============================================================
function BatchFixUpdatedAt({ targetBoards, addLog }: { targetBoards: TargetBoard[]; addLog: (msg: string) => void }) {
  const [running, setRunning] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState<string>("all");
  const [result, setResult] = useState("");

  const handleFix = async () => {
    const label = selectedBoardId === "all" ? "전체 게시판" : `게시판 #${selectedBoardId}`;
    if (!confirm(`${label}의 게시글/댓글 updatedAt을 createdAt으로 보정합니다.\n계속하시겠습니까?`)) return;

    setRunning(true);
    setResult("");
    addLog(`[배치] ${label} 업데이트일자 보정 시작...`);

    try {
      const body: Record<string, unknown> = { action: "fix-updated-at" };
      if (selectedBoardId !== "all") body.boardId = parseInt(selectedBoardId, 10);

      const res = await fetch("/api/admin/db/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.message);
        addLog(`[배치] 완료: ${data.message}`);
      } else {
        setResult(`오류: ${data.error || "알 수 없는 오류"}`);
        addLog(`[배치] 실패: ${data.error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult(`요청 실패: ${msg}`);
      addLog(`[배치] 요청 실패: ${msg}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-indigo-200 overflow-hidden">
      <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-200">
        <h2 className="text-sm font-bold text-indigo-700">배치: 업데이트일자 보정</h2>
        <p className="text-xs text-indigo-600 mt-1">
          이관된 게시글/댓글의 <code className="bg-indigo-100 px-1 rounded">updatedAt</code>을
          <code className="bg-indigo-100 px-1 rounded">createdAt</code>으로 보정합니다.
          (이관 시 시스템 일자로 설정되는 문제 해결)
        </p>
      </div>
      <div className="p-4">
        <div className="flex gap-3 items-center flex-wrap">
          <select
            value={selectedBoardId}
            onChange={(e) => setSelectedBoardId(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          >
            <option value="all">전체 게시판</option>
            {targetBoards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} ({b.slug}) - {b.totalPosts}건
              </option>
            ))}
          </select>
          <button
            onClick={handleFix}
            disabled={running}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {running ? "보정 중..." : "업데이트일자 보정 실행"}
          </button>
        </div>
        {result && (
          <div className={`mt-3 p-2 rounded text-sm ${result.startsWith("오류") || result.startsWith("요청") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
            {result}
          </div>
        )}
      </div>
    </div>
  );
}
