import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

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
    select: { id: true, isAdmin: true },
  });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

// ============================================================
// 유틸리티
// ============================================================
function sanitizeTableName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/** BigInt, Date, Buffer 등을 JSON 직렬화 가능한 값으로 변환 */
function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "bigint") {
      result[key] = Number(value);
    } else if (value instanceof Date) {
      result[key] = value.toISOString();
    } else if (Buffer.isBuffer(value)) {
      result[key] = `[BLOB ${value.length} bytes]`;
    } else {
      result[key] = value;
    }
  }
  return result;
}

function serializeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(serializeRow);
}

// 위험 쿼리 차단
const BLOCKED_PATTERNS = [
  /DROP\s+DATABASE/i,
  /DROP\s+SCHEMA/i,
  /GRANT\s+/i,
  /REVOKE\s+/i,
  /CREATE\s+USER/i,
  /ALTER\s+USER/i,
  /DROP\s+USER/i,
  /FLUSH\s+/i,
  /LOAD\s+DATA/i,
  /INTO\s+OUTFILE/i,
  /INTO\s+DUMPFILE/i,
];

function checkBlocked(query: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(query)) {
      return `차단된 쿼리입니다: ${pattern.source}`;
    }
  }
  return null;
}

function isReadQuery(query: string): boolean {
  return /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\s/i.test(query);
}

// ============================================================
// GET: 테이블 목록, 구조, 데이터 조회
// ============================================================
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const table = url.searchParams.get("table") || "";

  try {
    // 테이블 목록
    if (action === "tables") {
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        "SHOW TABLE STATUS"
      );
      const tableNames = rows.map((t) => String(t.Name || ""));

      // 정확한 행 수 조회 (SHOW TABLE STATUS의 Rows는 InnoDB 추정치)
      const countPromises = tableNames.map((name) =>
        prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT COUNT(*) as cnt FROM \`${name}\``
        )
          .then((r) => ({ name, count: Number(r[0]?.cnt || 0) }))
          .catch(() => ({ name, count: 0 }))
      );
      const counts = await Promise.all(countPromises);
      const countMap = new Map(counts.map((c) => [c.name, c.count]));

      const tables = rows.map((t) => {
        const name = String(t.Name || "");
        return {
          name,
          rows: countMap.get(name) ?? Number(t.Rows || 0),
          engine: String(t.Engine || ""),
          size: formatBytes(Number(t.Data_length || 0) + Number(t.Index_length || 0)),
          dataLength: Number(t.Data_length || 0),
          comment: String(t.Comment || ""),
          collation: String(t.Collation || ""),
          autoIncrement: t.Auto_increment ? Number(t.Auto_increment) : null,
        };
      });
      return NextResponse.json({ tables });
    }

    // 테이블 구조
    if (action === "describe") {
      if (!table || !sanitizeTableName(table)) {
        return NextResponse.json({ error: "유효하지 않은 테이블명" }, { status: 400 });
      }

      const [columnsRaw, indexesRaw, createRaw] = await Promise.all([
        prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SHOW FULL COLUMNS FROM \`${table}\``
        ),
        prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SHOW INDEX FROM \`${table}\``
        ),
        prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SHOW CREATE TABLE \`${table}\``
        ),
      ]);

      const columns = columnsRaw.map((c) => ({
        field: String(c.Field || ""),
        type: String(c.Type || ""),
        collation: c.Collation ? String(c.Collation) : null,
        null: String(c.Null || ""),
        key: String(c.Key || ""),
        default: c.Default !== undefined && c.Default !== null ? String(c.Default) : null,
        extra: String(c.Extra || ""),
        comment: String(c.Comment || ""),
      }));

      const indexes = indexesRaw.map((idx) => ({
        keyName: String(idx.Key_name || ""),
        seq: Number(idx.Seq_in_index || 0),
        columnName: String(idx.Column_name || ""),
        nonUnique: Number(idx.Non_unique || 0),
        indexType: String(idx.Index_type || ""),
        cardinality: idx.Cardinality !== null ? Number(idx.Cardinality) : null,
      }));

      const createTable = createRaw[0]
        ? String(createRaw[0]["Create Table"] || "")
        : "";

      return NextResponse.json({ columns, indexes, createTable });
    }

    // 데이터 조회
    if (action === "data") {
      if (!table || !sanitizeTableName(table)) {
        return NextResponse.json({ error: "유효하지 않은 테이블명" }, { status: 400 });
      }

      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
      const offset = (page - 1) * limit;

      const [countResult, rows] = await Promise.all([
        prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT COUNT(*) as total FROM \`${table}\``
        ),
        prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM \`${table}\` LIMIT ${limit} OFFSET ${offset}`
        ),
      ]);

      const total = Number(countResult[0]?.total || 0);
      const serializedRows = serializeRows(rows);
      const dataColumns = serializedRows.length > 0 ? Object.keys(serializedRows[0]) : [];

      return NextResponse.json({
        columns: dataColumns,
        rows: serializedRows,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        limit,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}

// ============================================================
// POST: SQL 쿼리 실행
// ============================================================
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  try {
    const body = await request.json();
    let query = (body.query || "").trim();

    if (!query) {
      return NextResponse.json({ error: "쿼리를 입력하세요." }, { status: 400 });
    }

    // 끝의 세미콜론 제거
    if (query.endsWith(";")) {
      query = query.slice(0, -1).trim();
    }

    // 멀티 스테이트먼트 체크 (문자열 내 세미콜론 제외)
    let inString = false;
    let escape = false;
    for (let i = 0; i < query.length; i++) {
      if (escape) { escape = false; continue; }
      if (query[i] === "\\") { escape = true; continue; }
      if (query[i] === "'") { inString = !inString; continue; }
      if (!inString && query[i] === ";") {
        return NextResponse.json(
          { error: "한 번에 하나의 쿼리만 실행할 수 있습니다. 세미콜론으로 구분된 여러 쿼리는 지원하지 않습니다." },
          { status: 400 }
        );
      }
    }

    // 차단 쿼리 확인
    const blocked = checkBlocked(query);
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 403 });
    }

    const start = Date.now();

    if (isReadQuery(query)) {
      // SELECT 결과 최대 1000행 제한
      let limitedQuery = query;
      if (/^\s*SELECT\s/i.test(query) && !/\bLIMIT\s+\d/i.test(query)) {
        limitedQuery = `${query} LIMIT 1000`;
      }

      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(limitedQuery);
      const executionTime = Date.now() - start;
      const serialized = serializeRows(rows);
      const columns = serialized.length > 0 ? Object.keys(serialized[0]) : [];

      return NextResponse.json({
        type: "select",
        columns,
        rows: serialized,
        rowCount: serialized.length,
        executionTime,
      });
    } else {
      // 쓰기 쿼리 실행
      const result = await prisma.$executeRawUnsafe(query);
      const executionTime = Date.now() - start;

      return NextResponse.json({
        type: "execute",
        affectedRows: Number(result),
        executionTime,
      });
    }
  } catch (e) {
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}
