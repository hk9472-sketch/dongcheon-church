// ============================================================
// 스킨 레지스트리
// 기존 제로보드 skin/ 디렉토리의 17개 스킨을 매핑
// ============================================================

export interface SkinConfig {
  id: string;           // 스킨 폴더명 (제로보드 호환)
  name: string;         // 표시 이름
  type: SkinType;       // 스킨 유형
  description: string;
  author: string;
  supportedBoards: BoardTypeCompat[];
  thumbnail: string;    // 미리보기 이미지 경로
  // 스타일 설정
  styles: {
    primaryColor: string;
    bgColor: string;
    textColor: string;
    headerBg: string;
    borderColor: string;
    accentColor: string;
    fontFamily: string;
    borderRadius: string;
  };
}

export type SkinType = "bbs" | "gallery" | "music" | "vote" | "download" | "web" | "multi";
export type BoardTypeCompat = "BBS" | "GALLERY" | "DOWNLOAD" | "MUSIC" | "VOTE";

// ============================================================
// 기존 제로보드 스킨 17종 전체 등록
// ============================================================

export const SKINS: SkinConfig[] = [
  // ── BBS 스킨 ──────────────────────────────────
  {
    id: "HOJINnaraBBS",
    name: "호진나라 BBS",
    type: "bbs",
    description: "깔끔한 테이블 기반 BBS 스킨. 클래식한 게시판 디자인.",
    author: "호진나라",
    supportedBoards: ["BBS"],
    thumbnail: "/skins/HOJINnaraBBS/preview.png",
    styles: {
      primaryColor: "#2563eb",
      bgColor: "#ffffff",
      textColor: "#1f2937",
      headerBg: "#f3f4f6",
      borderColor: "#e5e7eb",
      accentColor: "#3b82f6",
      fontFamily: "'맑은 고딕', sans-serif",
      borderRadius: "4px",
    },
  },
  {
    id: "jeju_bbs",
    name: "제주 BBS",
    type: "bbs",
    description: "제주도 분위기의 따뜻한 색감 BBS 스킨. 카테고리 지원.",
    author: "제주",
    supportedBoards: ["BBS"],
    thumbnail: "/skins/jeju_bbs/preview.png",
    styles: {
      primaryColor: "#ea580c",
      bgColor: "#fffbeb",
      textColor: "#292524",
      headerBg: "#fed7aa",
      borderColor: "#fdba74",
      accentColor: "#f97316",
      fontFamily: "'맑은 고딕', sans-serif",
      borderRadius: "6px",
    },
  },
  {
    id: "nzeo_ver4_bbs",
    name: "Nzeo v4 BBS",
    type: "bbs",
    description: "Nzeo 버전4 BBS 스킨. 모던한 리스트 디자인.",
    author: "Nzeo",
    supportedBoards: ["BBS"],
    thumbnail: "/skins/nzeo_ver4_bbs/preview.png",
    styles: {
      primaryColor: "#0f766e",
      bgColor: "#ffffff",
      textColor: "#1e293b",
      headerBg: "#f0fdfa",
      borderColor: "#99f6e4",
      accentColor: "#14b8a6",
      fontFamily: "'Noto Sans KR', sans-serif",
      borderRadius: "8px",
    },
  },
  {
    id: "zbXE_style_bbs",
    name: "XE 스타일 BBS",
    type: "bbs",
    description: "XpressEngine 스타일의 모던 BBS 스킨. 카테고리/댓글 지원.",
    author: "zbXE",
    supportedBoards: ["BBS"],
    thumbnail: "/skins/zbXE_style_bbs/preview.png",
    styles: {
      primaryColor: "#4f46e5",
      bgColor: "#ffffff",
      textColor: "#374151",
      headerBg: "#eef2ff",
      borderColor: "#c7d2fe",
      accentColor: "#6366f1",
      fontFamily: "'Noto Sans KR', sans-serif",
      borderRadius: "8px",
    },
  },

  // ── 기본 색상 스킨 ──────────────────────────────
  {
    id: "zero_white",
    name: "제로보드 화이트",
    type: "bbs",
    description: "제로보드 기본 화이트 스킨. 가장 기본적인 게시판 디자인.",
    author: "Zeroboard",
    supportedBoards: ["BBS", "DOWNLOAD"],
    thumbnail: "/skins/zero_white/preview.png",
    styles: {
      primaryColor: "#1d4ed8",
      bgColor: "#ffffff",
      textColor: "#111827",
      headerBg: "#f9fafb",
      borderColor: "#d1d5db",
      accentColor: "#2563eb",
      fontFamily: "'돋움', sans-serif",
      borderRadius: "0px",
    },
  },
  {
    id: "zero_cyan",
    name: "제로보드 시안",
    type: "bbs",
    description: "시안 색상 계열의 제로보드 기본 스킨.",
    author: "Zeroboard",
    supportedBoards: ["BBS", "DOWNLOAD"],
    thumbnail: "/skins/zero_cyan/preview.png",
    styles: {
      primaryColor: "#0891b2",
      bgColor: "#ecfeff",
      textColor: "#164e63",
      headerBg: "#cffafe",
      borderColor: "#67e8f9",
      accentColor: "#06b6d4",
      fontFamily: "'돋움', sans-serif",
      borderRadius: "0px",
    },
  },
  {
    id: "zero_lightred",
    name: "제로보드 라이트레드",
    type: "bbs",
    description: "따뜻한 레드 계열의 제로보드 기본 스킨.",
    author: "Zeroboard",
    supportedBoards: ["BBS", "DOWNLOAD"],
    thumbnail: "/skins/zero_lightred/preview.png",
    styles: {
      primaryColor: "#dc2626",
      bgColor: "#fef2f2",
      textColor: "#7f1d1d",
      headerBg: "#fee2e2",
      borderColor: "#fca5a5",
      accentColor: "#ef4444",
      fontFamily: "'돋움', sans-serif",
      borderRadius: "0px",
    },
  },

  // ── 갤러리 스킨 ──────────────────────────────────
  {
    id: "daerew_BASICgallery",
    name: "대류 기본 갤러리",
    type: "gallery",
    description: "기본 이미지 갤러리 스킨. 썸네일 그리드 레이아웃.",
    author: "대류",
    supportedBoards: ["GALLERY"],
    thumbnail: "/skins/daerew_BASICgallery/preview.png",
    styles: {
      primaryColor: "#7c3aed",
      bgColor: "#ffffff",
      textColor: "#1f2937",
      headerBg: "#f5f3ff",
      borderColor: "#ddd6fe",
      accentColor: "#8b5cf6",
      fontFamily: "'맑은 고딕', sans-serif",
      borderRadius: "8px",
    },
  },
  {
    id: "daerew_BASICgallery_GD",
    name: "대류 갤러리 GD",
    type: "gallery",
    description: "GD 라이브러리 기반 자동 썸네일 생성 갤러리 스킨.",
    author: "대류",
    supportedBoards: ["GALLERY"],
    thumbnail: "/skins/daerew_BASICgallery_GD/preview.png",
    styles: {
      primaryColor: "#7c3aed",
      bgColor: "#fafafa",
      textColor: "#1f2937",
      headerBg: "#ede9fe",
      borderColor: "#c4b5fd",
      accentColor: "#a78bfa",
      fontFamily: "'맑은 고딕', sans-serif",
      borderRadius: "12px",
    },
  },

  // ── 음악 스킨 ──────────────────────────────────
  {
    id: "daerew_music",
    name: "대류 뮤직",
    type: "music",
    description: "음악 재생 기능이 포함된 게시판 스킨. 카트/플레이리스트 지원.",
    author: "대류",
    supportedBoards: ["MUSIC"],
    thumbnail: "/skins/daerew_music/preview.png",
    styles: {
      primaryColor: "#9333ea",
      bgColor: "#1a1a2e",
      textColor: "#e2e8f0",
      headerBg: "#16213e",
      borderColor: "#334155",
      accentColor: "#a855f7",
      fontFamily: "'Noto Sans KR', sans-serif",
      borderRadius: "8px",
    },
  },
  {
    id: "dasom_music_white",
    name: "다솜 뮤직 화이트",
    type: "music",
    description: "밝은 배경의 음악 게시판 스킨. 미니 플레이어 내장.",
    author: "다솜",
    supportedBoards: ["MUSIC"],
    thumbnail: "/skins/dasom_music_white/preview.png",
    styles: {
      primaryColor: "#ec4899",
      bgColor: "#ffffff",
      textColor: "#1f2937",
      headerBg: "#fdf2f8",
      borderColor: "#fbcfe8",
      accentColor: "#f472b6",
      fontFamily: "'Noto Sans KR', sans-serif",
      borderRadius: "12px",
    },
  },
  {
    id: "loy_music",
    name: "Loy 뮤직",
    type: "music",
    description: "심플한 음악 게시판 스킨. DB 연동 플레이리스트.",
    author: "Loy",
    supportedBoards: ["MUSIC"],
    thumbnail: "/skins/loy_music/preview.png",
    styles: {
      primaryColor: "#0ea5e9",
      bgColor: "#0f172a",
      textColor: "#cbd5e1",
      headerBg: "#1e293b",
      borderColor: "#475569",
      accentColor: "#38bdf8",
      fontFamily: "'맑은 고딕', sans-serif",
      borderRadius: "6px",
    },
  },

  // ── 투표 스킨 ──────────────────────────────────
  {
    id: "zero_vote",
    name: "제로보드 투표",
    type: "vote",
    description: "설문/투표 기능 게시판 스킨. 결과 그래프 표시.",
    author: "Zeroboard",
    supportedBoards: ["VOTE"],
    thumbnail: "/skins/zero_vote/preview.png",
    styles: {
      primaryColor: "#059669",
      bgColor: "#ffffff",
      textColor: "#1f2937",
      headerBg: "#ecfdf5",
      borderColor: "#6ee7b7",
      accentColor: "#10b981",
      fontFamily: "'돋움', sans-serif",
      borderRadius: "4px",
    },
  },

  // ── 자료실/다운로드 스킨 ──────────────────────────
  {
    id: "nzeo_ver4_download",
    name: "Nzeo v4 다운로드",
    type: "download",
    description: "파일 다운로드 전용 스킨. 확장자 아이콘 및 다운로드 카운터.",
    author: "Nzeo",
    supportedBoards: ["DOWNLOAD"],
    thumbnail: "/skins/nzeo_ver4_download/preview.png",
    styles: {
      primaryColor: "#0d9488",
      bgColor: "#ffffff",
      textColor: "#1e293b",
      headerBg: "#f0fdfa",
      borderColor: "#5eead4",
      accentColor: "#2dd4bf",
      fontFamily: "'Noto Sans KR', sans-serif",
      borderRadius: "8px",
    },
  },

  // ── 웹진/멀티 스킨 ──────────────────────────────
  {
    id: "zbXE_style_web",
    name: "XE 스타일 웹진",
    type: "web",
    description: "XpressEngine 스타일 웹진/블로그 레이아웃 스킨.",
    author: "zbXE",
    supportedBoards: ["BBS", "GALLERY"],
    thumbnail: "/skins/zbXE_style_web/preview.png",
    styles: {
      primaryColor: "#4338ca",
      bgColor: "#ffffff",
      textColor: "#374151",
      headerBg: "#e0e7ff",
      borderColor: "#a5b4fc",
      accentColor: "#6366f1",
      fontFamily: "'Noto Sans KR', sans-serif",
      borderRadius: "12px",
    },
  },
  {
    id: "muti_board",
    name: "멀티 보드",
    type: "multi",
    description: "여러 게시판을 한 페이지에 표시하는 멀티보드 스킨.",
    author: "muti",
    supportedBoards: ["BBS", "GALLERY", "DOWNLOAD"],
    thumbnail: "/skins/muti_board/preview.png",
    styles: {
      primaryColor: "#1d4ed8",
      bgColor: "#f8fafc",
      textColor: "#1e293b",
      headerBg: "#dbeafe",
      borderColor: "#93c5fd",
      accentColor: "#3b82f6",
      fontFamily: "'맑은 고딕', sans-serif",
      borderRadius: "8px",
    },
  },
  {
    id: "happycast_sky",
    name: "해피캐스트 스카이",
    type: "bbs",
    description: "하늘색 계열의 밝고 깔끔한 게시판 스킨.",
    author: "해피캐스트",
    supportedBoards: ["BBS"],
    thumbnail: "/skins/happycast_sky/preview.png",
    styles: {
      primaryColor: "#0284c7",
      bgColor: "#f0f9ff",
      textColor: "#0c4a6e",
      headerBg: "#e0f2fe",
      borderColor: "#7dd3fc",
      accentColor: "#0ea5e9",
      fontFamily: "'맑은 고딕', sans-serif",
      borderRadius: "6px",
    },
  },
];

// ============================================================
// 헬퍼 함수
// ============================================================

/** 스킨 ID로 조회 */
export function getSkinById(skinId: string): SkinConfig | undefined {
  return SKINS.find((s) => s.id === skinId);
}

/** 게시판 타입에 맞는 스킨 필터 */
export function getSkinsForBoardType(boardType: BoardTypeCompat): SkinConfig[] {
  return SKINS.filter((s) => s.supportedBoards.includes(boardType));
}

/** 스킨 유형별 필터 */
export function getSkinsByType(type: SkinType): SkinConfig[] {
  return SKINS.filter((s) => s.type === type);
}

/** 스킨 유형 한글 라벨 */
export function getSkinTypeLabel(type: SkinType): string {
  const labels: Record<SkinType, string> = {
    bbs: "BBS 게시판",
    gallery: "갤러리",
    music: "음악",
    vote: "투표",
    download: "자료실",
    web: "웹진",
    multi: "멀티보드",
  };
  return labels[type] || type;
}
