import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import mysql from "mysql2/promise";

// 5분 타임아웃 (Vercel 등)
export const maxDuration = 300;

// ============================================================
// 타입 정의
// ============================================================
interface ConnectionInfo {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

// ============================================================
// Admin 인증
// ============================================================
async function verifyAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires < new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

// SQL injection 방지: 영문자, 숫자, 언더스코어만 허용
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "");
}

// BigInt → Number 안전 변환
function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "bigint") return Number(val);
  return Number(val) || 0;
}
function toStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val);
}

// ============================================================
// mysql_old_password 인증 플러그인 (제로보드 4.0 등 구형 MySQL 서버용)
// ============================================================
function scramble323(scramble: string, password: string): Buffer {
  if (!password || password.length === 0) {
    return Buffer.alloc(0);
  }

  function hashOldPw(str: string): [number, number] {
    let nr = 1345345333;
    let add = 7;
    let nr2 = 0x12345671;

    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c === 32 || c === 9) continue;
      nr ^= (((nr & 63) + add) * c + ((nr << 8) >>> 0)) >>> 0;
      nr2 = (nr2 + (((nr2 << 8) >>> 0) ^ nr)) >>> 0;
      add += c;
    }

    return [nr & 0x7fffffff, nr2 & 0x7fffffff];
  }

  const hp = hashOldPw(password);
  const hm = hashOldPw(scramble);

  let seed1 = (hp[0] ^ hm[0]) % 0x3fffffff;
  // MySQL C 소스 기준: seed2 = (hash_pass[1] ^ hash_message[1]) % max_value
  let seed2 = (hp[1] ^ hm[1]) % 0x3fffffff;

  const out: number[] = [];
  for (let i = 0; i < scramble.length; i++) {
    seed1 = (seed1 * 3 + seed2) % 0x3fffffff;
    seed2 = (seed1 + seed2 + 33) % 0x3fffffff;
    out.push(Math.floor((seed1 / 0x3fffffff) * 31) + 64);
  }

  seed1 = (seed1 * 3 + seed2) % 0x3fffffff;
  seed2 = (seed1 + seed2 + 33) % 0x3fffffff;
  const extra = Math.floor((seed1 / 0x3fffffff) * 31);

  for (let i = 0; i < out.length; i++) {
    out[i] ^= extra;
  }

  return Buffer.from(out);
}

