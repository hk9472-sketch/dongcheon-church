import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { calcPagination, buildSearchWhere, buildOrderBy } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth";
import Pagination from "@/components/board/Pagination";
import SearchBar from "@/components/board/SearchBar";
import BoardListTable from "@/components/board/BoardListTable";

// ============================================================
// 게시판 목록 페이지 (제로보드 zboard.php 대체)
// URL: /board/[boardId]?page=1&keyword=...&sn=on&ss=on&sc=on
// ============================================================

interface PageProps {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

export default async function BoardListPage({ params, searchParams }: PageProps) {
  const { boardId } = await params;
  const query = await searchParams;

  // 갤러리 타입이면 view=list가 없을 때 갤러리 뷰로 리다이렉트
  if (query.view !== "list") {
    const boardCheck = await prisma.board.findUnique({
      where: { slug: boardId },
      select: { boardType: true },
    });
    if (boardCheck?.boardType === "GALLERY") {
      redirect(`/board/${boardId}/gallery`);
    }
  }

  // 1. 게시판 설정 조회 (제로보드: get_table_attrib)
  const board = await prisma.board.findUnique({
    where: { slug: boardId },
    include: {
      categories: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!board) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">
          존재하지 않는 게시판입니다
        </h2>
        <p className="text-sm text-gray-500">
          게시판 ID: {boardId}
        </p>
        <Link href="/" className="mt-4 inline-block text-blue-600 text-sm hover:underline">
          메인으로 돌아가기
        </Link>
      </div>
    );
  }

  // 접근 권한 확인 (grantList)
  const currentUser = await getCurrentUser();
  const userLevel = currentUser?.level ?? 99; // 비회원 = 99
  if (userLevel > board.grantList) {
    if (!currentUser) {
      redirect(`/auth/login?redirect=/board/${boardId}`);
    }
    return (
      <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
        <p className="text-4xl mb-4">🔒</p>
        <h2 className="text-lg font-semibold text-gray-700 mb-2">접근 권한이 없습니다</h2>
        <p className="text-sm text-gray-500">이 게시판은 열람 권한이 있는 회원만 접근할 수 있습니다.</p>
        <Link href="/" className="mt-4 inline-block text-blue-600 text-sm hover:underline">
          메인으로 돌아가기
        </Link>
      </div>
    );
  }

  // 2. 검색/필터 조건 구성 (제로보드 _head.php: sn/ss/sc/keyword)
  const page = Math.max(1, parseInt(query.page || "1", 10) || 1);
  const searchWhere = buildSearchWhere({
    sn: query.sn,
    ss: query.ss,
    sc: query.sc,
    keyword: query.keyword,
    category: query.category ? parseInt(query.category, 10) : undefined,
  });

  const orderBy = buildOrderBy(query.select_arrange, query.desc);

  // 3. 전체 글 수 조회 (공지 제외 — 번호 컬럼/페이지네이션은 일반 글 기준)
  const where = {
    boardId: board.id,
    ...searchWhere,
  };

  const totalPosts = await prisma.post.count({
    where: { ...where, isNotice: false },
  });

  // 4. 페이지네이션 계산
  const paging = calcPagination(totalPosts, page, board.postsPerPage, board.pagesPerBlock);

  // 5. 공지사항 조회 (headnum <= -2000000000)
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const notices = await prisma.post.findMany({
    where: { boardId: board.id, isNotice: true },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      ...(board.useCategory ? { category: { select: { name: true } } } : {}),
      comments: { where: { createdAt: { gte: fiveDaysAgo } }, select: { id: true }, take: 1 },
      _count: { select: { attachments: true } },
    },
  });

  // 6. 일반 게시글 조회
  const posts = await prisma.post.findMany({
    where: { ...where, isNotice: false },
    orderBy,
    skip: paging.skip,
    take: paging.take,
    include: {
      ...(board.useCategory ? { category: { select: { name: true } } } : {}),
      comments: { where: { createdAt: { gte: fiveDaysAgo } }, select: { id: true }, take: 1 },
      _count: { select: { attachments: true } },
    },
  });

  // 7. 쿼리스트링 구성 (페이지네이션 링크용)
  const qsParts: string[] = [];
  if (query.keyword) qsParts.push(`&keyword=${encodeURIComponent(query.keyword)}`);
  if (query.sn) qsParts.push(`&sn=${query.sn}`);
  if (query.ss) qsParts.push(`&ss=${query.ss}`);
  if (query.sc) qsParts.push(`&sc=${query.sc}`);
  if (query.category) qsParts.push(`&category=${query.category}`);
  if (query.select_arrange) qsParts.push(`&select_arrange=${query.select_arrange}`);
  if (query.desc) qsParts.push(`&desc=${query.desc}`);
  const queryString = qsParts.join("");

