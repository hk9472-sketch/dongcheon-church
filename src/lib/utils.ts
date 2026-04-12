// ============================================================
// 유틸리티 함수 (제로보드 lib.php 주요 함수 매핑)
// ============================================================

/**
 * 날짜 포맷팅
 * 제로보드는 Unix timestamp (int 13) 사용
 */
export function formatDate(date: Date | number | null): string {
  if (!date) return "";

  const d = typeof date === "number" ? new Date(date * 1000) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  // 오늘이면 시:분, 아니면 년-월-일
  const today = new Date();
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    const hour = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${hour}:${min}`;
  }

  return `${year}-${month}-${day}`;
}

/**
 * 파일 크기 포맷팅
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * 제목 자르기
 * 제로보드의 cut_length 설정에 해당
 */
export function truncateSubject(
  subject: string,
  maxLength: number
): string {
  if (maxLength <= 0 || subject.length <= maxLength) return subject;
  return subject.substring(0, maxLength) + "...";
}

/**
 * 답글 깊이에 따른 들여쓰기 생성
 * 제로보드 스킨에서 depth에 따라 Re: 아이콘이나 공백 삽입
 */
export function getDepthPrefix(depth: number): string {
  if (depth === 0) return "";
  return "└ " + "".padStart((depth - 1) * 2, " ");
}

/**
 * XSS 방지 - HTML 이스케이프
 * 제로보드의 del_html() 함수에 해당
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * 자동 링크 변환
 * 제로보드의 use_autolink 설정에 해당
 */
export function autoLink(text: string): string {
  const urlRegex =
    /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  return text.replace(
    urlRegex,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

/**
 * 게시글 번호 계산 (가상 번호)
 * total - (page - 1) * perPage 에서 시작하여 감소
 */
export function calcVirtualNo(
  total: number,
  page: number,
  perPage: number,
  index: number
): number {
  return total - (page - 1) * perPage - index;
}

/**
 * 페이지네이션 계산
 */
export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startPage: number;
  endPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  skip: number;
  take: number;
}

export function calcPagination(
  total: number,
  page: number,
  perPage: number,
  pagesPerBlock: number = 8
): PaginationInfo {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startPage =
    Math.floor((currentPage - 1) / pagesPerBlock) * pagesPerBlock + 1;
  const endPage = Math.min(startPage + pagesPerBlock - 1, totalPages);

  return {
    currentPage,
    totalPages,
    totalItems: total,
    startPage,
    endPage,
    hasPrev: startPage > 1,
    hasNext: endPage < totalPages,
    skip: (currentPage - 1) * perPage,
    take: perPage,
  };
}

/**
 * 검색 조건 생성
 * 제로보드의 sn/ss/sc (이름/제목/내용) 검색 로직 매핑
 */
export interface SearchParams {
  sn?: string; // search name (on/off)
  ss?: string; // search subject (on/off)
  sc?: string; // search content (on/off)
  keyword?: string;
  category?: number;
}

export function buildSearchWhere(params: SearchParams) {
  const conditions: Record<string, unknown>[] = [];

  if (params.keyword) {
    const searchOr: Record<string, unknown>[] = [];

    if (params.sn === "on") {
      searchOr.push({ authorName: { contains: params.keyword } });
    }
    if (params.ss !== "off") {
      // 기본값: 제목 검색 활성화
      searchOr.push({ subject: { contains: params.keyword } });
    }
    if (params.sc !== "off") {
      // 기본값: 내용 검색 활성화
      searchOr.push({ content: { contains: params.keyword } });
    }

    if (searchOr.length > 0) {
      conditions.push({ OR: searchOr });
    }
  }

  if (params.category) {
    conditions.push({ categoryId: params.category });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

/**
 * 정렬 조건 생성
 * 제로보드의 select_arrange, desc 파라미터 매핑
 */
export function buildOrderBy(
  selectArrange?: string,
  desc?: string
): Record<string, "asc" | "desc">[] {
  const direction: "asc" | "desc" = desc === "desc" ? "desc" : "asc";

  switch (selectArrange) {
    case "subject":
      return [{ subject: direction }];
    case "name":
      return [{ authorName: direction }];
    case "hit":
      return [{ hit: direction }];
    case "vote":
      return [{ vote: direction }];
    case "reg_date":
      return [{ createdAt: direction }];
    case "download1":
      return [{ download1: direction }];
    case "download2":
      return [{ download2: direction }];
    case "headnum":
    default:
      // 기본 정렬: headnum asc (작을수록 최신), arrangenum asc
      return [{ headnum: "asc" }, { arrangenum: "asc" }];
  }
}

/**
 * 확장자 체크
 * 제로보드의 pds_ext1, pds_ext2 허용 확장자 체크
 */
export function isAllowedExtension(
  filename: string,
  allowedExts: string
): boolean {
  if (!allowedExts) return true;
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const allowed = allowedExts
    .split(",")
    .map((e) => e.trim().toLowerCase());
  return allowed.includes(ext);
}