/** mysql2 createConnection에 전달할 옵션 생성 (mysql_old_password 지원 포함) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildConnectionOptions(connInfo: ConnectionInfo): any {
  // MySQL 5.0.x AuthSwitchRequest 빈 플러그인명 핸들러
  // MySQL 5.0.45 등 구버전은 플러그인명 없이("") auth switch를 보내고
  // pluginData도 비어있음 → 초기 핸드쉐이크의 authPluginData1을 스크램블로 사용
  const emptyPluginHandler =
    (opts: { command: { handshake: { authPluginData1: Buffer } } }) =>
    () => {
      const scrambleBuf = opts?.command?.handshake?.authPluginData1;
      if (!scrambleBuf) throw new Error("scramble not available from handshake");
      const result = scramble323(scrambleBuf.toString("binary"), connInfo.password);
      return Buffer.concat([result, Buffer.from([0])]);
    };

  return {
    host: connInfo.host,
    port: connInfo.port || 3306,
    user: connInfo.user,
    password: connInfo.password,
    database: connInfo.database,
    charset: "utf8mb4",
    connectTimeout: 10000,
    authPlugins: {
      // MySQL 5.0.x: AuthSwitchRequest에 빈 플러그인명 + 빈 데이터로 old password 요청
      "": emptyPluginHandler,
      // MySQL 4.x/5.0: 명시적 mysql_old_password 플러그인 요청 시 처리
      mysql_old_password: () => (data: Buffer) => {
        const scramble = data.slice(0, 8).toString("binary");
        const result = scramble323(scramble, connInfo.password);
        return Buffer.concat([result, Buffer.from([0])]);
      },
    },
  };
}

// ============================================================
// 원격 MySQL 접속 헬퍼
// ============================================================
async function queryRemoteDb(
  connInfo: ConnectionInfo,
  sql: string,
  params?: (string | number | null)[],
): Promise<Record<string, unknown>[]> {
  const connection = await mysql.createConnection(buildConnectionOptions(connInfo));
  try {
    if (params && params.length > 0) {
      const [rows] = await connection.execute(sql, params);
      return rows as Record<string, unknown>[];
    }
    const [rows] = await connection.execute(sql);
    return rows as Record<string, unknown>[];
  } finally {
    await connection.end();
  }
}

// 레거시 DB 쿼리 헬퍼 (원격 or 로컬)
async function queryLegacyDb(
  connInfo: ConnectionInfo | null,
  legacyDb: string,
  sql: string,
): Promise<Record<string, unknown>[]> {
  if (connInfo) {
    return await queryRemoteDb(connInfo, sql);
  }
  return await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql);
}

// ============================================================
// GET: 대상 게시판 목록 (이관할 곳)
// ============================================================
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // 현재 게시판 목록 (이관 대상)
  if (action === "list-targets") {
    const boards = await prisma.board.findMany({
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: { id: true, slug: true, title: true, totalPosts: true },
    });
    return NextResponse.json({ boards });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ============================================================
// POST: 마이그레이션 관련 모든 요청
// ============================================================
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  try {
    const contentType = request.headers.get("content-type") || "";

    // multipart/form-data (SQL 파일 업로드)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const method = formData.get("method") as string;
      const boardName = formData.get("boardName") as string;
      const targetBoardId = formData.get("targetBoardId") as string;
      const createNew = formData.get("createNew") === "true";
      const sqlFile = formData.get("sqlFile") as File | null;

      if (method !== "sql" || !sqlFile) {
        return NextResponse.json({ error: "SQL 파일이 필요합니다." }, { status: 400 });
      }

      const sqlText = await sqlFile.text();
      const columnMappingStr = formData.get("columnMapping") as string | null;
      const columnMapping = columnMappingStr ? JSON.parse(columnMappingStr) : undefined;
      return await migrateFromSql({
        boardName: boardName || "",
        targetBoardId: targetBoardId ? parseInt(targetBoardId, 10) : undefined,
        createNew,
        sql: sqlText,
        columnMapping,
      });
    }

    // JSON body
    const body = await request.json();
    const { action, method } = body;

    // === 접속 테스트 ===
    if (action === "test-connection") {
      return await handleTestConnection(body.connectionInfo);
    }

    // === 원격/로컬 게시판 목록 조회 ===
    if (action === "list-legacy") {
      return await handleListLegacy(body.connectionInfo, body.legacyDb);
    }

    // === 칼럼 매핑 미리보기 ===
    if (action === "preview-mapping") {
      return await handlePreviewMapping(body);
    }

    // === SQL dump 게시판 자동 감지 ===
    if (method === "sql-detect") {
      return handleSqlDetect(body.sql);
    }

    // === 배치: 업데이트일자 보정 (updatedAt = createdAt) ===
    if (action === "fix-updated-at") {
      return await handleFixUpdatedAt(body.boardId);
    }

    // === 직접 이관 (원격 DB 지원) ===
    if (method === "direct") {
      return await migrateFromDb(body);
    }

    // === SQL 이관 ===
    if (method === "sql") {
      return await migrateFromSql(body);
    }

    return NextResponse.json({ error: "지원하지 않는 action/method입니다." }, { status: 400 });
  } catch (e) {
    console.error("[Migrate] Error:", e);
    return NextResponse.json(
      { error: "이관 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// ============================================================
// 배치: 업데이트일자 보정 (updatedAt = createdAt)
// ============================================================
// Raw SQL 실행 헬퍼: camelCase → snake_case fallback
async function execRawWithFallback(sql: string, ...params: unknown[]) {
  try {
    return await prisma.$executeRawUnsafe(sql, ...params);
  } catch {
    // camelCase → snake_case 변환 후 재시도
    const snakeSql = sql
      .replace(/updatedAt/g, "updated_at")
      .replace(/createdAt/g, "created_at")
      .replace(/totalComment/g, "total_comment")
      .replace(/boardId/g, "board_id")
      .replace(/postId/g, "post_id");
    return await prisma.$executeRawUnsafe(snakeSql, ...params);
  }
}

async function handleFixUpdatedAt(boardId?: number) {
  // 게시글 updatedAt → createdAt 보정
  let postResult: number;
  if (boardId) {
    postResult = await execRawWithFallback(
      `UPDATE posts SET updatedAt = createdAt WHERE boardId = ?`, Number(boardId)
    );
  } else {
    postResult = await execRawWithFallback(
      `UPDATE posts SET updatedAt = createdAt`
    );
  }

  // 댓글 updatedAt → createdAt 보정
  let commentResult: number;
  if (boardId) {
    commentResult = await execRawWithFallback(
      `UPDATE comments SET updatedAt = createdAt WHERE postId IN (SELECT id FROM posts WHERE boardId = ?)`, Number(boardId)
    );
  } else {
    commentResult = await execRawWithFallback(
      `UPDATE comments SET updatedAt = createdAt`
    );
  }

  return NextResponse.json({
    success: true,
    message: boardId
      ? `게시판 #${boardId} 보정 완료: 게시글 ${postResult}건, 댓글 ${commentResult}건`
      : `전체 보정 완료: 게시글 ${postResult}건, 댓글 ${commentResult}건`,
    posts: postResult,
    comments: commentResult,
  });
}

// ============================================================
// 접속 테스트
// ============================================================
async function handleTestConnection(connInfo: ConnectionInfo) {
  if (!connInfo?.host || !connInfo?.user || !connInfo?.database) {
    return NextResponse.json({ error: "접속정보(host, user, database)가 필요합니다." }, { status: 400 });
  }

  try {
    const connection = await mysql.createConnection(buildConnectionOptions(connInfo));

    // 테이블 존재 확인
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'zetyx_admin_table'",
    );
    const hasAdminTable = (tables as unknown[]).length > 0;

    await connection.end();

    return NextResponse.json({
      success: true,
      message: `접속 성공: ${connInfo.host}:${connInfo.port || 3306}/${connInfo.database}`,
      hasAdminTable,
    });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: `접속 실패: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 500 },
    );
  }
}

// ============================================================
// 레거시 게시판 목록 조회 (원격/로컬)
// ============================================================

// 행의 키를 소문자로 정규화 (서버/버전별 대소문자 차이 흡수)
function normalizeRow(b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

// zetyx_admin_table 칼럼명은 버전마다 다를 수 있으므로 SELECT * 후 JS에서 탐지
async function handleListLegacy(connInfo: ConnectionInfo | null, legacyDbParam?: string) {
  try {
    let boards: Record<string, unknown>[];

    if (connInfo?.host) {
      // 원격 서버 접속: SELECT * 로 모든 칼럼 가져오기
      boards = await queryRemoteDb(
        { ...connInfo, port: connInfo.port || 3306 },
        `SELECT * FROM zetyx_admin_table ORDER BY no`,
      );
    } else {
      // 같은 서버의 다른 DB (기존 방식)
      const legacyDb = sanitizeName(legacyDbParam || "pkistdc");
      boards = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM \`${legacyDb}\`.zetyx_admin_table ORDER BY no`,
      );
    }

    return NextResponse.json({
      boards: boards.map((raw) => {
        const b = normalizeRow(raw);
        // 게시판 이름: 버전에 따라 table_name / name / board_name 등 다름
        const title = toStr(b.table_name ?? b.name ?? b.board_name ?? b.no);
        // 게시글 수: total_article / article_count 등
        const postCount = toNum(b.total_article ?? b.article_count ?? 0);
        return {
          slug: toStr(b.no),
          title,
          postCount,
          postsPerPage: toNum(b.memo_num) || 15,
          pagesPerBlock: toNum(b.page_num) || 8,
          groupNo: toNum(b.group_no),
        };
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `레거시 DB 조회 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}

// ============================================================
// SQL dump 게시판 자동 감지
// ============================================================
function handleSqlDetect(sql: string) {
  if (!sql || sql.length < 10) {
    return NextResponse.json({ error: "SQL 데이터가 필요합니다." }, { status: 400 });
  }

  const detected = detectBoardsFromSql(sql);
  return NextResponse.json({ success: true, ...detected });
}

// ============================================================
// 칼럼 매핑 미리보기 (소스 칼럼 + 샘플 데이터 + 기본 매핑)
// ============================================================
async function handlePreviewMapping(body: {
  previewMethod: "sql" | "direct";
  boardSlug: string;
  tableType?: "post" | "comment" | "category";
  sql?: string;
  connectionInfo?: ConnectionInfo;
}) {
  const boardSlug = sanitizeName(body.boardSlug);
  if (!boardSlug) {
    return NextResponse.json({ error: "게시판 ID가 필요합니다." }, { status: 400 });
  }

  const tableType = body.tableType || "post";

  let tableName: string;
  if (tableType === "comment") {
    tableName = `zetyx_board_comment_${boardSlug}`;
  } else if (tableType === "category") {
    tableName = `zetyx_board_category_${boardSlug}`;
  } else {
    tableName = `zetyx_board_${boardSlug}`;
  }

  const defaultCols = tableType === "comment" ? COMMENT_COLUMNS
    : tableType === "category" ? CATEGORY_COLUMNS
    : BOARD_COLUMNS;

  const targetFields = tableType === "comment" ? COMMENT_TARGET_FIELDS
    : tableType === "category" ? CATEGORY_TARGET_FIELDS
    : POST_TARGET_FIELDS;

  let sourceColumns: string[] = [];
  let sampleRows: (string | null)[][] = [];
  let totalRows = 0;

  try {
    if (body.previewMethod === "sql" && body.sql) {
      const { columns: detectedCols, rows } = extractTableInsertsWithColumns(body.sql, tableName, defaultCols);
      sourceColumns = detectedCols;
      totalRows = rows.length;
      sampleRows = rows.slice(0, 3);

    } else if (body.previewMethod === "direct" && body.connectionInfo?.host) {
      const connInfo = { ...body.connectionInfo, port: body.connectionInfo.port || 3306 };

      const descRows = await queryRemoteDb(connInfo, `DESCRIBE \`${tableName}\``);
      sourceColumns = descRows.map(r => String(r.Field || ""));

      const countResult = await queryRemoteDb(connInfo, `SELECT COUNT(*) as cnt FROM \`${tableName}\``);
      totalRows = toNum(countResult[0]?.cnt);

      const dataRows = await queryRemoteDb(connInfo, `SELECT * FROM \`${tableName}\` ORDER BY no ASC LIMIT 3`);
      sampleRows = dataRows.map(row =>
        sourceColumns.map(col => {
          const v = row[col];
          return v === null || v === undefined ? null : String(v);
        })
      );
    } else {
      return NextResponse.json({ error: "previewMethod와 필요 파라미터를 확인하세요." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: `칼럼 정보 조회 실패: ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 500 });
  }

  // 기본 매핑: 소스 칼럼명과 타겟 필드명이 같으면 자동 매핑
  const defaultMapping = sourceColumns.map((srcCol, idx) => {
    const matchingTarget = targetFields.find(tf => tf.field === srcCol);
    return {
      sourceIndex: idx,
      sourceColumn: srcCol,
      targetField: matchingTarget ? matchingTarget.field : "_skip",
      sampleValues: sampleRows.map(row => row[idx] ?? null),
    };
  });

  return NextResponse.json({
    success: true,
    boardSlug,
    tableType,
    sourceColumns,
    defaultMapping,
    sampleRows,
    totalRows,
    targetFields,
  });
}

interface DetectedBoard {
  slug: string;
  title: string;
  postCount: number;
  commentCount: number;
  categoryCount: number;
}

function detectBoardsFromSql(sql: string): {
  boards: DetectedBoard[];
  hasAdminTable: boolean;
  hasMemberTable: boolean;
} {
  const boardMap = new Map<string, DetectedBoard>();

  // 1. zetyx_board_XXX 테이블에서 INSERT 패턴 감지 (댓글/카테고리 테이블 제외)
  const boardInsertRegex = /INSERT\s+INTO\s+`?zetyx_board_(?!comment_|category_)(\w+)`?\s/gi;
  let match;
  while ((match = boardInsertRegex.exec(sql)) !== null) {
    const slug = match[1];
    if (!boardMap.has(slug)) {
      boardMap.set(slug, { slug, title: slug, postCount: 0, commentCount: 0, categoryCount: 0 });
    }
  }

  // 2. 각 게시판별 게시글 수 카운트
  for (const [slug, board] of boardMap) {
    const tableName = `zetyx_board_${slug}`;
    const posts = extractTableInserts(sql, tableName, BOARD_COLUMNS);
    board.postCount = posts.length;

    // 댓글 수
    const commentTable = `zetyx_board_comment_${slug}`;
    const comments = extractTableInserts(sql, commentTable, COMMENT_COLUMNS);
    board.commentCount = comments.length;

    // 카테고리 수
    const categoryTable = `zetyx_board_category_${slug}`;
    const categories = extractTableInserts(sql, categoryTable, CATEGORY_COLUMNS);
    board.categoryCount = categories.length;
  }

  // 3. zetyx_admin_table에서 게시판 제목(table_name) 추출
  const hasAdminTable = /INSERT\s+INTO\s+`?zetyx_admin_table`?\s/i.test(sql);
  if (hasAdminTable) {
    const adminColumns = [
      "no", "group_no", "table_name", "memo_num", "page_num",
      "skin", "header_url", "use_html", "use_comment", "use_secret",
      "use_showreply", "use_pds", "max_upload", "cut_length",
      "grant_list", "grant_view", "grant_write", "grant_comment",
      "grant_reply", "grant_delete", "grant_notice",
      "total_article",
    ];
    const adminRows = extractTableInserts(sql, "zetyx_admin_table", adminColumns);
    for (const row of adminRows) {
      const slug = toStr(row.no);
      if (boardMap.has(slug)) {
        boardMap.get(slug)!.title = toStr(row.table_name) || slug;
      } else if (slug) {
        // admin_table에는 있지만 board 데이터는 없는 경우
        boardMap.set(slug, {
          slug,
          title: toStr(row.table_name) || slug,
          postCount: 0,
          commentCount: 0,
          categoryCount: 0,
        });
      }
    }
  }

  // 4. zetyx_member_table 존재 여부
  const hasMemberTable = /INSERT\s+INTO\s+`?zetyx_member_table`?\s/i.test(sql);

  // 게시글이 있는 게시판 우선 정렬
  const boards = Array.from(boardMap.values()).sort(
    (a, b) => b.postCount - a.postCount,
  );

  return { boards, hasAdminTable, hasMemberTable };
}

// ============================================================
// 방법 1: 직접 DB 이관 (원격 서버 지원)
// ============================================================
async function migrateFromDb(body: {
  connectionInfo?: ConnectionInfo;
  legacyDb?: string;
  boardSlug: string;
  targetBoardId?: number;
  createNew?: boolean;
  columnMapping?: { post?: string[]; comment?: string[]; category?: string[] };
}) {
  const connInfo = body.connectionInfo?.host ? body.connectionInfo : null;
  const legacyDb = sanitizeName(body.legacyDb || "pkistdc");
  const boardSlug = sanitizeName(body.boardSlug);
  if (!boardSlug) {
    return NextResponse.json({ error: "게시판 ID가 필요합니다." }, { status: 400 });
  }

  const stats = { posts: 0, comments: 0, categories: 0, errors: [] as string[], files: [] as string[] };

  // 1. 대상 게시판 결정
  let targetBoardId = body.targetBoardId;

  if (!targetBoardId && body.createNew) {
    try {
      let lb: Record<string, unknown> | undefined;
      if (connInfo) {
        const rows = await queryRemoteDb(
          { ...connInfo, port: connInfo.port || 3306 },
          `SELECT * FROM zetyx_admin_table WHERE no = ?`,
          [boardSlug],
        );
        lb = rows[0];
      } else {
        const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM \`${legacyDb}\`.zetyx_admin_table WHERE no = ?`, boardSlug,
        );
        lb = rows[0];
      }

      if (!lb) {
        return NextResponse.json({ error: `레거시 게시판 '${boardSlug}' 없음` }, { status: 404 });
      }

      let group = await prisma.group.findFirst();
      if (!group) {
        group = await prisma.group.create({
          data: { name: "동천교회", isOpen: true, useJoin: true, joinLevel: 9 },
        });
      }

      const existing = await prisma.board.findUnique({ where: { slug: boardSlug } });
      const newSlug = existing ? `${boardSlug}_m` : boardSlug;

      const lbn = normalizeRow(lb);
      const board = await prisma.board.create({
        data: {
          slug: newSlug,
          title: toStr(lbn.table_name ?? lbn.name ?? lbn.board_name) || boardSlug,
          groupId: group.id,
          postsPerPage: toNum(lbn.memo_num) || 15,
          pagesPerBlock: toNum(lbn.page_num) || 8,
          useHtml: !!toNum(lbn.use_html),
          useComment: !!toNum(lbn.use_comment),
          useSecret: !!toNum(lbn.use_secret),
          useReply: !!toNum(lbn.use_showreply),
          useFileUpload: !!toNum(lbn.use_pds),
          useAutolink: true,
          maxUploadSize: toNum(lbn.max_upload) || 2097152,
          cutLength: toNum(lbn.cut_length) || 0,
          grantList: toNum(lbn.grant_list) || 10,
          grantView: toNum(lbn.grant_view) || 10,
          grantWrite: toNum(lbn.grant_write) || 10,
          grantComment: toNum(lbn.grant_comment) || 10,
          grantReply: toNum(lbn.grant_reply) || 10,
          grantDelete: toNum(lbn.grant_delete) || 1,
          grantNotice: toNum(lbn.grant_notice) || 1,
        },
      });
      targetBoardId = board.id;
    } catch (e) {
      return NextResponse.json(
        { error: `새 게시판 생성 실패: ${e instanceof Error ? e.message : String(e)}` },
        { status: 500 },
      );
    }
  }

  if (!targetBoardId) {
    return NextResponse.json({ error: "대상 게시판을 선택하세요." }, { status: 400 });
  }

  // 2. 레거시 카테고리 조회
  let legacyCategories: Record<string, unknown>[] = [];
  try {
    const catSql = connInfo
      ? `SELECT no, name FROM \`zetyx_board_category_${boardSlug}\` ORDER BY no`
      : `SELECT no, name FROM \`${legacyDb}\`.\`zetyx_board_category_${boardSlug}\` ORDER BY no`;
    legacyCategories = await queryLegacyDb(
      connInfo ? { ...connInfo, port: connInfo.port || 3306 } : null,
      legacyDb,
      catSql,
    );
  } catch {
    // 카테고리 테이블 없을 수 있음
  }

  // 3. 레거시 게시글 조회
  let legacyPosts: Record<string, unknown>[] = [];
  try {
    const postSql = connInfo
      ? `SELECT * FROM \`zetyx_board_${boardSlug}\` ORDER BY no ASC`
      : `SELECT * FROM \`${legacyDb}\`.\`zetyx_board_${boardSlug}\` ORDER BY no ASC`;
    legacyPosts = await queryLegacyDb(
      connInfo ? { ...connInfo, port: connInfo.port || 3306 } : null,
      legacyDb,
      postSql,
    );
  } catch (e) {
    return NextResponse.json(
      { error: `게시글 조회 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  // 4. 레거시 댓글 조회
  let legacyComments: Record<string, unknown>[] = [];
  try {
    const commentSql = connInfo
      ? `SELECT * FROM \`zetyx_board_comment_${boardSlug}\` ORDER BY no ASC`
      : `SELECT * FROM \`${legacyDb}\`.\`zetyx_board_comment_${boardSlug}\` ORDER BY no ASC`;
    legacyComments = await queryLegacyDb(
      connInfo ? { ...connInfo, port: connInfo.port || 3306 } : null,
      legacyDb,
      commentSql,
    );
  } catch {
    // 댓글 테이블 없을 수 있음
  }

  // 5. 커스텀 칼럼 매핑 적용 (직접 DB 방식: SELECT * 결과의 키를 리매핑)
  if (body.columnMapping) {
    const remapRows = (rows: Record<string, unknown>[], mapping: string[], defaultCols: string[]) => {
      if (!mapping.length) return rows;
      return rows.map(row => {
        const remapped: Record<string, unknown> = {};
        // defaultCols 순서대로 키가 들어있으므로, 같은 인덱스의 mapping 값으로 키를 변경
        const keys = Object.keys(row);
        for (let i = 0; i < keys.length; i++) {
          const targetField = i < mapping.length ? mapping[i] : keys[i];
          if (targetField !== "_skip") {
            remapped[targetField] = row[keys[i]];
          }
        }
        return remapped;
      });
    };
    if (body.columnMapping.post?.length) {
      legacyPosts = remapRows(legacyPosts, body.columnMapping.post, BOARD_COLUMNS);
    }
    if (body.columnMapping.comment?.length) {
      legacyComments = remapRows(legacyComments, body.columnMapping.comment, COMMENT_COLUMNS);
    }
    if (body.columnMapping.category?.length) {
      legacyCategories = remapRows(legacyCategories, body.columnMapping.category, CATEGORY_COLUMNS);
    }
  }

  // 6. 공통 이관 로직 실행
  const result = await migrateBoardData(legacyPosts, legacyComments, legacyCategories, targetBoardId, stats);
  return NextResponse.json(result);
}

// ============================================================
// 방법 2: SQL 백업 스크립트 이관
// ============================================================
async function migrateFromSql(body: {
  boardName: string;
  targetBoardId?: number;
  createNew?: boolean;
  sql: string;
  columnMapping?: { post?: string[]; comment?: string[]; category?: string[] };
}) {
  const boardName = sanitizeName(body.boardName || "");
  if (!boardName) {
    return NextResponse.json({ error: "게시판 테이블명이 필요합니다. (예: DcNotice)" }, { status: 400 });
  }
  if (!body.sql || body.sql.length < 10) {
    return NextResponse.json({ error: "SQL 데이터가 필요합니다." }, { status: 400 });
  }

  const stats = { posts: 0, comments: 0, categories: 0, errors: [] as string[], files: [] as string[] };

  // 1. 대상 게시판 결정
  let targetBoardId = body.targetBoardId;
  if (!targetBoardId && body.createNew) {
    let group = await prisma.group.findFirst();
    if (!group) {
      group = await prisma.group.create({
        data: { name: "동천교회", isOpen: true, useJoin: true, joinLevel: 9 },
      });
    }

    // zetyx_admin_table에서 게시판 정보 추출 시도
    const adminColumns = [
      "no", "group_no", "table_name", "memo_num", "page_num",
      "skin", "header_url", "use_html", "use_comment", "use_secret",
      "use_showreply", "use_pds", "max_upload", "cut_length",
      "grant_list", "grant_view", "grant_write", "grant_comment",
      "grant_reply", "grant_delete", "grant_notice",
      "total_article",
    ];
    const adminRows = extractTableInserts(body.sql, "zetyx_admin_table", adminColumns);
    const adminRow = adminRows.find((r) => toStr(r.no) === boardName);

    const existing = await prisma.board.findUnique({ where: { slug: boardName } });
    const newSlug = existing ? `${boardName}_m` : boardName;

    const boardData: Record<string, unknown> = {
      slug: newSlug,
      title: adminRow ? (toStr(adminRow.table_name) || boardName) : boardName,
      groupId: group.id,
    };

    // admin_table 정보가 있으면 설정값도 적용
    if (adminRow) {
      Object.assign(boardData, {
        postsPerPage: toNum(adminRow.memo_num) || 15,
        pagesPerBlock: toNum(adminRow.page_num) || 8,
        useHtml: !!toNum(adminRow.use_html),
        useComment: !!toNum(adminRow.use_comment),
        useSecret: !!toNum(adminRow.use_secret),
        useReply: !!toNum(adminRow.use_showreply),
        useFileUpload: !!toNum(adminRow.use_pds),
        useAutolink: true,
        maxUploadSize: toNum(adminRow.max_upload) || 2097152,
        cutLength: toNum(adminRow.cut_length) || 0,
        grantList: toNum(adminRow.grant_list) || 10,
        grantView: toNum(adminRow.grant_view) || 10,
        grantWrite: toNum(adminRow.grant_write) || 10,
        grantComment: toNum(adminRow.grant_comment) || 10,
        grantReply: toNum(adminRow.grant_reply) || 10,
        grantDelete: toNum(adminRow.grant_delete) || 1,
        grantNotice: toNum(adminRow.grant_notice) || 1,
      });
    }

    const board = await prisma.board.create({ data: boardData as Parameters<typeof prisma.board.create>[0]["data"] });
    targetBoardId = board.id;
  }

  if (!targetBoardId) {
    return NextResponse.json({ error: "대상 게시판을 선택하세요." }, { status: 400 });
  }

  // 2. SQL 파싱 (커스텀 매핑이 있으면 사용)
  const boardTable = `zetyx_board_${boardName}`;
  const commentTable = `zetyx_board_comment_${boardName}`;
  const categoryTable = `zetyx_board_category_${boardName}`;

  const postColumns = body.columnMapping?.post?.length ? body.columnMapping.post : BOARD_COLUMNS;
  const commentColumns = body.columnMapping?.comment?.length ? body.columnMapping.comment : COMMENT_COLUMNS;
  const categoryColumns = body.columnMapping?.category?.length ? body.columnMapping.category : CATEGORY_COLUMNS;

  const parsedPosts = extractTableInserts(body.sql, boardTable, postColumns);
  const parsedComments = extractTableInserts(body.sql, commentTable, commentColumns);
  const parsedCategories = extractTableInserts(body.sql, categoryTable, categoryColumns);

  if (parsedPosts.length === 0) {
    stats.errors.push(`게시글 데이터를 찾을 수 없습니다. 테이블명: ${boardTable}`);
  }

  // 3. 공통 이관 로직
  const result = await migrateBoardData(parsedPosts, parsedComments, parsedCategories, targetBoardId, stats);
  return NextResponse.json(result);
}

// ============================================================
// 공통 이관 로직
// ============================================================
async function migrateBoardData(
  posts: Record<string, unknown>[],
  comments: Record<string, unknown>[],
  categories: Record<string, unknown>[],
  targetBoardId: number,
  stats: { posts: number; comments: number; categories: number; errors: string[]; files: string[] },
) {
  // 1. 카테고리 이관
  const categoryMap = new Map<number, number>();
  if (categories.length > 0) {
    await prisma.board.update({
      where: { id: targetBoardId },
      data: { useCategory: true },
    });

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      try {
        const newCat = await prisma.category.create({
          data: {
            boardId: targetBoardId,
            name: toStr(cat.name) || `Category ${toNum(cat.no)}`,
            sortOrder: i,
          },
        });
        categoryMap.set(toNum(cat.no), newCat.id);
        stats.categories++;
      } catch (e) {
        stats.errors.push(`카테고리 #${toNum(cat.no)} 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // 2. 게시글 이관
  const postIdMap = new Map<number, number>();

  for (const post of posts) {
    try {
      // 회원 매핑
      let authorId: number | null = null;
      const ismember = toStr(post.ismember);
      if (ismember) {
        const user = await prisma.user.findUnique({
          where: { userId: ismember },
          select: { id: true },
        });
        if (user) authorId = user.id;
      }

      // 첨부파일 체크
      const fn1 = toStr(post.file_name1);
      const fn2 = toStr(post.file_name2);
      if (fn1) stats.files.push(fn1);
      if (fn2) stats.files.push(fn2);

      const regDate = toNum(post.reg_date);
      const headnum = toNum(post.headnum);

      const newPost = await prisma.post.create({
        data: {
          boardId: targetBoardId,
          division: toNum(post.division) || 1,
          headnum,
          arrangenum: toNum(post.arrangenum),
          depth: toNum(post.depth),
          authorId,
          authorLevel: toNum(post.islevel) || 10,
          authorName: toStr(post.name) || "익명",
          authorIp: toStr(post.ip),
          password: toStr(post.password),
          email: toStr(post.email) || null,
          homepage: toStr(post.homepage) || null,
          subject: toStr(post.subject) || "(제목없음)",
          content: toStr(post.memo) || "",
          useHtml: !!toNum(post.use_html),
          isSecret: !!toNum(post.is_secret),
          isNotice: headnum <= -2000000000,
          commentPolicy: "ALLOW",
          sitelink1: toStr(post.sitelink1) || null,
          sitelink2: toStr(post.sitelink2) || null,
          fileName1: fn1 || null,
          fileName2: fn2 || null,
          origName1: toStr(post.s_file_name1) || null,
          origName2: toStr(post.s_file_name2) || null,
          download1: toNum(post.download1),
          download2: toNum(post.download2),
          extra1: toStr(post.x) || null,
          extra2: toStr(post.y) || null,
          hit: toNum(post.hit),
          vote: toNum(post.vote),
          totalComment: toNum(post.comment_num),
          categoryId: toNum(post.category) ? (categoryMap.get(toNum(post.category)) || null) : null,
          legacyDate: regDate || null,
          createdAt: regDate > 0 ? new Date(regDate * 1000) : new Date(),
          updatedAt: regDate > 0 ? new Date(regDate * 1000) : new Date(),
          // 임시: 나중에 업데이트
          parentId: 0,
          childId: 0,
          prevNo: 0,
          nextNo: 0,
        },
      });
      postIdMap.set(toNum(post.no), newPost.id);
      stats.posts++;
    } catch (e) {
      stats.errors.push(`게시글 #${toNum(post.no)} 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 3. 게시글 참조(부모/자식/이전/다음) 업데이트
  for (const post of posts) {
    const newId = postIdMap.get(toNum(post.no));
    if (!newId) continue;

    const updates: Record<string, number> = {};
    const father = toNum(post.father);
    const child = toNum(post.child);
    const prev = toNum(post.prev);
    const next = toNum(post.next);

    if (father && postIdMap.has(father)) updates.parentId = postIdMap.get(father)!;
    if (child && postIdMap.has(child)) updates.childId = postIdMap.get(child)!;
    if (prev && postIdMap.has(prev)) updates.prevNo = postIdMap.get(prev)!;
    if (next && postIdMap.has(next)) updates.nextNo = postIdMap.get(next)!;

    if (Object.keys(updates).length > 0) {
      try {
        // 참조 업데이트 시 updatedAt이 자동 갱신되므로 원래 createdAt 값으로 유지
        const regDate = toNum(post.reg_date);
        const originalDate = regDate > 0 ? new Date(regDate * 1000) : new Date();
        await prisma.post.update({ where: { id: newId }, data: { ...updates, updatedAt: originalDate } });
      } catch (e) {
        stats.errors.push(`참조 업데이트 #${toNum(post.no)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // 4. 댓글 이관
  for (const comment of comments) {
    try {
      const parentNo = toNum(comment.parent);
      const postId = postIdMap.get(parentNo);
      if (!postId) {
        // 원글 정보를 찾아서 표시
        const parentPost = posts.find((p) => toNum(p.no) === parentNo);
        const parentSubject = parentPost ? toStr(parentPost.subject) : "(알 수 없음)";
        const commentAuthor = toStr(comment.name) || "익명";
        const commentContent = (toStr(comment.memo) || "").substring(0, 30);
        stats.errors.push(
          `댓글 #${toNum(comment.no)} (${commentAuthor}: "${commentContent}..."): 원글 #${parentNo} "${parentSubject}" 매핑 실패`
        );
        continue;
      }

      let authorId: number | null = null;
      const ismember = toStr(comment.ismember);
      if (ismember) {
        const user = await prisma.user.findUnique({
          where: { userId: ismember },
          select: { id: true },
        });
        if (user) authorId = user.id;
      }

      const regDate = toNum(comment.reg_date);

      await prisma.comment.create({
        data: {
          postId,
          authorId,
          authorName: toStr(comment.name) || "익명",
          password: toStr(comment.password) || null,
          content: toStr(comment.memo) || "",
          authorIp: toStr(comment.ip) || null,
          legacyDate: regDate || null,
          createdAt: regDate > 0 ? new Date(regDate * 1000) : new Date(),
          updatedAt: regDate > 0 ? new Date(regDate * 1000) : new Date(),
        },
      });
      stats.comments++;
    } catch (e) {
      const commentAuthor = toStr(comment.name) || "익명";
      stats.errors.push(`댓글 #${toNum(comment.no)} (${commentAuthor}, 원글 #${toNum(comment.parent)}) 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 5. 이관된 게시글/댓글의 updatedAt = createdAt 으로 보정
  //    (Prisma @updatedAt 가 자동으로 현재 시간을 설정하므로, 모든 글에 [U] 표시됨 방지)
  await execRawWithFallback(
    `UPDATE posts SET updatedAt = createdAt WHERE boardId = ?`, targetBoardId,
  );
  await execRawWithFallback(
    `UPDATE comments SET updatedAt = createdAt WHERE postId IN (SELECT id FROM posts WHERE boardId = ?)`, targetBoardId,
  );

  // 6. 댓글 수 재계산 (레거시 comment_num이 부정확할 수 있음)
  await execRawWithFallback(
    `UPDATE posts SET totalComment = (SELECT COUNT(*) FROM comments WHERE comments.postId = posts.id) WHERE boardId = ?`, targetBoardId,
  );

  // 7. 게시판 전체 글 수 갱신
  const postCount = await prisma.post.count({ where: { boardId: targetBoardId } });
  await prisma.board.update({
    where: { id: targetBoardId },
    data: { totalPosts: postCount },
  });

  const fileMsg = stats.files.length > 0
    ? `\n※ 첨부파일 ${stats.files.length}건은 수동으로 복사해야 합니다.`
    : "";

  return {
    success: true,
    message: `이관 완료: 게시글 ${stats.posts}건, 댓글 ${stats.comments}건, 카테고리 ${stats.categories}건${fileMsg}`,
    stats,
    targetBoardId,
  };
}

// ============================================================
// SQL 파서: INSERT INTO VALUES 추출
// ============================================================

// 제로보드 게시판 테이블 컬럼 순서
const BOARD_COLUMNS = [
  "no", "headnum", "arrangenum", "depth", "division",
  "name", "password", "email", "homepage",
  "subject", "memo", "ip", "reg_date",
  "hit", "vote", "ismember", "islevel",
  "sitelink1", "sitelink2",
  "file_name1", "file_name2", "s_file_name1", "s_file_name2",
  "download1", "download2",
  "x", "y", "comment_num",
  "use_html", "is_secret",
  "father", "child", "prev", "next",
  "category",
];

// 제로보드 댓글 테이블 컬럼 순서
const COMMENT_COLUMNS = [
  "no", "parent", "name", "password", "memo", "ip", "reg_date", "ismember",
];

// 카테고리 테이블 컬럼
const CATEGORY_COLUMNS = ["no", "name"];

// ============================================================
// 타겟 필드 정의 (칼럼 매핑 UI용)
// ============================================================
const POST_TARGET_FIELDS = [
  { field: "no", label: "글번호 (no)", type: "number" },
  { field: "headnum", label: "그룹번호 (headnum)", type: "number" },
  { field: "arrangenum", label: "정렬번호 (arrangenum)", type: "number" },
  { field: "depth", label: "깊이 (depth)", type: "number" },
  { field: "division", label: "구분 (division)", type: "number" },
  { field: "name", label: "작성자명 (name)", type: "string" },
  { field: "password", label: "비밀번호 (password)", type: "string" },
  { field: "email", label: "이메일 (email)", type: "string" },
  { field: "homepage", label: "홈페이지 (homepage)", type: "string" },
  { field: "subject", label: "제목 (subject)", type: "string" },
  { field: "memo", label: "본문 (memo)", type: "string" },
  { field: "ip", label: "IP주소 (ip)", type: "string" },
  { field: "reg_date", label: "작성일 (reg_date)", type: "number" },
  { field: "hit", label: "조회수 (hit)", type: "number" },
  { field: "vote", label: "추천수 (vote)", type: "number" },
  { field: "ismember", label: "회원ID (ismember)", type: "string" },
  { field: "islevel", label: "회원레벨 (islevel)", type: "number" },
  { field: "sitelink1", label: "링크1 (sitelink1)", type: "string" },
  { field: "sitelink2", label: "링크2 (sitelink2)", type: "string" },
  { field: "file_name1", label: "파일명1 (file_name1)", type: "string" },
  { field: "file_name2", label: "파일명2 (file_name2)", type: "string" },
  { field: "s_file_name1", label: "원본파일명1 (s_file_name1)", type: "string" },
  { field: "s_file_name2", label: "원본파일명2 (s_file_name2)", type: "string" },
  { field: "download1", label: "다운로드1 (download1)", type: "number" },
  { field: "download2", label: "다운로드2 (download2)", type: "number" },
  { field: "x", label: "확장1 (x)", type: "string" },
  { field: "y", label: "확장2 (y)", type: "string" },
  { field: "comment_num", label: "댓글수 (comment_num)", type: "number" },
  { field: "use_html", label: "HTML사용 (use_html)", type: "number" },
  { field: "is_secret", label: "비밀글 (is_secret)", type: "number" },
  { field: "father", label: "부모글 (father)", type: "number" },
  { field: "child", label: "자식글 (child)", type: "number" },
  { field: "prev", label: "이전글 (prev)", type: "number" },
  { field: "next", label: "다음글 (next)", type: "number" },
  { field: "category", label: "카테고리 (category)", type: "number" },
  { field: "_skip", label: "(건너뛰기)", type: "skip" },
];

const COMMENT_TARGET_FIELDS = [
  { field: "no", label: "댓글번호 (no)", type: "number" },
  { field: "parent", label: "원글번호 (parent)", type: "number" },
  { field: "name", label: "작성자명 (name)", type: "string" },
  { field: "password", label: "비밀번호 (password)", type: "string" },
  { field: "memo", label: "댓글내용 (memo)", type: "string" },
  { field: "ip", label: "IP주소 (ip)", type: "string" },
  { field: "reg_date", label: "작성일 (reg_date)", type: "number" },
  { field: "ismember", label: "회원ID (ismember)", type: "string" },
  { field: "_skip", label: "(건너뛰기)", type: "skip" },
];

const CATEGORY_TARGET_FIELDS = [
  { field: "no", label: "번호 (no)", type: "number" },
  { field: "name", label: "이름 (name)", type: "string" },
  { field: "_skip", label: "(건너뛰기)", type: "skip" },
];

/**
 * SQL INSERT 문에서 특정 테이블의 데이터를 추출
 */
