/**
 * 동천교회 DB - 모든 테이블의 칼럼에 COMMENT를 추가하는 스크립트
 *
 * 실행: npx ts-node scripts/add-column-comments.ts
 *
 * information_schema에서 현재 칼럼 정의를 읽어와서
 * ALTER TABLE MODIFY COLUMN으로 안전하게 COMMENT만 추가합니다.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 테이블.칼럼 → 설명 매핑
const columnComments: Record<string, Record<string, string>> = {
  users: {
    id: "회원 번호 (PK)",
    userId: "로그인 ID",
    password: "비밀번호 (bcrypt 해시)",
    legacyPwHash: "제로보드 기존 비밀번호 해시",
    name: "이름",
    email: "이메일",
    homepage: "홈페이지 URL",
    level: "회원 등급 (1=최고관리자, 10=일반)",
    isAdmin: "관리자 구분 (1=전체관리, 2=그룹관리, 3=일반)",
    groupNo: "소속 그룹 번호",
    phone: "휴대전화",
    homeTel: "자택 전화",
    officeTel: "직장 전화",
    homeAddress: "자택 주소",
    officeAddress: "직장 주소",
    comment: "자기소개",
    job: "직업",
    hobby: "취미",
    picture: "프로필 사진 경로",
    birth: "생년월일 (Unix timestamp)",
    point1: "포인트1",
    point2: "포인트2",
    mailing: "메일링 수신 여부",
    openInfo: "정보 공개 여부",
    newMemo: "새 쪽지 알림",
    emailVerified: "이메일 인증 완료 여부",
    emailVerifyToken: "이메일 인증 토큰",
    emailVerifyExpiry: "이메일 인증 토큰 만료일시",
    councilAccess: "권찰회 접근 권한",
    createdAt: "가입일시",
    updatedAt: "정보 수정일시",
  },
  groups: {
    id: "그룹 번호 (PK)",
    name: "그룹명",
    isOpen: "공개 여부",
    icon: "아이콘 경로",
    useJoin: "가입 허용 여부",
    joinLevel: "가입 시 부여 등급",
    headerUrl: "헤더 URL",
    header: "헤더 HTML",
    footerUrl: "푸터 URL",
    footer: "푸터 HTML",
    memberNum: "회원 수",
    boardNum: "게시판 수",
  },
  boards: {
    id: "게시판 번호 (PK)",
    groupId: "소속 그룹 번호 (FK)",
    slug: "게시판 ID (URL용, 예: DcNotice)",
    title: "게시판 제목",
    boardType: "게시판 유형 (BBS/GALLERY/DOWNLOAD 등)",
    skinName: "스킨명",
    headerUrl: "헤더 URL",
    header: "헤더 HTML",
    footerUrl: "푸터 URL",
    footer: "푸터 HTML",
    guideText: "게시판 안내 문구",
    bgImage: "배경 이미지",
    bgColor: "배경색",
    tableWidth: "테이블 너비 (%)",
    postsPerPage: "페이지당 게시글 수",
    pagesPerBlock: "페이지 블록 크기",
    totalPosts: "총 게시글 수",
    useCategory: "카테고리 사용 여부",
    useHtml: "HTML 사용 여부",
    useFilter: "필터 사용 여부",
    useComment: "댓글 사용 여부",
    defaultCommentPolicy: "새 글 댓글 정책 기본값",
    useSecret: "비밀글 사용 여부",
    useReply: "답글 사용 여부",
    useFileUpload: "파일 업로드 사용 여부",
    useHomelink: "홈링크 사용 여부",
    useFilelink: "파일링크 사용 여부",
    useAutolink: "자동 링크 사용 여부",
    useShowIp: "IP 표시 여부",
    useFormmail: "폼메일 사용 여부",
    maxUploadSize: "최대 업로드 크기 (bytes)",
    allowedExt1: "첨부파일1 허용 확장자",
    allowedExt2: "첨부파일2 허용 확장자",
    grantHtml: "HTML 사용 권한 등급",
    grantList: "목록 열람 권한 등급",
    grantView: "본문 열람 권한 등급",
    grantComment: "댓글 작성 권한 등급",
    grantWrite: "글쓰기 권한 등급",
    grantReply: "답글 권한 등급",
    grantDelete: "삭제 권한 등급",
    grantNotice: "공지 등록 권한 등급",
    grantViewSecret: "비밀글 열람 권한 등급",
    filter: "필터 내용",
    avoidTag: "금지 태그",
    avoidIp: "차단 IP",
    cutLength: "제목 자르기 길이 (0=무제한)",
    sortOrder: "메뉴 정렬 순서",
    showInMenu: "메뉴 노출 여부",
    showOnMain: "메인페이지 노출 여부",
    requireLogin: "로그인 필요 여부",
    createdAt: "생성일시",
    updatedAt: "수정일시",
  },
  posts: {
    id: "게시글 번호 (PK)",
    boardId: "게시판 번호 (FK)",
    division: "분류",
    headnum: "원글 그룹 번호 (답글 트리)",
    arrangenum: "그룹 내 정렬 순서",
    depth: "답글 들여쓰기 깊이",
    prevNo: "이전글 번호",
    nextNo: "다음글 번호",
    parentId: "부모글 번호 (답글용)",
    childId: "자식글 번호",
    authorId: "작성자 회원번호 (FK, NULL=비회원)",
    authorLevel: "작성자 등급",
    authorName: "작성자 이름",
    authorIp: "작성자 IP",
    password: "비회원 글 비밀번호",
    email: "작성자 이메일",
    homepage: "작성자 홈페이지",
    subject: "제목",
    content: "본문 내용",
    useHtml: "HTML 사용 여부",
    isSecret: "비밀글 여부",
    isNotice: "공지사항 여부",
    commentPolicy: "댓글 정책 (ALLOW_EDIT/ALLOW/DISABLED)",
    categoryId: "카테고리 번호 (FK)",
    sitelink1: "관련 링크1",
    sitelink2: "관련 링크2",
    fileName1: "첨부파일1 서버 저장명",
    origName1: "첨부파일1 원본 파일명",
    fileName2: "첨부파일2 서버 저장명",
    origName2: "첨부파일2 원본 파일명",
    download1: "첨부파일1 다운로드 수",
    download2: "첨부파일2 다운로드 수",
    hit: "조회수",
    vote: "추천수",
    totalComment: "댓글 수",
    extra1: "확장 필드1",
    extra2: "확장 필드2",
    legacyDate: "기존 제로보드 등록일 (Unix timestamp)",
    createdAt: "작성일시",
    updatedAt: "수정일시",
  },
  comments: {
    id: "댓글 번호 (PK)",
    postId: "게시글 번호 (FK)",
    authorId: "작성자 회원번호 (FK, NULL=비회원)",
    authorName: "작성자 이름",
    password: "비회원 댓글 비밀번호",
    content: "댓글 내용",
    authorIp: "작성자 IP",
    legacyDate: "기존 제로보드 등록일 (Unix timestamp)",
    createdAt: "작성일시",
  },
  categories: {
    id: "카테고리 번호 (PK)",
    boardId: "게시판 번호 (FK)",
    name: "카테고리명",
    sortOrder: "정렬 순서",
  },
  messages: {
    id: "쪽지 번호 (PK)",
    fromId: "보낸 사람 회원번호 (FK)",
    toId: "받는 사람 회원번호 (FK)",
    subject: "제목",
    content: "내용",
    isRead: "읽음 여부",
    legacyDate: "기존 제로보드 등록일 (Unix timestamp)",
    createdAt: "발송일시",
  },
  sessions: {
    id: "세션 ID (PK)",
    sessionToken: "세션 토큰 (쿠키 값)",
    userId: "회원 번호 (FK)",
    expires: "만료일시",
  },
  password_resets: {
    id: "PK",
    token: "초기화 토큰",
    userId: "회원 번호 (FK)",
    expiresAt: "만료일시",
    usedAt: "사용일시",
    createdAt: "요청일시",
  },
  board_user_permissions: {
    id: "PK",
    userId: "회원 번호 (FK)",
    boardId: "게시판 번호 (FK)",
    canEdit: "수정 권한",
    canDelete: "삭제 권한",
    createdAt: "부여일시",
  },
  visitor_counts: {
    id: "PK",
    date: "날짜",
    count: "방문 수",
    createdAt: "생성일시",
  },
  site_settings: {
    id: "PK",
    key: "설정 키",
    value: "설정 값",
  },
  visit_logs: {
    id: "PK",
    ip: "방문자 IP",
    path: "방문 경로 (URL)",
    referer: "유입 경로 (Referer)",
    userAgent: "브라우저 정보",
    userId: "회원 번호 (로그인 사용자)",
    createdAt: "방문일시",
  },
  council_depts: {
    id: "부서 번호 (PK)",
    name: "부서명 (장년반, 중간반 등)",
    sortOrder: "정렬 순서",
  },
  council_groups: {
    id: "구역 번호 (PK)",
    deptId: "소속 부서 번호 (FK)",
    name: "구역명 (1구역, 2구역 등)",
    teacher: "교사/반사 이름",
    sortOrder: "정렬 순서",
  },
  council_members: {
    id: "교인 번호 (PK)",
    groupId: "소속 구역 번호 (FK)",
    name: "교인 이름",
    phone: "연락처",
    note: "비고",
    sortOrder: "정렬 순서",
  },
  council_attendances: {
    id: "출석 기록 번호 (PK)",
    groupId: "구역 번호 (FK)",
    date: "출석 날짜",
    memberName: "교인 이름 (NULL=구역 집계)",
    att1: "출석-주전 예배",
    att2: "출석-주후 예배",
    att3: "출석-삼야 예배",
    att4: "출석-오야 예배",
    att5: "출석-새벽 기도",
    rt1: "실시간-주전 예배",
    rt2: "실시간-주후 예배",
    rt3: "실시간-삼야 예배",
    rt4: "실시간-오야 예배",
    rt5: "실시간-새벽 기도",
    note: "비고",
  },
};

interface ColumnInfo {
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_DEFAULT: string | null;
  EXTRA: string;
  COLUMN_COMMENT: string;
}

// 테이블 COMMENT
const tableComments: Record<string, string> = {
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

async function main() {
  // ─── 1. 테이블 COMMENT 추가 ───
  console.log("=== 테이블 COMMENT 추가 ===\n");
  for (const [tableName, comment] of Object.entries(tableComments)) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${tableName}\` COMMENT = '${comment.replace(/'/g, "\\'")}'`
      );
      console.log(`  ✓ ${tableName}: ${comment}`);
    } catch (err) {
      console.error(`  ✗ ${tableName}: 실패 -`, err instanceof Error ? err.message : err);
    }
  }

  // ─── 2. 칼럼 COMMENT 추가 ───
  console.log("\n=== 칼럼 COMMENT 추가 ===\n");

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const [tableName, columns] of Object.entries(columnComments)) {
    console.log(`\n📋 테이블: ${tableName}`);

    // 현재 칼럼 정의 조회
    const colInfos = await prisma.$queryRawUnsafe<ColumnInfo[]>(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ?
       ORDER BY ORDINAL_POSITION`,
      tableName
    );

    for (const [colName, comment] of Object.entries(columns)) {
      const info = colInfos.find((c) => c.COLUMN_NAME === colName);
      if (!info) {
        console.log(`  ⚠ ${colName}: 칼럼을 찾을 수 없음 (스킵)`);
        totalSkipped++;
        continue;
      }

      // 이미 동일한 코멘트가 있으면 스킵
      if (info.COLUMN_COMMENT === comment) {
        totalSkipped++;
        continue;
      }

      // ALTER TABLE MODIFY COLUMN 구문 생성
      const nullable = info.IS_NULLABLE === "YES" ? "NULL" : "NOT NULL";
      let defaultClause = "";
      if (info.COLUMN_DEFAULT !== null) {
        // 숫자나 CURRENT_TIMESTAMP 등 함수는 따옴표 없이
        if (
          /^\d+$/.test(info.COLUMN_DEFAULT) ||
          info.COLUMN_DEFAULT.includes("CURRENT_TIMESTAMP") ||
          info.COLUMN_DEFAULT === "0" ||
          info.COLUMN_DEFAULT === "1"
        ) {
          defaultClause = ` DEFAULT ${info.COLUMN_DEFAULT}`;
        } else {
          defaultClause = ` DEFAULT '${info.COLUMN_DEFAULT.replace(/'/g, "\\'")}'`;
        }
      }
      // DEFAULT_GENERATED는 MySQL 내부 표현이며 MODIFY COLUMN에 직접 사용 불가 → 제거
      // ON UPDATE CURRENT_TIMESTAMP 등은 유지
      let extra = info.EXTRA ? ` ${info.EXTRA.toUpperCase()}` : "";
      extra = extra.replace(/DEFAULT_GENERATED\s*/gi, "").replace(/\s+ON UPDATE/i, " ON UPDATE");

      const sql = `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${colName}\` ${info.COLUMN_TYPE} ${nullable}${defaultClause}${extra} COMMENT '${comment.replace(/'/g, "\\'")}'`;

      try {
        await prisma.$executeRawUnsafe(sql);
        console.log(`  ✓ ${colName}: ${comment}`);
        totalUpdated++;
      } catch (err) {
        console.error(`  ✗ ${colName}: 실패 -`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(`\n=== 완료: ${totalUpdated}개 업데이트, ${totalSkipped}개 스킵 ===`);
}

main()
  .catch((e) => {
    console.error("스크립트 실행 오류:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
