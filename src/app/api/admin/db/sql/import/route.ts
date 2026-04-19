import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

// ============================================================
// SQL 덤프 업로드/실행 — /api/admin/db/sql/import
// - 멀티 스테이트먼트 .sql 파일을 받아 순차 실행
// - DDL 자동커밋 특성 상 트랜잭션으로 묶지 않음
// - 위험 패턴(DROP DATABASE, GRANT, LOAD DATA 등) 차단은 /sql POST 와 동일
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 300; // 최대 5분 (Vercel 기본 한계에 대응, 자체 호스팅엔 영향 없음)

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

// SQL 관리 route 와 동일한 차단 패턴
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

function checkBlocked(sql: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(sql)) return `차단된 패턴: ${pattern.source}`;
  }
  return null;
}

/**
 * MySQL 스타일 덤프를 개별 문장으로 분리.
 * 지원: 작은따옴표/큰따옴표/백틱 문자열, `--` 라인 주석, `/* *\/` 블록 주석.
 * 미지원: DELIMITER 지시자 (프로시저 덤프는 별도 처리 필요).
 */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : "";

    if (inLine) {
      buf += ch;
      if (ch === "\n") inLine = false;
      continue;
    }
    if (inBlock) {
      buf += ch;
      if (ch === "*" && next === "/") {
        buf += next;
        i++;
        inBlock = false;
      }
      continue;
    }
    if (inSingle) {
      buf += ch;
      if (ch === "\\" && next) {
        buf += next;
        i++;
        continue;
      }
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      buf += ch;
      if (ch === "\\" && next) {
        buf += next;
        i++;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inBacktick) {
      buf += ch;
      if (ch === "`") inBacktick = false;
      continue;
    }

    if (ch === "-" && next === "-") {
      buf += "--";
      i++;
      inLine = true;
      continue;
    }
    if (ch === "#") {
      buf += ch;
      inLine = true;
      continue;
    }
    if (ch === "/" && next === "*") {
      buf += "/*";
      i++;
      inBlock = true;
      continue;
    }
    if (ch === "'") {
      buf += ch;
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      buf += ch;
      inDouble = true;
      continue;
    }
    if (ch === "`") {
      buf += ch;
      inBacktick = true;
      continue;
    }
    if (ch === ";") {
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);

  // 주석만 있는 문장 제거
  return out.filter((s) => {
    const stripped = s
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/--[^\n]*\n?/g, "")
      .replace(/#[^\n]*\n?/g, "")
      .trim();
    return stripped.length > 0;
  });
}

interface ExecError {
  index: number;
  statement: string;
  error: string;
}

export async function POST(request: NextRequest) {
  const user = await verifyAdmin();
  if (!user) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 401 });
  }

  let sqlText = "";
  let source = "unknown";

  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file 필드가 없습니다." }, { status: 400 });
      }
      const maxBytes = 50 * 1024 * 1024; // 50 MB
      if (file.size > maxBytes) {
        return NextResponse.json(
          { error: `파일이 너무 큽니다: ${(file.size / 1024 / 1024).toFixed(1)}MB (최대 50MB)` },
          { status: 413 }
        );
      }
      sqlText = await file.text();
      source = file.name || "upload.sql";
    } else {
      const body = await request.json();
      sqlText = String(body.sql || "");
      source = "paste";
    }
  } catch (e) {
    return NextResponse.json(
      { error: `요청 파싱 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 }
    );
  }

  if (!sqlText.trim()) {
    return NextResponse.json({ error: "SQL 내용이 비어 있습니다." }, { status: 400 });
  }

  // DELIMITER 지시어가 있으면 거절 — 프로시저 덤프는 별도 지원
  if (/^\s*DELIMITER\s+/im.test(sqlText)) {
    return NextResponse.json(
      { error: "DELIMITER 지시어는 지원하지 않습니다. 프로시저/트리거 덤프는 mysql CLI 로 직접 import 하세요." },
      { status: 400 }
    );
  }

  // 전체 문자열 수준에서 위험 패턴 확인
  const blocked = checkBlocked(sqlText);
  if (blocked) {
    return NextResponse.json({ error: `차단된 쿼리가 포함돼 있습니다 — ${blocked}` }, { status: 403 });
  }

  const statements = splitStatements(sqlText);
  if (statements.length === 0) {
    return NextResponse.json({ error: "실행할 문장을 찾지 못했습니다." }, { status: 400 });
  }

  // 문장별 차단 재확인
  for (let i = 0; i < statements.length; i++) {
    const b = checkBlocked(statements[i]);
    if (b) {
      return NextResponse.json(
        { error: `문장 #${i + 1} 차단됨: ${b}` },
        { status: 403 }
      );
    }
  }

  const body = await request.clone().text().catch(() => "");
  void body; // 사용 안 함, 참고만

  const start = Date.now();
  const errors: ExecError[] = [];
  let succeeded = 0;
  const stopOnError = true; // 기본 정책: 첫 실패 시 중단. 향후 옵션으로 확장 가능.

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await prisma.$executeRawUnsafe(stmt);
      succeeded++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({
        index: i + 1,
        statement: stmt.length > 200 ? stmt.slice(0, 200) + "…" : stmt,
        error: msg,
      });
      if (stopOnError) break;
    }
  }

  const elapsed = Date.now() - start;

  return NextResponse.json({
    source,
    total: statements.length,
    succeeded,
    failed: errors.length,
    errors,
    elapsed,
  });
}