function extractTableInserts(
  sql: string,
  tableName: string,
  defaultColumns: string[],
): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const escapedTable = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // INSERT INTO `tableName` (col1, col2, ...) VALUES (...), (...);
  // INSERT INTO `tableName` VALUES (...), (...);
  const regex = new RegExp(
    `INSERT\\s+INTO\\s+\`?${escapedTable}\`?\\s*(?:\\(([^)]+)\\)\\s*)?VALUES\\s*`,
    "gi",
  );

  let match;
  while ((match = regex.exec(sql)) !== null) {
    // 컬럼 목록이 있으면 사용, 없으면 기본 순서
    let columns = defaultColumns;
    if (match[1]) {
      columns = match[1].split(",").map((c) => c.trim().replace(/`/g, ""));
    }

    // VALUES 이후부터 세미콜론까지 추출
    const startPos = match.index + match[0].length;
    const valuesStr = extractUntilSemicolon(sql, startPos);

    // 값 튜플 파싱
    const tuples = parseValueTuples(valuesStr);

    for (const tuple of tuples) {
      const row: Record<string, unknown> = {};
      for (let i = 0; i < Math.min(tuple.length, columns.length); i++) {
        const val = tuple[i];
        if (val === null) {
          row[columns[i]] = null;
        } else if (typeof val === "string") {
          // 숫자형 컬럼이면 변환 시도
          const numCols = [
            "no", "headnum", "arrangenum", "depth", "division",
            "reg_date", "hit", "vote", "islevel", "download1", "download2",
            "comment_num", "use_html", "is_secret",
            "father", "child", "prev", "next", "category",
            "parent", "memo_num", "page_num",
            "group_no", "total_article", "max_upload", "cut_length",
            "grant_list", "grant_view", "grant_write", "grant_comment",
            "grant_reply", "grant_delete", "grant_notice",
            "use_comment", "use_secret", "use_showreply", "use_pds",
          ];
          if (numCols.includes(columns[i]) && /^-?\d+$/.test(val)) {
            row[columns[i]] = parseInt(val, 10);
          } else {
            row[columns[i]] = val;
          }
        } else {
          row[columns[i]] = val;
        }
      }
      results.push(row);
    }
  }

  return results;
}

/**
 * SQL INSERT 문에서 칼럼명 + 원시 튜플 데이터를 분리하여 반환 (매핑 미리보기용)
 */
function extractTableInsertsWithColumns(
  sql: string,
  tableName: string,
  defaultColumns: string[],
): { columns: string[]; rows: (string | null)[][] } {
  const allRows: (string | null)[][] = [];
  let detectedColumns: string[] = [];
  const escapedTable = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regex = new RegExp(
    `INSERT\\s+INTO\\s+\`?${escapedTable}\`?\\s*(?:\\(([^)]+)\\)\\s*)?VALUES\\s*`,
    "gi",
  );

  let match;
  while ((match = regex.exec(sql)) !== null) {
    if (match[1] && detectedColumns.length === 0) {
      detectedColumns = match[1].split(",").map((c) => c.trim().replace(/`/g, ""));
    }

    const startPos = match.index + match[0].length;
    const valuesStr = extractUntilSemicolon(sql, startPos);
    const tuples = parseValueTuples(valuesStr);

    for (const tuple of tuples) {
      allRows.push(tuple);
    }
  }

  if (detectedColumns.length === 0) {
    if (allRows.length > 0) {
      const tupleLength = allRows[0].length;
      if (tupleLength === defaultColumns.length) {
        detectedColumns = [...defaultColumns];
      } else {
        detectedColumns = Array.from({ length: tupleLength }, (_, i) =>
          i < defaultColumns.length ? defaultColumns[i] : `column_${i}`
        );
      }
    } else {
      detectedColumns = [...defaultColumns];
    }
  }

  return { columns: detectedColumns, rows: allRows };
}

/**
 * SQL에서 세미콜론까지 추출 (문자열 리터럴 내 세미콜론 무시)
 */
function extractUntilSemicolon(sql: string, start: number): string {
  let i = start;
  let inString = false;

  while (i < sql.length) {
    if (sql[i] === "\\" && inString) {
      i += 2; // 이스케이프 문자 건너뛰기
      continue;
    }
    if (sql[i] === "'") {
      if (inString && i + 1 < sql.length && sql[i + 1] === "'") {
        i += 2; // 이스케이프된 따옴표
        continue;
      }
      inString = !inString;
    }
    if (!inString && sql[i] === ";") {
      return sql.substring(start, i);
    }
    i++;
  }
  return sql.substring(start);
}

/**
 * VALUES 문자열에서 튜플 배열 추출: (val1, val2), (val3, val4)
 */
function parseValueTuples(valuesStr: string): (string | null)[][] {
  const results: (string | null)[][] = [];
  let i = 0;
  const len = valuesStr.length;

  while (i < len) {
    // 여는 괄호 찾기
    while (i < len && valuesStr[i] !== "(") i++;
    if (i >= len) break;
    i++; // ( 건너뛰기

    const values: (string | null)[] = [];

    while (i < len && valuesStr[i] !== ")") {
      // 공백 건너뛰기
      while (i < len && " \t\n\r".includes(valuesStr[i])) i++;
      if (valuesStr[i] === ")") break;

      if (valuesStr[i] === "'") {
        // 문자열 파싱
        i++; // 여는 따옴표
        let val = "";
        while (i < len) {
          if (valuesStr[i] === "\\" && i + 1 < len) {
            const next = valuesStr[i + 1];
            switch (next) {
              case "'": val += "'"; break;
              case '"': val += '"'; break;
              case "\\": val += "\\"; break;
              case "n": val += "\n"; break;
              case "r": val += "\r"; break;
              case "t": val += "\t"; break;
              case "0": val += "\0"; break;
              default: val += next; break;
            }
            i += 2;
          } else if (valuesStr[i] === "'" && i + 1 < len && valuesStr[i + 1] === "'") {
            val += "'";
            i += 2;
          } else if (valuesStr[i] === "'") {
            i++; // 닫는 따옴표
            break;
          } else {
            val += valuesStr[i];
            i++;
          }
        }
        values.push(val);
      } else if (valuesStr.substring(i, i + 4).toUpperCase() === "NULL") {
        values.push(null);
        i += 4;
      } else {
        // 숫자 또는 기타 값
        let val = "";
        while (i < len && valuesStr[i] !== "," && valuesStr[i] !== ")" && !" \t\n\r".includes(valuesStr[i])) {
          val += valuesStr[i];
          i++;
        }
        values.push(val.trim());
      }

      // 콤마 건너뛰기
      while (i < len && " \t\n\r".includes(valuesStr[i])) i++;
      if (valuesStr[i] === ",") i++;
    }

    if (valuesStr[i] === ")") i++;
    if (values.length > 0) {
      results.push(values);
    }

    // 다음 튜플까지 건너뛰기
    while (i < len && valuesStr[i] !== "(" && valuesStr[i] !== ";") i++;
  }

  return results;
}
