// ============================================================
// 데이터베이스 초기 시드 데이터
// 실행: npx prisma db seed
// ============================================================

import { PrismaClient, BoardType } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

const BOARDS = [
  { slug: "DcNotice", title: "공지사항", boardType: "BBS" as BoardType },
  { slug: "DcPds", title: "자료실(설교재독)", boardType: "DOWNLOAD" as BoardType },
  { slug: "DcHistory", title: "기록실", boardType: "BBS" as BoardType },
  { slug: "DcStudy", title: "연구실", boardType: "BBS" as BoardType },
  { slug: "DcCouncil", title: "권찰회", boardType: "BBS" as BoardType },
  { slug: "DcQuestion", title: "문답방", boardType: "BBS" as BoardType },
  { slug: "DcElement", title: "주일학교", boardType: "BBS" as BoardType },
];

async function main() {
  console.log("🌱 시드 데이터 생성 시작...\n");

  // 1. 기본 그룹 생성
  const defaultGroup = await prisma.group.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: "동천교회",
      isOpen: true,
      useJoin: true,
      joinLevel: 9,
    },
  });
  console.log(`✅ 그룹 생성: ${defaultGroup.name}`);

  // 2. 관리자 계정 생성
  const adminPassword = await hashPassword("admin1234");
  const admin = await prisma.user.upsert({
    where: { userId: "admin" },
    update: {},
    create: {
      userId: "admin",
      password: adminPassword,
      name: "관리자",
      level: 1,
      isAdmin: 1,
      groupNo: 1,
      email: "admin@pkistdc.net",
    },
  });
  console.log(`✅ 관리자 계정 생성: ${admin.userId} (비밀번호: admin1234)\n`);

  // 3. 게시판 생성
  for (const boardData of BOARDS) {
    const board = await prisma.board.upsert({
      where: { slug: boardData.slug },
      update: {},
      create: {
        slug: boardData.slug,
        title: boardData.title,
        boardType: boardData.boardType,
        groupId: defaultGroup.id,
        postsPerPage: 15,
        pagesPerBlock: 8,
        useCategory: false,
        useComment: true,
        useSecret: true,
        useReply: true,
        useHtml: true,
        useFileUpload: boardData.boardType === "DOWNLOAD",
        grantList: 10,
        grantView: 10,
        grantWrite: 10,
        grantComment: 10,
        grantReply: 10,
        grantDelete: 1,
        grantNotice: 1,
        grantViewSecret: 1,
      },
    });
    console.log(`  📋 게시판: ${board.title} (${board.slug})`);
  }

  console.log("\n🎉 시드 데이터 생성 완료!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("관리자 로그인: admin / admin1234");
  console.log("⚠️  배포 전에 반드시 관리자 비밀번호를 변경하세요!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((e) => {
    console.error("❌ 시드 생성 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