  // 정렬 토글 (제로보드: $t_desc)
  const toggleDesc = query.desc === "desc" ? "asc" : "desc";

  // 관리자 여부
  const isBoardAdmin = currentUser ? currentUser.isAdmin <= 2 : false;

  // 클라이언트 컴포넌트로 전달할 데이터 직렬화
  const serializePosts = (items: typeof posts) =>
    items.map((p) => ({
      id: p.id,
      subject: p.subject,
      authorName: p.authorName,
      createdAt: p.createdAt.toISOString(),
      hit: p.hit,
      vote: p.vote,
      totalComment: p.totalComment,
      isSecret: p.isSecret,
      isNotice: p.isNotice,
      depth: p.depth,
      hasAttachment: "_count" in p && p._count.attachments > 0,
      categoryName: board.useCategory && "category" in p && p.category
        ? (p.category as { name: string }).name
        : null,
      hasRecentComment: "comments" in p && Array.isArray(p.comments) && p.comments.length > 0,
    }));

  return (
    <div className="space-y-4">
      {/* 게시판 제목 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">{board.title}</h1>
        <span className="text-sm text-gray-500">
          총 <strong className="text-blue-700">{totalPosts}</strong>건
        </span>
      </div>

      {/* 게시판 안내 문구 */}
      <div className="px-4 py-2.5 bg-blue-50/60 border border-blue-100 rounded text-xs text-gray-500 italic leading-relaxed whitespace-pre-line">
        {board.guideText || "예배당처럼 아끼고 서로 조심하셨으면 합니다.\n주로 우리 교인들이 사용하겠지만 혹 손님들이 오시더라도 깨끗한 우리의 모습을 보였으면 좋겠고, 서로의 신앙에 유익이 되도록 했으면 좋겠습니다."}
      </div>

      {/* 카테고리 선택 (제로보드: $a_category) */}
      {board.useCategory && board.categories.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/board/${boardId}`}
            className={`px-3 py-1 rounded ${!query.category ? "bg-blue-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            전체
          </Link>
          {board.categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/board/${boardId}?category=${cat.id}`}
              className={`px-3 py-1 rounded ${query.category === String(cat.id) ? "bg-blue-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {cat.name}
            </Link>
          ))}
        </div>
      )}

      {/* 갤러리 전환 (GALLERY 타입 게시판) */}
      {board.boardType === "GALLERY" && (
        <div className="flex gap-1">
          <span className="px-2.5 py-1 text-xs bg-blue-700 text-white rounded skin-badge">목록</span>
          <Link href={`/board/${boardId}/gallery`} className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 skin-btn-secondary">
            갤러리
          </Link>
        </div>
      )}
      {/* 목록 뷰로 왔을 때 (view=list) 갤러리 전환 버튼은 위에서 이미 표시 */}

      {/* 게시글 테이블 */}
      <BoardListTable
        boardSlug={boardId}
        notices={serializePosts(notices)}
        posts={serializePosts(posts)}
        isAdmin={isBoardAdmin}
        useCategory={board.useCategory}
        cutLength={board.cutLength}
        toggleDesc={toggleDesc}
        currentSort={query.select_arrange || "headnum"}
        currentDesc={query.desc === "asc" ? "asc" : "desc"}
        totalPosts={totalPosts}
        currentPage={paging.currentPage}
        postsPerPage={board.postsPerPage}
        keyword={query.keyword}
      />

      {/* 하단: 페이지네이션 + 검색 + 글쓰기 버튼 */}
      <Pagination
        currentPage={paging.currentPage}
        totalPages={paging.totalPages}
        startPage={paging.startPage}
        endPage={paging.endPage}
        hasPrev={paging.hasPrev}
        hasNext={paging.hasNext}
        baseUrl={`/board/${boardId}`}
        queryString={queryString}
      />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <SearchBar
          boardSlug={boardId}
          currentKeyword={query.keyword}
          currentSn={query.sn}
          currentSs={query.ss}
          currentSc={query.sc}
        />

        <Link
          href={`/board/${boardId}/write`}
          className="px-5 py-2 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 transition-colors whitespace-nowrap skin-btn-primary"
        >
          글쓰기
        </Link>
      </div>
    </div>
  );
}

// 동적 메타데이터
export async function generateMetadata({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const board = await prisma.board.findUnique({ where: { slug: boardId } });
  return {
    title: board ? `${board.title} - 동천교회` : "게시판 - 동천교회",
  };
}
