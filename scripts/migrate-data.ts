// ============================================================
// 제로보드 → 새 시스템 데이터 마이그레이션 스크립트
// ============================================================
//
// 사용법:
//   1. .env에 기존 제로보드 DB와 새 DB 접속 정보 설정
//   2. npx ts-node scripts/migrate-data.ts
//
// 주의사항:
//   - 기존 DB는 EUC-KR 인코딩일 수 있음 → MySQL 접속 시 charset 설정 필요
//   - 이 스크립트는 READ ONLY로 기존 DB를 읽고, 새 DB에 INSERT함
//   - 반드시 기존 DB 백업 후 실행할 것
// ============================================================

import mysql from "mysql2/promise";
import { PrismaClient } from "@prisma/client";

// ============================================================
// 설정
// ============================================================

// 기존 제로보드 DB 접속 정보
const LEGACY_DB = {
  host: "jd1.nskorea.com",       // config.php에서 확인
  user: "pkistdcnet",
  password: "YOUR_PASSWORD",      // 실제 비밀번호 입력
  database: "pkistdcnet",
  charset: "euckr",               // 제로보드 4.1 기본 인코딩
};

// 마이그레이션할 게시판 목록
const BOARDS_TO_MIGRATE = [
  "DcNotice",
  "DcPds",
  "DcHistory",
  "DcStudy",
  "DcCouncil",
  "DcQuestion",
  "DcElement",
];

const prisma = new PrismaClient();

// ============================================================
// 마이그레이션 함수들
// ============================================================

async function migrateMembers(legacy: mysql.Connection) {
  console.log("\n👤 회원 마이그레이션 시작...");

  const [rows] = await legacy.query("SELECT * FROM zetyx_member_table");
  const members = rows as Record<string, unknown>[];

  let count = 0;
  for (const m of members) {
    try {
      await prisma.user.create({
        data: {
          userId: String(m.user_id),
          password: "",                           // bcrypt로 재설정 필요
          legacyPwHash: String(m.password || ""), // 기존 해시 보존
          name: String(m.name),
          email: m.email ? String(m.email) : null,
          homepage: m.homepage ? String(m.homepage) : null,
          level: Number(m.level) || 10,
          isAdmin: Number(m.is_admin) || 3,
          groupNo: Number(m.group_no) || 1,
          phone: m.handphone ? String(m.handphone) : null,
          homeTel: m.home_tel ? String(m.home_tel) : null,
          officeTel: m.office_tel ? String(m.office_tel) : null,
          homeAddress: m.home_address ? String(m.home_address) : null,
          officeAddress: m.office_address ? String(m.office_address) : null,
          comment: m.comment ? String(m.comment) : null,
          job: m.job ? String(m.job) : null,
          hobby: m.hobby ? String(m.hobby) : null,
          picture: m.picture ? String(m.picture) : null,
          birth: m.birth ? Number(m.birth) : null,
          point1: Number(m.point1) || 0,
          point2: Number(m.point2) || 0,
          mailing: m.mailing === "1",
          openInfo: m.openinfo !== "0",
          newMemo: m.new_memo === "1",
        },
      });
      count++;
    } catch (err) {
      console.warn(`  ⚠️ 회원 건너뜀: ${m.user_id} - ${err}`);
    }
  }

  console.log(`  ✅ 회원 ${count}명 이전 완료`);
}

