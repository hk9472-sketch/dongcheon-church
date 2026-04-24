// ============================================================
// 동천교회 홈페이지 - TypeScript 타입 정의
// ============================================================

// 제로보드 호환 게시판 타입
export type BoardType = "BBS" | "GALLERY" | "DOWNLOAD" | "MUSIC" | "VOTE";

// 첨부파일
export interface PostAttachmentItem {
  id: number;
  fileName: string;      // "data/<slug>/<파일>" 형식 상대경로
  origName: string;      // 사용자가 올린 원본 파일명
  sortOrder: number;
  downloadCount: number;
  size: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
}

// 게시글 목록 아이템 (필요한 필드만)
export interface PostListItem {
  id: number;
  subject: string;
  authorName: string;
  hit: number;
  vote: number;
  totalComment: number;
  depth: number;
  isSecret: boolean;
  isNotice: boolean;
  hasAttachment: boolean;        // 📎 표시용 — attachments.length > 0
  firstImageAttachment: PostAttachmentItem | null;  // 갤러리 썸네일용 (이미지인 0번 첨부)
  categoryId: number | null;
  createdAt: Date;
}

// 게시글 상세
export interface PostDetail {
  id: number;
  boardId: number;
  subject: string;
  content: string;
  authorId: number | null;
  authorName: string;
  email: string | null;
  homepage: string | null;
  hit: number;
  vote: number;
  depth: number;
  isSecret: boolean;
  isNotice: boolean;
  useHtml: boolean;
  sitelink1: string | null;
  sitelink2: string | null;
  attachments: PostAttachmentItem[];
  categoryId: number | null;
  prevNo: number;
  nextNo: number;
  headnum: number;
  createdAt: Date;
  comments: CommentItem[];
  prevPost?: { id: number; subject: string } | null;
  nextPost?: { id: number; subject: string } | null;
}

// 댓글
export interface CommentItem {
  id: number;
  authorId: number | null;
  authorName: string;
  content: string;
  createdAt: Date;
}

// 게시판 설정 정보
export interface BoardConfig {
  id: number;
  slug: string;
  title: string;
  boardType: BoardType;
  postsPerPage: number;
  pagesPerBlock: number;
  totalPosts: number;
  useCategory: boolean;
  useComment: boolean;
  useSecret: boolean;
  useReply: boolean;
  useHtml: boolean;
  useFileUpload: boolean;
  useAutolink: boolean;
  useShowIp: boolean;
  maxUploadSize: number;
  grantList: number;
  grantView: number;
  grantWrite: number;
  grantReply: number;
  grantComment: number;
  grantDelete: number;
  grantNotice: number;
  grantViewSecret: number;
  cutLength: number;
  groupId: number;
}

// 카테고리
export interface CategoryItem {
  id: number;
  name: string;
  sortOrder: number;
}

// 페이지 쿼리 파라미터 (URL 검색 파라미터)
export interface BoardQueryParams {
  page?: string;
  category?: string;
  sn?: string;        // search name
  ss?: string;        // search subject
  sc?: string;        // search content
  keyword?: string;
  select_arrange?: string;
  desc?: string;
}
