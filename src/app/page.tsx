import Link from "next/link";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { sanitizeHtml } from "@/lib/sanitize";
import FloppyIcon from "@/components/icons/FloppyIcon";


// 게시판별 아이콘 매핑 (기본값: 📋)
const BOARD_ICONS: Record<string, string> = {
  DcOffice: "🏛️",
  DcCouncil: "👥",
  DcPredictor: "🙏",
  DcBibleStudyX: "📖",
  DcStudy: "🔍",
  DcQuestion: "❓",
  DcPds: "📚",
  PkGallery: "🖼️",
  DcHistory: "📝",
  DcSermon: "🎤",
  DcDic: "📗",
  DcNotice: "📢",
  DcElement: "🏫",
  DcWsRePlay: "🔄",
};

interface RecentPost {
  id: number;
  subject: string;
  createdAt: Date;
  updatedAt: Date;
  isNotice: boolean;
  isSecret: boolean;
  totalComment: number;
  authorName: string;
  depth: number;
  boardSlug?: string;
  boardTitle?: string;
  hasRecentComment?: boolean;
  hasAttachment?: boolean;
}

interface RecentComment {
  id: number;
  content: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
  postId: number;
  post: {
    subject: string;
    board: { slug: string; title: string };
  };
}

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function formatShortDate(date: Date): string {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

interface NoticeDetail {
  id: number;
  subject: string;
  content: string;
  useHtml: boolean;
  authorName: string;
  createdAt: Date;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// H16: 보드별 공지 2 + 일반글 3~5 를 병렬 조회.
// 기존: 보드마다 순차 await × 2쿼리 = N × 2 (예: 11보드 → 22쿼리, 순차 latency)
// 현재: Promise.all 로 (전체 보드 × 2) 쿼리를 전부 병렬 발행 → 네트워크 지연은 1회분만 노출
// (일반글 정렬이 headnum/arrangenum 이라 단일 findMany 로 묶기 어려워 병렬화만 적용)
async function getRecentPostsBatch(
  boardIds: number[],
  rows: number
): Promise<Map<number, RecentPost[]>> {
  const fiveDaysAgoW = new Date(Date.now() - FIVE_DAYS_MS);
  const postSelect = {
    id: true,
    subject: true,
    createdAt: true,
    updatedAt: true,
    isNotice: true,
    isSecret: true,
    totalComment: true,
    authorName: true,
    depth: true,
    comments: { where: { createdAt: { gte: fiveDaysAgoW } }, select: { id: true }, take: 1 },
    _count: { select: { attachments: true } },
  } as const;

  // 모든 보드의 공지 + 일반글 쿼리를 한 번에 병렬 실행
  const results = await Promise.all(
    boardIds.map(async (boardId) => {
      try {
        const [notices, posts] = await Promise.all([
          prisma.post.findMany({
            where: { boardId, isNotice: true },
            orderBy: { createdAt: "desc" },
            take: 2,
            select: postSelect,
          }),
          prisma.post.findMany({
            where: { boardId, isNotice: false },
            orderBy: [{ headnum: "asc" }, { arrangenum: "asc" }],
            take: rows,
            select: postSelect,
          }),
        ]);
        // 공지가 2개 미만이면 일반글을 더 채워 총 rows 개 유지.
        const combined: RecentPost[] = [
          ...notices.slice(0, Math.min(notices.length, rows)),
          ...posts.slice(0, Math.max(0, rows - notices.length)),
        ].map(({ comments, _count, ...rest }) => ({
          ...rest,
          hasRecentComment: comments.length > 0,
          hasAttachment: _count.attachments > 0,
        }));
        return [boardId, combined] as const;
      } catch {
        return [boardId, [] as RecentPost[]] as const;
      }
    })
  );

  return new Map(results);
}

async function getLatestNotice(): Promise<NoticeDetail | null> {
  try {
    const board = await prisma.board.findUnique({
      where: { slug: "DcNotice" },
      select: { id: true },
    });
    if (!board) return null;

    // "일반" 카테고리가 있으면 해당 카테고리만 필터
    const category = await prisma.category.findFirst({
      where: { boardId: board.id, name: "일반" },
    });

    const post = await prisma.post.findFirst({
      where: {
        boardId: board.id,
        ...(category ? { categoryId: category.id } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, subject: true, content: true, useHtml: true, authorName: true, createdAt: true },
    });
    return post;
  } catch {
    return null;
  }
}

// 표어 카테고리 최신 글 (헤더용 — layout에서 prop 전달 불가하므로 API로 분리)
async function getLatestMotto(): Promise<string | null> {
  try {
    const board = await prisma.board.findUnique({
      where: { slug: "DcNotice" },
      select: { id: true },
    });
    if (!board) return null;

    const category = await prisma.category.findFirst({
      where: { boardId: board.id, name: "표어" },
    });
    if (!category) return null;

    const post = await prisma.post.findFirst({
      where: { boardId: board.id, categoryId: category.id },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });
    return post?.content || null;
  } catch {
    return null;
  }
}

async function getRecentNewPosts(rows: number): Promise<RecentPost[]> {
  try {
    const fiveDaysAgo = new Date(Date.now() - FIVE_DAYS_MS);
    const posts = await prisma.post.findMany({
      where: {
        OR: [
          { createdAt: { gte: fiveDaysAgo } },
          { updatedAt: { gte: fiveDaysAgo } },
          { comments: { some: { createdAt: { gte: fiveDaysAgo } } } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: rows,
      select: {
        id: true, subject: true, createdAt: true, updatedAt: true,
        isNotice: true, isSecret: true, totalComment: true, authorName: true, depth: true,
        board: { select: { slug: true, title: true } },
        comments: {
          where: { createdAt: { gte: fiveDaysAgo } },
          select: { id: true },
          take: 1,
        },
        _count: { select: { attachments: true } },
      },
    });
    return posts.map((p) => ({
      ...p,
      boardSlug: p.board.slug,
      boardTitle: p.board.title,
      hasRecentComment: p.comments.length > 0,
      hasAttachment: p._count.attachments > 0,
    }));
  } catch {
    return [];
  }
}

async function getRecentComments(rows: number): Promise<RecentComment[]> {
  try {
    const fiveDaysAgo = new Date(Date.now() - FIVE_DAYS_MS);
    return await prisma.comment.findMany({
      where: {
        OR: [
          { createdAt: { gte: fiveDaysAgo } },
          { updatedAt: { gte: fiveDaysAgo } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: rows,
      select: {
        id: true, content: true, authorName: true, createdAt: true, updatedAt: true, postId: true,
        post: { select: { subject: true, board: { select: { slug: true, title: true } } } },
      },
    });
  } catch {
    return [];
  }
}

// 메인 페이지 위젯 배열 순서 (3열 × 4행, 균등 폭)
// Row 1: 행정실, 공지사항, 주교/중간반
// Row 2: 심방, 자료실(설교재독), 문답방
// Row 3: 연경실, 연구실, 새글/수정글
// Row 4: 성경단어연구, 권찰회, 새댓글
const GRID_LAYOUT: [string, string, string][] = [
  ["DcOffice", "__NOTICE__", "DcElement"],                // Row 1
  ["DcPredictor", "DcPds", "DcQuestion"],                 // Row 2
  ["DcBibleStudyX", "DcStudy", "__RECENT_POSTS__"],       // Row 3
  ["DcCouncil", "PkGallery", "__RECENT_COMMENTS__"],      // Row 4
];

// 위젯 표시명 오버라이드 (DB title 대신 사용)
const TITLE_OVERRIDE: Record<string, string> = {
  DcElement: "주교/중간반",
  DcPds: "자료실",
  DcCouncil: "권찰회",
  DcBibleStudyX: "연경실",
};

export default async function HomePage() {
  // 로그인 여부 확인 (requireLogin 게시판 필터용)
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("dc_session")?.value;
  let isLoggedIn = false;
  if (sessionToken) {
    const session = await prisma.session.findUnique({ where: { sessionToken }, select: { expires: true } });
    isLoggedIn = !!session && session.expires > new Date();
  }

  // 위젯 레이아웃 설정 (관리자가 /admin/settings 에서 변경 가능)
  const rowsRow = await prisma.siteSetting.findUnique({ where: { key: "skin_widget_rows" } });
  const widgetRows = (() => {
    const n = parseInt(rowsRow?.value || "5", 10);
    return Number.isFinite(n) && n >= 3 && n <= 10 ? n : 5;
  })();

  // DB에서 메인 노출 게시판 조회
  const mainBoards = await prisma.board.findMany({
    where: { showOnMain: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, slug: true, title: true, requireLogin: true },
  });

  // slug → board 매핑
  const boardMap = new Map(mainBoards.map((b) => [b.slug, b]));

  // 그리드에 사용할 게시판 slug 목록 (로그인 필터 적용)
  const specialSlugs = ["__NOTICE__", "__RECENT_POSTS__", "__RECENT_COMMENTS__"];
  const gridSlugs = GRID_LAYOUT.flat().filter((s) => !specialSlugs.includes(s));
  const visibleSlugs = gridSlugs.filter((slug) => {
    const b = boardMap.get(slug);
    return b && (!b.requireLogin || isLoggedIn);
  });

  // H16: 보드별 최근글 조회를 배치(병렬)로 묶어 N+1 완화.
  //   - 이전: 11 보드 × 2 쿼리 = 22쿼리가 중첩 await 체인으로 순차 발행
  //   - 현재: 전체 보드의 공지/일반글 쿼리를 Promise.all 로 동시 발행
  //     (쿼리 개수는 22로 동일하지만 네트워크 latency 는 병렬로 겹쳐 실질 1회분만 노출)
  //   - 정렬(headnum/arrangenum) 때문에 단일 findMany 통합은 불가.
  const visibleBoardIds = visibleSlugs.map((slug) => boardMap.get(slug)!.id);
  const [postsByBoard, latestNotice, recentNewPosts, recentComments] = await Promise.all([
    getRecentPostsBatch(visibleBoardIds, widgetRows),
    getLatestNotice(),
    getRecentNewPosts(widgetRows),
    getRecentComments(widgetRows),
  ]);

  const boardPostsArr = visibleSlugs.map((slug) => {
    const b = boardMap.get(slug)!;
    return {
      slug,
      title: TITLE_OVERRIDE[slug] || b.title,
      icon: BOARD_ICONS[slug] || "📋",
      posts: postsByBoard.get(b.id) ?? [],
    };
  });

  // slug → board data
  const boardDataMap = new Map(boardPostsArr.map((b) => [b.slug, b]));

  // [TipTap 글자크기 반영] HTML 원본 렌더링 — 이관 글(useHtml=false)은 개행을 <br>로 변환 + XSS sanitize
  const noticeContentHtml = latestNotice
    ? sanitizeHtml(
        latestNotice.useHtml
          ? latestNotice.content
          : latestNotice.content.replace(/\n/g, "<br>")
      )
    : "";

  return (
    <div className="space-y-2 sm:space-y-2.5">
      {/* ===== 모바일: 공지사항 최상단 ===== */}
      <div className="lg:hidden">
        <NoticeWidget latestNotice={latestNotice} noticeContentHtml={noticeContentHtml} />
      </div>

      {/* ===== 데스크톱: 3열 균등 Grid (위젯 높이는 rows × row-height 로 자연 결정) ===== */}
      <div
        className="hidden lg:grid grid-cols-3 auto-rows-min"
        style={{ gap: "var(--skin-widget-gap, 8px)" }}
      >
        {/* Row 1: 행정실, 공지사항, 주교/중간반 */}
        {boardDataMap.has("DcOffice") && <BoardWidget board={boardDataMap.get("DcOffice")!} rows={widgetRows} />}
        <NoticeWidget latestNotice={latestNotice} noticeContentHtml={noticeContentHtml} />
        {boardDataMap.has("DcElement") && <BoardWidget board={boardDataMap.get("DcElement")!} rows={widgetRows} />}

        {/* Row 2: 심방, 자료실(설교재독), 문답방 */}
        {boardDataMap.has("DcPredictor") && <BoardWidget board={boardDataMap.get("DcPredictor")!} rows={widgetRows} />}
        {boardDataMap.has("DcPds") && <BoardWidget board={boardDataMap.get("DcPds")!} rows={widgetRows} />}
        {boardDataMap.has("DcQuestion") && <BoardWidget board={boardDataMap.get("DcQuestion")!} rows={widgetRows} />}

        {/* Row 3: 연경실, 연구실, 새글/수정글 */}
        {boardDataMap.has("DcBibleStudyX") && <BoardWidget board={boardDataMap.get("DcBibleStudyX")!} rows={widgetRows} />}
        {boardDataMap.has("DcStudy") && <BoardWidget board={boardDataMap.get("DcStudy")!} rows={widgetRows} />}
        <RecentPostsWidget posts={recentNewPosts} rows={widgetRows} />

        {/* Row 4: 권찰회(성경읽기), 사진자료실, 새댓글 */}
        {boardDataMap.has("DcCouncil") && <BoardWidget board={boardDataMap.get("DcCouncil")!} rows={widgetRows} />}
        {boardDataMap.has("PkGallery") && <BoardWidget board={boardDataMap.get("PkGallery")!} rows={widgetRows} />}
        <RecentCommentsWidget comments={recentComments} rows={widgetRows} />
      </div>

      {/* ===== 모바일/태블릿: 공지사항 → 게시판 → 새글/새댓글 ===== */}
      <div
        className="lg:hidden grid grid-cols-1 sm:grid-cols-2"
        style={{ gap: "var(--skin-widget-gap, 8px)" }}
      >
        {GRID_LAYOUT.flat()
          .filter((s) => !specialSlugs.includes(s) && boardDataMap.has(s))
          .map((slug) => <BoardWidget key={slug} board={boardDataMap.get(slug)!} rows={widgetRows} />)
        }
        <RecentPostsWidget posts={recentNewPosts} rows={widgetRows} />
        <RecentCommentsWidget comments={recentComments} rows={widgetRows} />
      </div>
    </div>
  );
}

/* 공지사항 위젯 — 인접 위젯과 높이 맞추려 row-height × rows + 헤더분 만큼 min-height */
function NoticeWidget({ latestNotice, noticeContentHtml }: { latestNotice: NoticeDetail | null; noticeContentHtml: string }) {
  return (
    <div
      className="bg-white overflow-hidden rounded-lg shadow-sm flex flex-col"
      style={{
        border: "var(--skin-widget-border-width) solid var(--skin-widget-border-color)",
        minHeight: "calc(var(--skin-widget-row-height, 1.75rem) * var(--skin-widget-rows, 5) + 2rem)",
      }}
    >
      {latestNotice ? (
        <div className="p-2 sm:p-3 flex flex-col flex-1">
          <h3 className="font-bold text-gray-800 truncate mb-1 text-sm sm:text-base flex-shrink-0 text-center">
            {latestNotice.subject}
          </h3>
          <div className="text-xs sm:text-sm font-bold text-blue-800 leading-relaxed prose prose-sm max-w-none [&_*]:text-blue-800 overflow-auto flex-1 flex items-center justify-center">
            <div className="text-left w-fit" dangerouslySetInnerHTML={{ __html: noticeContentHtml || "<p>(내용 없음)</p>" }} />
          </div>
        </div>
      ) : (
        <div className="p-4 text-center text-sm text-gray-400 h-full flex items-center justify-center">
          등록된 공지가 없습니다.
        </div>
      )}
    </div>
  );
}

/* 게시판 위젯 컴포넌트 — rows 수만큼 줄 확보, 각 줄은 --skin-widget-row-height 고정 */
function BoardWidget({ board, rows }: {
  board: {
    slug: string;
    title: string;
    icon: string;
    posts: RecentPost[];
  };
  rows: number;
}) {
  const slots = Array.from({ length: rows }, (_, i) => board.posts[i] ?? null);

  return (
    <div
      className="bg-white rounded-lg shadow-sm overflow-hidden flex flex-col"
      style={{ border: "var(--skin-widget-border-width) solid var(--skin-widget-border-color)" }}
    >
      <div
        className="flex items-center justify-between px-2.5 sm:px-3 flex-shrink-0"
        style={{
          backgroundColor: "var(--skin-widget-header-bg)",
          borderBottom: "var(--skin-widget-divider-width) solid var(--skin-widget-divider-color)",
          padding: "var(--skin-widget-header-padding, 2px 0)",
          paddingLeft: "0.625rem",
          paddingRight: "0.75rem",
        }}
      >
        <Link
          href={`/board/${board.slug}`}
          className="flex items-center gap-0.5 hover:opacity-80 transition-opacity"
          style={{ fontFamily: "var(--skin-widget-name-font)", fontSize: "var(--skin-widget-name-size)", color: "var(--skin-widget-name-color)", fontWeight: "var(--skin-widget-name-weight)" as never, textDecoration: "var(--skin-widget-name-decoration)" as never, fontStyle: "var(--skin-widget-name-style)" as never }}
        >
          <span className="flex-shrink-0 text-[11px] leading-none" style={{ color: "var(--theme-nav-from)" }}>▶</span>
          <span>{board.title}</span>
        </Link>
        <Link
          href={`/board/${board.slug}`}
          className="hover:opacity-80 transition-opacity"
          style={{ fontFamily: "var(--skin-widget-more-font)", fontSize: "var(--skin-widget-more-size)", color: "var(--skin-widget-more-color)", fontWeight: "var(--skin-widget-more-weight)" as never, textDecoration: "var(--skin-widget-more-decoration)" as never, fontStyle: "var(--skin-widget-more-style)" as never }}
        >
          더보기 &rsaquo;
        </Link>
      </div>
      <ul className="flex flex-col">
        {slots.map((post, i) => (
          <li
            key={post?.id ?? `empty-${i}`}
            className="border-b border-gray-100 last:border-b-0 flex items-center"
            style={{ height: "var(--skin-widget-row-height, 1.75rem)" }}
          >
            {post ? (
              <Link
                href={`/board/${board.slug}/${post.id}`}
                className="flex items-center px-2.5 sm:px-3 hover:bg-gray-50 transition-colors group w-full"
              >
                <span
                  className="flex-shrink-0 mr-1.5 sm:mr-2 font-mono"
                  style={{ fontFamily: "var(--skin-widget-date-font)", fontSize: "var(--skin-widget-date-size)", color: "var(--skin-widget-date-color)", fontWeight: "var(--skin-widget-date-weight)" as never, textDecoration: "var(--skin-widget-date-decoration)" as never, fontStyle: "var(--skin-widget-date-style)" as never }}
                >
                  {formatShortDate(post.createdAt)}
                </span>
                <span
                  className="group-hover:opacity-80 truncate flex-1 mr-1 sm:mr-2"
                  style={{ fontFamily: "var(--skin-widget-post-font)", fontSize: "var(--skin-widget-post-size)", color: "var(--skin-widget-post-color)", fontWeight: "var(--skin-widget-post-weight)" as never, textDecoration: "var(--skin-widget-post-decoration)" as never, fontStyle: "var(--skin-widget-post-style)" as never }}
                >
                  {post.depth > 0 && (
                    <span className="text-gray-400 text-[10px] sm:text-xs mr-0.5">└</span>
                  )}
                  {post.isNotice && (
                    <span className="inline-block text-[10px] sm:text-xs text-blue-600 font-bold mr-1 sm:mr-1.5">[공지]</span>
                  )}
                  {post.isSecret && (
                    <span className="inline-block text-[10px] sm:text-xs mr-0.5 align-middle" title="비밀글">🔒</span>
                  )}
                  {post.subject}
                  {post.hasAttachment && <FloppyIcon className="ml-1 w-4 h-4 text-blue-600" />}
                  {" "}
                  <span
                    style={{ fontFamily: "var(--skin-widget-author-font)", fontSize: "var(--skin-widget-author-size)", color: "var(--skin-widget-author-color)", fontWeight: "var(--skin-widget-author-weight)" as never, textDecoration: "var(--skin-widget-author-decoration)" as never, fontStyle: "var(--skin-widget-author-style)" as never }}
                  >
                    [{post.authorName}]
                  </span>
                  <PostBadge createdAt={post.createdAt} updatedAt={post.updatedAt} />
                  {post.totalComment > 0 && (
                    <span className="inline-block ml-1 text-[10px] sm:text-xs text-red-500 font-bold align-middle">
                      [{post.totalComment}]
                    </span>
                  )}
                  {post.hasRecentComment && (
                    <span className="text-red-500 text-[10px] ml-0.5 font-bold">[c]</span>
                  )}
                </span>
              </Link>
            ) : (
              <div className="px-2.5 sm:px-3 w-full">&nbsp;</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* New / Update 뱃지 */
function PostBadge({ createdAt, updatedAt }: { createdAt: Date; updatedAt: Date }) {
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  const isUpdated = updated - created > 60000; // 작성 후 1분 이상 차이나면 수정된 글
  const isNew = now - created < FIVE_DAYS_MS;
  const isRecentUpdate = isUpdated && now - updated < FIVE_DAYS_MS;

  if (isRecentUpdate) {
    return (
      <span className="inline-block ml-1.5 px-1 py-0.5 text-[10px] font-bold leading-none text-orange-600 bg-orange-100 rounded align-middle">
        U
      </span>
    );
  }
  if (isNew) {
    return (
      <span className="inline-block ml-1.5 px-1 py-0.5 text-[10px] font-bold leading-none text-red-600 bg-red-100 rounded align-middle">
        N
      </span>
    );
  }
  return null;
}

/* 새글/수정글 위젯 */
function RecentPostsWidget({ posts, rows }: { posts: RecentPost[]; rows: number }) {
  return (
    <div
      className="bg-white rounded-lg shadow-sm overflow-hidden flex flex-col"
      style={{ border: "var(--skin-widget-border-width) solid var(--skin-widget-border-color)" }}
    >
      <div
        className="flex items-center px-2.5 sm:px-3 flex-shrink-0"
        style={{
          backgroundColor: "var(--skin-widget-header-bg)",
          borderBottom: "var(--skin-widget-divider-width) solid var(--skin-widget-divider-color)",
          padding: "var(--skin-widget-header-padding, 2px 0)",
          paddingLeft: "0.625rem",
          paddingRight: "0.75rem",
        }}
      >
        <Link
          href="/board/recent-posts"
          className="flex items-center gap-0.5 hover:opacity-80 transition-opacity"
          style={{ fontFamily: "var(--skin-widget-name-font)", fontSize: "var(--skin-widget-name-size)", color: "var(--skin-widget-name-color)", fontWeight: "var(--skin-widget-name-weight)" as never }}
        >
          <span className="flex-shrink-0 text-[11px] leading-none" style={{ color: "var(--theme-nav-from)" }}>▶</span>
          <span>새글/수정글</span>
        </Link>
      </div>
      <ul className="flex flex-col">
        {Array.from({ length: rows }, (_, i) => posts[i] ?? null).map((post, i) => (
          <li
            key={post?.id ?? `empty-post-${i}`}
            className="border-b border-gray-100 last:border-b-0 flex items-center"
            style={{ height: "var(--skin-widget-row-height, 1.75rem)" }}
          >
            {post ? (
              <Link
                href={`/board/${post.boardSlug}/${post.id}`}
                className="flex items-center px-2.5 sm:px-3 hover:bg-gray-50 transition-colors group w-full"
              >
                <span
                  className="flex-shrink-0 mr-1.5 sm:mr-2 font-mono"
                  style={{ fontFamily: "var(--skin-widget-date-font)", fontSize: "var(--skin-widget-date-size)", color: "var(--skin-widget-date-color)", fontWeight: "var(--skin-widget-date-weight)" as never }}
                >
                  {formatShortDate(post.updatedAt)}
                </span>
                <span
                  className="group-hover:opacity-80 truncate flex-1 mr-1 sm:mr-2"
                  style={{ fontFamily: "var(--skin-widget-post-font)", fontSize: "var(--skin-widget-post-size)", color: "var(--skin-widget-post-color)", fontWeight: "var(--skin-widget-post-weight)" as never }}
                >
                  {post.depth > 0 && (
                    <span className="text-gray-400 text-[10px] sm:text-xs mr-0.5">└</span>
                  )}
                  {post.isSecret && <span className="text-[10px] sm:text-xs mr-0.5 align-middle" title="비밀글">🔒</span>}
                  {post.subject}
                  {post.hasAttachment && <FloppyIcon className="ml-1 w-4 h-4 text-blue-600" />}
                  {post.hasRecentComment && (
                    <span className="text-red-500 text-[10px] ml-0.5 font-bold">[c]</span>
                  )}
                  {" "}
                  <span style={{ fontFamily: "var(--skin-widget-author-font)", fontSize: "var(--skin-widget-author-size)", color: "var(--skin-widget-author-color)", fontWeight: "var(--skin-widget-author-weight)" as never }}>
                    [{post.authorName}]
                  </span>
                  <PostBadge createdAt={post.createdAt} updatedAt={post.updatedAt} />
                </span>
              </Link>
            ) : (
              <div className="px-2.5 sm:px-3 w-full">&nbsp;</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* 새댓글 위젯 */
function RecentCommentsWidget({ comments, rows }: { comments: RecentComment[]; rows: number }) {
  return (
    <div
      className="bg-white rounded-lg shadow-sm overflow-hidden flex flex-col"
      style={{ border: "var(--skin-widget-border-width) solid var(--skin-widget-border-color)" }}
    >
      <div
        className="flex items-center px-2.5 sm:px-3 flex-shrink-0"
        style={{
          backgroundColor: "var(--skin-widget-header-bg)",
          borderBottom: "var(--skin-widget-divider-width) solid var(--skin-widget-divider-color)",
          padding: "var(--skin-widget-header-padding, 2px 0)",
          paddingLeft: "0.625rem",
          paddingRight: "0.75rem",
        }}
      >
        <Link
          href="/board/recent-comments"
          className="flex items-center gap-0.5 hover:opacity-80 transition-opacity"
          style={{ fontFamily: "var(--skin-widget-name-font)", fontSize: "var(--skin-widget-name-size)", color: "var(--skin-widget-name-color)", fontWeight: "var(--skin-widget-name-weight)" as never }}
        >
          <span className="flex-shrink-0 text-[11px] leading-none" style={{ color: "var(--theme-nav-from)" }}>▶</span>
          <span>새댓글</span>
        </Link>
      </div>
      <ul className="flex flex-col">
        {Array.from({ length: rows }, (_, i) => comments[i] ?? null).map((comment, i) => (
          <li
            key={comment?.id ?? `empty-comment-${i}`}
            className="border-b border-gray-100 last:border-b-0 flex items-center"
            style={{ height: "var(--skin-widget-row-height, 1.75rem)" }}
          >
            {comment ? (
              <Link
                href={`/board/${comment.post.board.slug}/${comment.postId}`}
                className="flex items-center px-2.5 sm:px-3 hover:bg-gray-50 transition-colors group w-full"
              >
                <span
                  className="flex-shrink-0 mr-1.5 sm:mr-2 font-mono"
                  style={{ fontFamily: "var(--skin-widget-date-font)", fontSize: "var(--skin-widget-date-size)", color: "var(--skin-widget-date-color)", fontWeight: "var(--skin-widget-date-weight)" as never }}
                >
                  {formatShortDate(comment.updatedAt)}
                </span>
                <span
                  className="group-hover:opacity-80 truncate flex-1 mr-1 sm:mr-2"
                  style={{ fontFamily: "var(--skin-widget-post-font)", fontSize: "var(--skin-widget-post-size)", color: "var(--skin-widget-post-color)", fontWeight: "var(--skin-widget-post-weight)" as never }}
                >
                  {comment.content.replace(/<[^>]*>/g, "").substring(0, 50)}
                  {" "}
                  <span style={{ fontFamily: "var(--skin-widget-author-font)", fontSize: "var(--skin-widget-author-size)", color: "var(--skin-widget-author-color)", fontWeight: "var(--skin-widget-author-weight)" as never }}>
                    [{comment.authorName}]
                  </span>
                  <PostBadge createdAt={comment.createdAt} updatedAt={comment.updatedAt} />
                </span>
              </Link>
            ) : (
              <div className="px-2.5 sm:px-3 w-full">&nbsp;</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