async function migrateBoard(
  legacy: mysql.Connection,
  boardSlug: string
) {
  console.log(`\n📋 게시판 [${boardSlug}] 마이그레이션 시작...`);

  // 새 시스템에서 게시판 찾기
  const board = await prisma.board.findUnique({
    where: { slug: boardSlug },
  });
  if (!board) {
    console.warn(`  ⚠️ 게시판 ${boardSlug}이 새 DB에 없습니다. seed를 먼저 실행하세요.`);
    return;
  }

  // ---- 게시글 이전 ----
  const tableName = `zetyx_board_${boardSlug}`;
  const [postRows] = await legacy.query(
    `SELECT * FROM ${tableName} ORDER BY no ASC`
  );
  const posts = postRows as Record<string, unknown>[];

  // 기존 no → 새 id 매핑 (댓글 이전 시 사용)
  const postIdMap = new Map<number, number>();
  let postCount = 0;

  for (const p of posts) {
    try {
      // 회원 글인 경우 작성자 찾기
      let authorId: number | null = null;
      if (Number(p.ismember) > 0) {
        const user = await prisma.user.findFirst({
          where: { id: Number(p.ismember) },
        });
        if (user) authorId = user.id;
      }

      const newPost = await prisma.post.create({
        data: {
          boardId: board.id,
          division: Number(p.division) || 1,
          headnum: Number(p.headnum) || 0,
          arrangenum: Number(p.arrangenum) || 0,
          depth: Number(p.depth) || 0,
          prevNo: Number(p.prev_no) || 0,
          nextNo: Number(p.next_no) || 0,
          parentId: Number(p.father) || 0,
          childId: Number(p.child) || 0,
          authorId,
          authorLevel: Number(p.islevel) || 10,
          authorName: String(p.name),
          authorIp: p.ip ? String(p.ip) : null,
          password: p.password ? String(p.password) : null,
          email: p.email ? String(p.email) : null,
          homepage: p.homepage ? String(p.homepage) : null,
          subject: String(p.subject),
          content: String(p.memo || ""),
          useHtml: p.use_html === "1",
          isSecret: p.is_secret === "1",
          isNotice: Number(p.headnum) <= -2000000000,
          categoryId: Number(p.category) > 0 ? Number(p.category) : null,
          sitelink1: p.sitelink1 ? String(p.sitelink1) : null,
          sitelink2: p.sitelink2 ? String(p.sitelink2) : null,
          fileName1: p.file_name1 ? String(p.file_name1) : null,
          origName1: p.s_file_name1 ? String(p.s_file_name1) : null,
          fileName2: p.file_name2 ? String(p.file_name2) : null,
          origName2: p.s_file_name2 ? String(p.s_file_name2) : null,
          download1: Number(p.download1) || 0,
          download2: Number(p.download2) || 0,
          hit: Number(p.hit) || 0,
          vote: Number(p.vote) || 0,
          totalComment: Number(p.total_comment) || 0,
          extra1: p.x ? String(p.x) : null,
          extra2: p.y ? String(p.y) : null,
          legacyDate: Number(p.reg_date) || null,
          createdAt: p.reg_date
            ? new Date(Number(p.reg_date) * 1000)
            : new Date(),
        },
      });

      postIdMap.set(Number(p.no), newPost.id);
      postCount++;
    } catch (err) {
      console.warn(`  ⚠️ 게시글 건너뜀: no=${p.no} - ${err}`);
    }
  }

  console.log(`  ✅ 게시글 ${postCount}건 이전`);

  // ---- 댓글 이전 ----
  const commentTable = `zetyx_board_comment_${boardSlug}`;
  try {
    const [commentRows] = await legacy.query(
      `SELECT * FROM ${commentTable} ORDER BY no ASC`
    );
    const comments = commentRows as Record<string, unknown>[];

    let commentCount = 0;
    for (const c of comments) {
      const newPostId = postIdMap.get(Number(c.parent));
      if (!newPostId) continue;

      try {
        let authorId: number | null = null;
        if (Number(c.ismember) > 0) {
          const user = await prisma.user.findFirst({
            where: { id: Number(c.ismember) },
          });
          if (user) authorId = user.id;
        }

        await prisma.comment.create({
          data: {
            postId: newPostId,
            authorId,
            authorName: String(c.name),
            password: c.password ? String(c.password) : null,
            content: String(c.memo || ""),
            authorIp: c.ip ? String(c.ip) : null,
            legacyDate: Number(c.reg_date) || null,
            createdAt: c.reg_date
              ? new Date(Number(c.reg_date) * 1000)
              : new Date(),
          },
        });
        commentCount++;
      } catch (err) {
        console.warn(`  ⚠️ 댓글 건너뜀: no=${c.no} - ${err}`);
      }
    }
    console.log(`  ✅ 댓글 ${commentCount}건 이전`);
  } catch {
    console.log(`  ℹ️ 댓글 테이블 없음 (${commentTable})`);
  }

  // ---- 게시판 글 수 업데이트 ----
  await prisma.board.update({
    where: { id: board.id },
    data: { totalPosts: postCount },
  });
}

async function migrateMessages(legacy: mysql.Connection) {
  console.log("\n💌 쪽지 마이그레이션 시작...");

  try {
    const [rows] = await legacy.query(
      "SELECT * FROM zetyx_get_memo ORDER BY no ASC"
    );
    const messages = rows as Record<string, unknown>[];

    let count = 0;
    for (const m of messages) {
      try {
        await prisma.message.create({
          data: {
            fromId: Number(m.member_from),
            toId: Number(m.member_no),
            subject: String(m.subject),
            content: String(m.memo),
            isRead: m.readed === "1",
            legacyDate: Number(m.reg_date) || null,
            createdAt: m.reg_date
              ? new Date(Number(m.reg_date) * 1000)
              : new Date(),
          },
        });
        count++;
      } catch {
        // 작성자/수신자가 없는 경우 건너뜀
      }
    }
    console.log(`  ✅ 쪽지 ${count}건 이전`);
  } catch {
    console.log("  ℹ️ 쪽지 테이블 없음");
  }
}

// ============================================================
// 메인 실행
// ============================================================

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  제로보드 → Node.js 데이터 마이그레이션");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 기존 DB 연결
  const legacy = await mysql.createConnection(LEGACY_DB);
  console.log("✅ 기존 DB 연결 완료");

  try {
    // 1. 회원 이전
    await migrateMembers(legacy);

    // 2. 게시판별 게시글 + 댓글 이전
    for (const boardSlug of BOARDS_TO_MIGRATE) {
      await migrateBoard(legacy, boardSlug);
    }

    // 3. 쪽지 이전
    await migrateMessages(legacy);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  🎉 마이그레이션 완료!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n다음 단계:");
    console.log("  1. 첨부파일 복사: scp 기존서버:data/ → public/uploads/");
    console.log("  2. 관리자 비밀번호 재설정");
    console.log("  3. 회원 비밀번호 초기화 안내");
  } finally {
    await legacy.end();
    await prisma.$disconnect();
  }
}

main().catch(console.error);
