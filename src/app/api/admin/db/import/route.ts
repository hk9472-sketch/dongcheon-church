import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import mysql from "mysql2/promise";

// 타임아웃 확대 (대량 INSERT 처리)
export const maxDuration = 120;

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

  const session = await prisma.session.findUnique({
    where: { sessionToken },
  });
  if (!session || session.expires < new Date()) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, isAdmin: true },
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
    const [tables] = await connection.execute("SHOW TABLES LIKE 'counter_main'");
    const hasCounterTable = (tables as unknown[]).length > 0;
    await connection.end();
    return NextResponse.json({
      success: true,
      message: `접속 성공: ${connInfo.host}:${connInfo.port || 3306}/${connInfo.database}`,
      hasCounterTable,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `접속 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/admin/db/import — pkistdc.net 데이터 이관
// ============================================================
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { source } = body;

    // 접속 테스트
    if (source === "test-connection") {
      return handleTestConnection(body.connectionInfo);
    }

    if (source === "direct") {
      return await importDirect(body);
    }

    if (source === "json") {
      return await importFromJson(body);
    }

    if (source === "preview-sql") {
      return await previewFromSql(body.sql);
    }

    if (source === "sql") {
      return await importFromSql(body.sql);
    }

    return NextResponse.json(
      { error: "source는 'direct', 'json', 'sql', 'test-connection' 중 하나여야 합니다." },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Import] Error:", error);
    return NextResponse.json(
      {
        error: "이관 실패",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// ============================================================
// 방법 1: 직접 이관 (원격 서버 또는 같은 서버)
// body: { source: "direct", legacyDb: "pkistdc", connectionInfo?: {...} }
// ============================================================
async function importDirect(body: { legacyDb?: string; connectionInfo?: ConnectionInfo }) {
  const legacyDb = body.legacyDb || "pkistdc";
  const connInfo: ConnectionInfo | null = body.connectionInfo?.host ? body.connectionInfo : null;

  // 원격/로컬 쿼리 헬퍼
  async function runQuery<T>(sql: string): Promise<T[]> {
    if (connInfo) {
      const conn = await mysql.createConnection(buildConnectionOptions(connInfo));
      try {
        const [rows] = await conn.execute(sql);
        return rows as T[];
      } finally {
        await conn.end();
      }
    }
    return await prisma.$queryRawUnsafe<T[]>(sql);
  }

  const prefix = connInfo ? "" : `\`${legacyDb}\`.`;
  const results = {
    counterMain: 0,
    counterIp: 0,
    counterReferer: 0,
    errors: [] as string[],
  };

  // 1) counter_main → visitor_counts
  try {
    const rows = await runQuery<{ date: number; unique_counter: number; pageview: number }>(
      `SELECT date, unique_counter, pageview FROM ${prefix}counter_main WHERE date > 0`
    );

    for (const row of rows) {
      const dateObj = new Date(row.date * 1000);
      const dateStr = dateObj.toISOString().slice(0, 10);
      const dateOnly = new Date(dateStr + "T00:00:00+09:00");

      await prisma.visitorCount.upsert({
        where: { date: dateOnly },
        create: { date: dateOnly, count: row.unique_counter || 0 },
        update: { count: row.unique_counter || 0 },
      });
      results.counterMain++;
    }
  } catch (e) {
    results.errors.push(
      `counter_main 이관 실패: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // 2) counter_ip → visit_logs
  try {
    const rows = await runQuery<{ date: number; ip: string }>(
      `SELECT date, ip FROM ${prefix}counter_ip WHERE date > 0`
    );

    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await prisma.visitLog.createMany({
        data: batch.map((row) => ({
          ip: row.ip || "unknown",
          path: "/",
          createdAt: new Date(row.date * 1000),
        })),
        skipDuplicates: true,
      });
      results.counterIp += batch.length;
    }
  } catch (e) {
    results.errors.push(
      `counter_ip 이관 실패: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // 3) counter_referer → visit_logs
  try {
    const rows = await runQuery<{ date: number; hit: number; referer: string }>(
      `SELECT date, hit, referer FROM ${prefix}counter_referer WHERE date > 0`
    );

    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await prisma.visitLog.createMany({
        data: batch.map((row) => ({
          ip: "legacy",
          path: "/",
          referer: row.referer || null,
          createdAt: new Date(row.date * 1000),
        })),
        skipDuplicates: true,
      });
      results.counterReferer += batch.length;
    }
  } catch (e) {
    results.errors.push(
      `counter_referer 이관 실패: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  return NextResponse.json({
    success: true,
    message: `이관 완료: counter_main ${results.counterMain}건, counter_ip ${results.counterIp}건, counter_referer ${results.counterReferer}건`,
    results,
  });
}

// ============================================================
// 방법 2: JSON 데이터로 이관
// ============================================================
async function importFromJson(body: {
  counterMain?: { date: number; unique_counter: number; pageview: number }[];
  counterIp?: { date: number; ip: string }[];
  counterReferer?: { date: number; hit: number; referer: string }[];
}) {
  const results = {
    counterMain: 0,
    counterIp: 0,
    counterReferer: 0,
    errors: [] as string[],
  };

  // 1) counter_main → visitor_counts
  if (body.counterMain && Array.isArray(body.counterMain)) {
    for (const row of body.counterMain) {
      try {
        if (!row.date || row.date <= 0) continue;
        const dateObj = new Date(row.date * 1000);
        const dateStr = dateObj.toISOString().slice(0, 10);
        const dateOnly = new Date(dateStr + "T00:00:00+09:00");

        await prisma.visitorCount.upsert({
          where: { date: dateOnly },
          create: { date: dateOnly, count: row.unique_counter || 0 },
          update: { count: row.unique_counter || 0 },
        });
        results.counterMain++;
      } catch (e) {
        results.errors.push(
          `counter_main row 실패: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  // 2) counter_ip → visit_logs
  if (body.counterIp && Array.isArray(body.counterIp)) {
    const batchSize = 100;
    for (let i = 0; i < body.counterIp.length; i += batchSize) {
      const batch = body.counterIp.slice(i, i + batchSize);
      try {
        await prisma.visitLog.createMany({
          data: batch
            .filter((row) => row.date > 0)
            .map((row) => ({
              ip: row.ip || "unknown",
              path: "/",
              createdAt: new Date(row.date * 1000),
            })),
          skipDuplicates: true,
        });
        results.counterIp += batch.length;
      } catch (e) {
        results.errors.push(
          `counter_ip batch 실패: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  // 3) counter_referer → visit_logs
  if (body.counterReferer && Array.isArray(body.counterReferer)) {
    const batchSize = 100;
    for (let i = 0; i < body.counterReferer.length; i += batchSize) {
      const batch = body.counterReferer.slice(i, i + batchSize);
      try {
        await prisma.visitLog.createMany({
          data: batch
            .filter((row) => row.date > 0)
            .map((row) => ({
              ip: "legacy",
              path: "/",
              referer: row.referer || null,
              createdAt: new Date(row.date * 1000),
            })),
          skipDuplicates: true,
        });
        results.counterReferer += batch.length;
      } catch (e) {
        results.errors.push(
          `counter_referer batch 실패: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `이관 완료: counter_main ${results.counterMain}건, counter_ip ${results.counterIp}건, counter_referer ${results.counterReferer}건`,
    results,
  });
}

// ============================================================
// 방법 3: SQL 덤프 미리보기
// ============================================================
async function previewFromSql(sql: string) {
  if (!sql || sql.length < 10) {
    return NextResponse.json({ error: "SQL 데이터가 필요합니다." }, { status: 400 });
  }
  const parsed = parseCounterSql(sql);
  return NextResponse.json({
    success: true,
    counterMain: parsed.counterMain.length,
    counterIp: parsed.counterIp.length,
    counterReferer: parsed.counterReferer.length,
  });
}

// ============================================================
// 방법 3: SQL 덤프 이관 실행
// ============================================================
async function importFromSql(sql: string) {
  if (!sql || sql.length < 10) {
    return NextResponse.json({ error: "SQL 데이터가 필요합니다." }, { status: 400 });
  }
  const parsed = parseCounterSql(sql);
  return importFromJson({
    counterMain: parsed.counterMain,
    counterIp: parsed.counterIp,
    counterReferer: parsed.counterReferer,
  });
}

// ============================================================
// SQL 파서: counter 테이블 INSERT 문 추출
// ============================================================
function parseCounterSql(sql: string) {
  return {
    counterMain: _extractCounterRows<{ date: number; unique_counter: number; pageview: number }>(
      sql, "counter_main"
    ),
    counterIp: _extractCounterRows<{ date: number; ip: string }>(
      sql, "counter_ip"
    ),
    counterReferer: _extractCounterRows<{ date: number; hit: number; referer: string }>(
      sql, "counter_referer"
    ),
  };
}

function _extractCounterRows<T>(sql: string, tableName: string): T[] {
  const results: T[] = [];
  const esc = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // optional db prefix: `db`.`table` or just `table` or table
  const regex = new RegExp(
    `INSERT\\s+INTO\\s+(?:\`[^\`]+\`\\.)?\\s*\`?${esc}\`?\\s*(?:\\(([^)]+)\\)\\s*)?VALUES\\s*`,
    "gi"
  );

  // 컬럼명이 명시되지 않은 INSERT에 대한 기본 컬럼 순서 (no 포함)
  const defaultCols: Record<string, string[]> = {
    counter_main: ["no", "date", "unique_counter", "pageview"],
    counter_ip: ["no", "date", "ip"],
    counter_referer: ["no", "date", "hit", "referer"],
  };

  let match;
  while ((match = regex.exec(sql)) !== null) {
    const colsStr = match[1];
    const cols = colsStr
      ? colsStr.split(",").map((c) => c.trim().replace(/`/g, "").toLowerCase())
      : defaultCols[tableName] || [];
    if (cols.length === 0) continue;

    const startPos = match.index + match[0].length;
    const valuesStr = _sqlExtractUntilSemi(sql, startPos);
    const tuples = _sqlParseValueTuples(valuesStr);

    for (const tuple of tuples) {
      const row: Record<string, unknown> = {};
      for (let i = 0; i < Math.min(tuple.length, cols.length); i++) {
        const val = tuple[i];
        if (val === null) {
          row[cols[i]] = null;
        } else if (/^-?\d+(\.\d+)?$/.test(val)) {
          row[cols[i]] = parseFloat(val);
        } else {
          row[cols[i]] = val;
        }
      }
      if (Number(row.date) > 0) results.push(row as T);
    }
    regex.lastIndex = match.index + match[0].length + valuesStr.length;
  }
  return results;
}

function _sqlExtractUntilSemi(sql: string, start: number): string {
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

function _sqlParseValueTuples(valuesStr: string): (string | null)[][] {
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
      if (i >= len || valuesStr[i] === ")") break;

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
        values.push(val.trim() || null);
      }

      while (i < len && " \t\n\r".includes(valuesStr[i])) i++;
      if (i < len && valuesStr[i] === ",") i++;
    }
    if (i < len && valuesStr[i] === ")") i++;
    if (values.length > 0) results.push(values);
    while (i < len && valuesStr[i] !== "(" && valuesStr[i] !== ";") i++;
  }
  return results;
}
