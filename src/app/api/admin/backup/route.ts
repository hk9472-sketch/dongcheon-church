import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import archiver from "archiver";
import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import { PassThrough } from "stream";

// 백업 시 제외할 파일(비밀 유출 방지)
const EXCLUDED_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.example",
]);

async function verifyAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires < new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDatabaseUrl(url: string) {
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!m) return null;
  return { user: m[1], password: m[2], host: m[3], port: m[4], database: m[5] };
}

function archiverToStream(archive: archiver.Archiver): ReadableStream<Uint8Array> {
  const passThrough = new PassThrough();
  archive.pipe(passThrough);

  return new ReadableStream({
    start(controller) {
      passThrough.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      passThrough.on("end", () => {
        controller.close();
      });
      passThrough.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      archive.abort();
    },
  });
}

// GET /api/admin/backup?type=...
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const type = request.nextUrl.searchParams.get("type");
  const date = todayStr();
  const root = process.cwd();

  // ─── 폴더 목록 (첨부파일용) + 게시판명 ───
  if (type === "list-folders") {
    const dataDir = path.join(root, "data");
    if (!fs.existsSync(dataDir)) {
      return NextResponse.json({ folders: [] });
    }
    const entries = fs.readdirSync(dataDir, { withFileTypes: true });
    const folderNames = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    // 게시판 slug → title 매핑
    const boards = await prisma.board.findMany({
      select: { slug: true, title: true },
    });
    const boardMap: Record<string, string> = {};
    for (const b of boards) {
      boardMap[b.slug] = b.title;
    }

    const folders = folderNames.map((name) => ({
      name,
      title: boardMap[name] || "",
    }));

    return NextResponse.json({ folders });
  }

  // ─── 테이블 목록 (DB용) + 테이블 설명 ───
  if (type === "list-tables") {
    // DB에 TABLE_COMMENT가 없을 경우를 위한 기본 설명
    const fallbackComments: Record<string, string> = {
      users: "회원 정보",
      groups: "게시판 그룹",
      boards: "게시판 설정",
      posts: "게시글",
      comments: "댓글",
      categories: "게시판 카테고리",
      messages: "쪽지",
      sessions: "로그인 세션",
      password_resets: "비밀번호 초기화 토큰",
      board_user_permissions: "게시판별 사용자 권한",
      visitor_counts: "방문자 일별 카운터",
      site_settings: "사이트 설정",
      visit_logs: "방문 로그",
      council_depts: "권찰회 부서",
      council_groups: "권찰회 구역",
      council_members: "권찰회 교인 명단",
      council_attendances: "권찰회 출석 기록",
    };

    try {
      const result = await prisma.$queryRawUnsafe<Record<string, string>[]>(
        `SELECT table_name AS tbl_name, table_comment AS tbl_comment FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`
      );
      const tables = result.map((r) => ({
        name: r.tbl_name || "",
        comment: r.tbl_comment || fallbackComments[r.tbl_name] || "",
      }));
      return NextResponse.json({ tables });
    } catch {
      return NextResponse.json({ tables: [] });
    }
  }

  // ─── 소스코드 백업 ───
  if (type === "source") {
    const archive = archiver("zip", { zlib: { level: 5 } });

    const dirs = ["src", "prisma", "public", "scripts", "nginx"];
    for (const dir of dirs) {
      const fullPath = path.join(root, dir);
      if (fs.existsSync(fullPath)) {
        archive.directory(fullPath, dir);
      }
    }

    const rootFiles = [
      "package.json", "package-lock.json", "tsconfig.json",
      "next.config.ts", "postcss.config.mjs", "eslint.config.mjs",
      ".gitignore", ".dockerignore",
      "Dockerfile", "docker-compose.yml",
    ];
    for (const file of rootFiles) {
      if (EXCLUDED_FILES.has(file)) continue; // 방어적 체크
      const fullPath = path.join(root, file);
      if (fs.existsSync(fullPath)) {
        archive.file(fullPath, { name: file });
      }
    }

    archive.finalize();
    const stream = archiverToStream(archive);

    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="dongcheon-source-${date}.zip"`,
      },
    });
  }

  // ─── 첨부파일 백업 (게시판별 선택) ───
  if (type === "files") {
    const dataDir = path.join(root, "data");
    if (!fs.existsSync(dataDir)) {
      return NextResponse.json({ message: "data 디렉토리가 존재하지 않습니다." }, { status: 404 });
    }

    const selectedFolders = request.nextUrl.searchParams.getAll("folders");
    if (selectedFolders.length === 0) {
      return NextResponse.json({ message: "백업할 게시판을 선택해주세요." }, { status: 400 });
    }

    const archive = archiver("zip", { zlib: { level: 5 } });

    for (const folder of selectedFolders) {
      const safeName = path.basename(folder);
      const folderPath = path.join(dataDir, safeName);
      if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
        archive.directory(folderPath, `data/${safeName}`);
      }
    }

    archive.finalize();
    const stream = archiverToStream(archive);

    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="dongcheon-files-${date}.zip"`,
      },
    });
  }

  // ─── DB 덤프 백업 (테이블별 선택) ───
  if (type === "db") {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return NextResponse.json({ message: "DATABASE_URL이 설정되지 않았습니다." }, { status: 500 });
    }

    const db = parseDatabaseUrl(dbUrl);
    if (!db) {
      return NextResponse.json({ message: "DATABASE_URL 형식을 파싱할 수 없습니다." }, { status: 500 });
    }

    const selectedTables = request.nextUrl.searchParams.getAll("tables");
    if (selectedTables.length === 0) {
      return NextResponse.json({ message: "백업할 테이블을 선택해주세요." }, { status: 400 });
    }

    const safeTablePattern = /^[a-zA-Z0-9_]+$/;
    const safeTables = selectedTables.filter((t) => safeTablePattern.test(t));
    if (safeTables.length === 0) {
      return NextResponse.json({ message: "유효한 테이블명이 없습니다." }, { status: 400 });
    }

    try {
      const args = [
        `-h${db.host}`,
        `-P${db.port}`,
        `-u${db.user}`,
        db.database,
        ...safeTables,
        "--single-transaction",
        "--routines",
        "--triggers",
      ];
      // 비밀번호는 MYSQL_PWD 환경변수로 전달 (쉘 주입 방지)
      const dump = execFileSync("mysqldump", args, {
        maxBuffer: 100 * 1024 * 1024,
        env: { ...process.env, MYSQL_PWD: db.password },
      });

      return new Response(dump, {
        headers: {
          "Content-Type": "application/sql; charset=utf-8",
          "Content-Disposition": `attachment; filename="dongcheon-db-${date}.sql"`,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "mysqldump 실행에 실패했습니다.";
      console.error("mysqldump error:", message);
      return NextResponse.json(
        { message: `DB 덤프에 실패했습니다. mysqldump가 설치되어 있는지 확인하세요.` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ message: "type 파라미터가 필요합니다." }, { status: 400 });
}
