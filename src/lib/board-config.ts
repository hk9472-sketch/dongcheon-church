// ============================================================
// 동천교회 게시판 설정
// pkistdc.net 라이브 사이트에서 확인된 게시판 목록
// prisma seed 데이터로 사용
// ============================================================

export interface BoardSeedData {
  slug: string;
  title: string;
  boardType: "BBS" | "GALLERY" | "DOWNLOAD" | "MUSIC" | "VOTE";
  description?: string;
}

/**
 * 동천교회 게시판 목록
 * 라이브 사이트(pkistdc.net)에서 확인된 게시판들
 */
export const DONGCHEON_BOARDS: BoardSeedData[] = [
  {
    slug: "DcNotice",
    title: "공지사항",
    boardType: "BBS",
    description: "교회 공지사항",
  },
  {
    slug: "DcPds",
    title: "자료실",
    boardType: "DOWNLOAD",
    description: "설교 자료 및 재독 자료",
  },
  {
    slug: "DcHistory",
    title: "기록실",
    boardType: "BBS",
    description: "교회 기록 자료",
  },
  {
    slug: "DcStudy",
    title: "연구실",
    boardType: "BBS",
    description: "성경 연구 자료",
  },
  {
    slug: "DcCouncil",
    title: "권찰회",
    boardType: "BBS",
    description: "권찰회 게시판",
  },
  {
    slug: "DcQuestion",
    title: "문답방",
    boardType: "BBS",
    description: "질문과 답변",
  },
  {
    slug: "DcElement",
    title: "주일학교",
    boardType: "BBS",
    description: "주일학교 게시판",
  },
];

/**
 * 네비게이션 메뉴 구조
 */
export const NAV_MENU = [
  { label: "공지사항", href: "/board/DcNotice" },
  { label: "자료실", href: "/board/DcPds" },
  { label: "기록실", href: "/board/DcHistory" },
  { label: "연구실", href: "/board/DcStudy" },
  { label: "권찰회", href: "/board/DcCouncil" },
  { label: "문답방", href: "/board/DcQuestion" },
  { label: "주일학교", href: "/board/DcElement" },
];
