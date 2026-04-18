import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import mysql from "mysql2/promise";

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
// mysql_old_password 인증 플러그인 (MySQL 5.0.x 구형 서버용)
// ============================================================
function scramble323(scramble: string, password: string): Buffer {
  if (!password || password.length === 0) return Buffer.alloc(0);

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
  for (let i = 0; i < out.length; i++) out[i] ^= extra;

  return Buffer.from(out);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildConnectionOptions(connInfo: ConnectionInfo): any {
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
      "": emptyPluginHandler,
      mysql_old_password: () => (data: Buffer) => {
        const scramble = data.slice(0, 8).toString("binary");
        const result = scramble323(scramble, connInfo.password);
        return Buffer.concat([result, Buffer.from([0])]);
      },
    },
  };
}

// ============================================================
// 관리자 인증
// ============================================================
async function verifyAdmin() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires < new Date()) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, userId: true, isAdmin: true },
  });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

// ============================================================
// 접속 테스트
// ============================================================
async function handleTestConnection(connInfo: ConnectionInfo) {
  if (!connInfo?.host || !connInfo?.user || !connInfo?.database) {
    return NextResponse.json(
      { error: "접속정보(host, user, database)가 필요합니다." },
      { status: 400 }
    );
  }
  try {
    const connection = await mysql.createConnection(buildConnectionOptions(connInfo));
    const [tables] = await connection.execute("SHOW TABLES LIKE 'zetyx_member_table'");
    const hasMemberTable = (tables as unknown[]).length > 0;
    await connection.end();
    return NextResponse.json({
      success: true,
      message: `접속 성공: ${connInfo.host}:${connInfo.port || 3306}/${connInfo.database}`,
      hasMemberTable,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `접속 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}

// ============================================================
// 원격 또는 로컬 DB에서 회원 목록 조회
// ============================================================

/** 컬럼명 소문자 정규화 (MySQL 서버/OS에 따라 대소문자 다를 수 있음) */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

async function fetchLegacyUsers(
  connInfo: ConnectionInfo | null,
  legacyDb: string
): Promise<Record<string, unknown>[]> {
  let rows: Record<string, unknown>[];
  if (connInfo?.host) {
    const conn = await mysql.createConnection(buildConnectionOptions(connInfo));
    try {
      const [result] = await conn.execute(
        `SELECT * FROM zetyx_member_table ORDER BY no ASC`
      );
      rows = result as Record<string, unknown>[];
    } finally {
      await conn.end();
    }
  } else {
    rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM \`${legacyDb}\`.zetyx_member_table ORDER BY no ASC`
    );
  }
  return rows.map(normalizeRow);
}

// ============================================================
// GET: 레거시 사용자 미리보기 (로컬 DB 전용 — 하위 호환)
// ============================================================
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const url = new URL(request.url);
  const legacyDb = url.searchParams.get("db") || "pkistdc";

  try {
    return await buildPreviewResponse(null, legacyDb, admin.userId);
  } catch (e) {
    return NextResponse.json(
      { error: `레거시 DB 조회 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}

// ============================================================
// POST: 접속 테스트 / 미리보기 / 이관 실행
// ============================================================
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  try {
    const body = await request.json();
    const { action, connectionInfo, legacyDb = "pkistdc", skipExisting = true } = body;
    const connInfo: ConnectionInfo | null = connectionInfo?.host ? connectionInfo : null;

    if (action === "test-connection") {
      return await handleTestConnection(connectionInfo);
    }

    // 현재 로그인한 userId — 이관 과정에서 이 id 는 스킵하여 권한 단일화 보장
    const currentLoginId = admin.userId;

    if (action === "preview") {
      return await buildPreviewResponse(connInfo, legacyDb, currentLoginId);
    }

    // SQL 덤프 미리보기
    if (action === "preview-sql") {
      return await buildSqlPreviewResponse(body.sql, currentLoginId);
    }

    // SQL 덤프 이관 실행
    if (action === "import-sql") {
      const users = parseMemberSql(body.sql || "");
      return await runMigration(users, skipExisting, currentLoginId);
    }

    // 기본: 원격/로컬 DB 이관 실행
    return await executeMigration(connInfo, legacyDb, skipExisting, currentLoginId);
  } catch (e) {
    return NextResponse.json(
      { error: `이관 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}

// ============================================================
// 미리보기 응답 생성
// ============================================================
async function buildPreviewResponse(
  connInfo: ConnectionInfo | null,
  legacyDb: string,
  currentLoginId: string
) {
  const legacyUsers = await fetchLegacyUsers(connInfo, legacyDb);
  const existingUsers = await prisma.user.findMany({ select: { userId: true } });
  const existingSet = new Set(existingUsers.map((u) => u.userId));

  const preview = legacyUsers.map((u) => {
    const uid = String(u.user_id || "");
    const alreadyExists = existingSet.has(uid);
    // "로그인한 본인" 과 동일 userId 는 절대 덮어쓰지 않는다
    const skipSelf = uid === currentLoginId;
    return {
      no: Number(u.no || 0),
      userId: uid,
      name: String(u.name || ""),
      email: String(u.email || ""),
      level: Number(u.level || 10),
      isAdmin: Number(u.is_admin || 3),
      regDate: u.reg_date ? new Date(Number(u.reg_date) * 1000).toISOString() : null,
      alreadyExists,
      hasPassword: !!u.password,
      excludedReason: skipSelf ? "current-login" : null,
    };
  });

  return NextResponse.json({
    total: legacyUsers.length,
    alreadyMigrated: preview.filter((p) => p.alreadyExists).length,
    toMigrate: preview.filter((p) => !p.alreadyExists && !p.excludedReason).length,
    excludedCurrentLogin: preview.filter((p) => p.excludedReason === "current-login").length,
    currentLoginId,
    users: preview,
  });
}

// ============================================================
// SQL 덤프 미리보기
// ============================================================
async function buildSqlPreviewResponse(sql: string, currentLoginId: string) {
  if (!sql || sql.length < 10) {
    return NextResponse.json({ error: "SQL 데이터가 필요합니다." }, { status: 400 });
  }
  const legacyUsers = parseMemberSql(sql);
  const existingUsers = await prisma.user.findMany({ select: { userId: true } });
  const existingSet = new Set(existingUsers.map((u) => u.userId));

  const preview = legacyUsers.map((u) => {
    const uid = String(u.user_id || "");
    const alreadyExists = existingSet.has(uid);
    const skipSelf = uid === currentLoginId;
    return {
      no: Number(u.no || 0),
      userId: uid,
      name: String(u.name || ""),
      email: String(u.email || ""),
      level: Number(u.level || 10),
      isAdmin: Number(u.is_admin || 3),
      regDate: u.reg_date ? new Date(Number(u.reg_date) * 1000).toISOString() : null,
      alreadyExists,
      hasPassword: !!u.password,
      excludedReason: skipSelf ? "current-login" : null,
    };
  });

  return NextResponse.json({
    total: legacyUsers.length,
    alreadyMigrated: preview.filter((p) => p.alreadyExists).length,
    toMigrate: preview.filter((p) => !p.alreadyExists && !p.excludedReason).length,
    excludedCurrentLogin: preview.filter((p) => p.excludedReason === "current-login").length,
    currentLoginId,
    users: preview,
  });
}

// ============================================================
// SQL 파서 (zetyx_member_table INSERT 문 추출)
// ============================================================
const MEMBER_COLUMNS = [
  "no", "user_id", "password", "name", "email", "homepage",
  "level", "is_admin", "group_no",
  "handphone", "home_tel", "office_tel", "home_address", "office_address",
  "comment", "job", "hobby", "picture", "birth", "point1", "point2",
  "mailing", "open_info", "new_memo", "reg_date",
];
const MEMBER_NUM_COLS = new Set([
  "no", "level", "is_admin", "group_no", "birth", "point1", "point2",
  "mailing", "open_info", "new_memo", "reg_date",
]);

function parseMemberSql(sql: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const tableName = "zetyx_member_table";
  const esc = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `INSERT\\s+INTO\\s+\`?${esc}\`?\\s*(?:\\(([^)]+)\\)\\s*)?VALUES\\s*`,
    "gi"
  );

  let match;
  while ((match = regex.exec(sql)) !== null) {
    const cols = match[1]
      ? match[1].split(",").map((c) => c.trim().replace(/`/g, ""))
      : MEMBER_COLUMNS;

    const startPos = match.index + match[0].length;
    const valuesStr = _extractUntilSemicolon(sql, startPos);
    const tuples = _parseValueTuples(valuesStr);

    for (const tuple of tuples) {
      const row: Record<string, unknown> = {};
      for (let i = 0; i < Math.min(tuple.length, cols.length); i++) {
        const val = tuple[i];
        if (val === null) {
          row[cols[i]] = null;
        } else if (MEMBER_NUM_COLS.has(cols[i]) && /^-?\d+$/.test(val)) {
          row[cols[i]] = parseInt(val, 10);
        } else {
          row[cols[i]] = val;
        }
      }
      results.push(row);
    }
  }
  return results;
}

function _extractUntilSemicolon(sql: string, start: number): string {
  let i = start;
  let inStr = false;
  while (i < sql.length) {
    if (sql[i] === "\\" && inStr) { i += 2; continue; }
    if (sql[i] === "'") {
      if (inStr && i + 1 < sql.length && sql[i + 1] === "'") { i += 2; continue; }
      inStr = !inStr;
    }
    if (!inStr && sql[i] === ";") return sql.substring(start, i);
    i++;
  }
  return sql.substring(start);
}

function _parseValueTuples(valuesStr: string): (string | null)[][] {
  const results: (string | null)[][] = [];
  let i = 0;
  const len = valuesStr.length;

  while (i < len) {
    while (i < len && valuesStr[i] !== "(") i++;
    if (i >= len) break;
    i++;

    const values: (string | null)[] = [];
    while (i < len && valuesStr[i] !== ")") {
      while (i < len && " \t\n\r".includes(valuesStr[i])) i++;
      if (valuesStr[i] === ")") break;

      if (valuesStr[i] === "'") {
        i++;
        let val = "";
        while (i < len) {
          if (valuesStr[i] === "\\" && i + 1 < len) {
            const n = valuesStr[i + 1];
            val += n === "n" ? "\n" : n === "r" ? "\r" : n === "t" ? "\t" : n === "0" ? "\0" : n;
            i += 2;
          } else if (valuesStr[i] === "'" && i + 1 < len && valuesStr[i + 1] === "'") {
            val += "'"; i += 2;
          } else if (valuesStr[i] === "'") {
            i++; break;
          } else {
            val += valuesStr[i++];
          }
        }
        values.push(val);
      } else if (valuesStr.substring(i, i + 4).toUpperCase() === "NULL") {
        values.push(null); i += 4;
      } else {
        let val = "";
        while (i < len && valuesStr[i] !== "," && valuesStr[i] !== ")" && !" \t\n\r".includes(valuesStr[i])) {
          val += valuesStr[i++];
        }
        values.push(val.trim());
      }

      while (i < len && " \t\n\r".includes(valuesStr[i])) i++;
      if (valuesStr[i] === ",") i++;
    }
    if (valuesStr[i] === ")") i++;
    if (values.length > 0) results.push(values);
    while (i < len && valuesStr[i] !== "(" && valuesStr[i] !== ";") i++;
  }
  return results;
}

// ============================================================
// 이관 실행
// ============================================================
async function executeMigration(
  connInfo: ConnectionInfo | null,
  legacyDb: string,
  skipExisting: boolean,
  currentLoginId: string
) {
  const legacyUsers = await fetchLegacyUsers(connInfo, legacyDb);
  return runMigration(legacyUsers, skipExisting, currentLoginId);
}

async function runMigration(
  legacyUsers: Record<string, unknown>[],
  skipExisting: boolean,
  currentLoginId: string
) {
  const existingUsers = await prisma.user.findMany({ select: { userId: true } });
  const existingSet = new Set(existingUsers.map((u) => u.userId));
  const tempHash = await hashPassword("__legacy_migration__");

  let migrated = 0;
  let skipped = 0;
  let skippedCurrentLogin = 0;     // 로그인한 본인(userId 동일) 스킵
  const errors: string[] = [];

  for (const u of legacyUsers) {
    const userId = String(u.user_id || "").trim();
    if (!userId) {
      errors.push(`빈 user_id 건너뜀 (no: ${u.no})`);
      continue;
    }

    // ==== 로그인한 본인 보호 ====
    // 현재 세션의 userId 와 동일한 레코드는 절대 생성/갱신하지 않는다.
    // (권한/비밀번호가 덮여져 락아웃되는 것을 방지)
    if (userId === currentLoginId) {
      skippedCurrentLogin++;
      continue;
    }

    if (existingSet.has(userId)) {
      if (skipExisting) {
        skipped++;
        continue;
      }
      try {
        await prisma.user.update({
          where: { userId },
          data: { legacyPwHash: u.password ? String(u.password) : null },
        });
        migrated++;
      } catch (e) {
        errors.push(`${userId} 업데이트 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
      continue;
    }

    try {
      const regDate =
        u.reg_date && Number(u.reg_date) > 0
          ? new Date(Number(u.reg_date) * 1000)
          : new Date();

      await prisma.user.create({
        data: {
          userId,
          password: tempHash,
          legacyPwHash: u.password ? String(u.password) : null,
          name: String(u.name || userId),
          email: u.email ? String(u.email) : null,
          homepage: u.homepage ? String(u.homepage) : null,
          level: Number(u.level || 10),
          isAdmin: Number(u.is_admin || 3),
          groupNo: Number(u.group_no || 1),
          phone: u.handphone ? String(u.handphone) : null,
          homeTel: u.home_tel ? String(u.home_tel) : null,
          officeTel: u.office_tel ? String(u.office_tel) : null,
          homeAddress: u.home_address ? String(u.home_address) : null,
          officeAddress: u.office_address ? String(u.office_address) : null,
          comment: u.comment ? String(u.comment) : null,
          job: u.job ? String(u.job) : null,
          hobby: u.hobby ? String(u.hobby) : null,
          picture: u.picture ? String(u.picture) : null,
          birth: u.birth ? Number(u.birth) : null,
          point1: Number(u.point1 || 0),
          point2: Number(u.point2 || 0),
          mailing: u.mailing === 1 || u.mailing === true,
          openInfo: u.open_info !== 0 && u.open_info !== false,
          newMemo: u.new_memo === 1 || u.new_memo === true,
          createdAt: regDate,
        },
      });
      migrated++;
    } catch (e) {
      errors.push(`${userId} 생성 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    success: true,
    total: legacyUsers.length,
    migrated,
    skipped,
    skippedCurrentLogin,
    currentLoginId,
    errorCount: errors.length,
    errors: errors.slice(0, 20),
  });
}
