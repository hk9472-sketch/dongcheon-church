import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { sanitizeHtml } from "@/lib/sanitize";
import WidgetSlot, { WidgetTab } from "@/components/widgets/WidgetSlot";
import {
  BoardBody,
  NoticeBody,
  RecentPostsBody,
  RecentCommentsBody,
  type RecentPost,
  type RecentComment,
  type NoticeDetail,
} from "@/components/widgets/WidgetBodies";
import {
  parseLayout,
  isSpecial,
  SPECIAL_LABELS,
  collectKeys,
  type WidgetLayout,
} from "@/lib/widgetLayout";

// 게시판별 아이콘 (기본값: 📋)
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

// 위젯 표시명 오버라이드 (DB title 대신 사용)
const TITLE_OVERRIDE: Record<string, string> = {
  DcElement: "주교/중간반",
  DcPds: "자료실",
  DcCouncil: "권찰회",
  DcBibleStudyX: "연경실",
};

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

async function getRecentPostsBatch(
  boardIds: number[],
  rows: number,
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
    comments: {
      where: { createdAt: { gte: fiveDaysAgoW } },
      select: { id: true },
      take: 1,
    },
    _count: { select: { attachments: true } },
  } as const;

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
    }),
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
    const category = await prisma.category.findFirst({
      where: { boardId: board.id, name: "일반" },
    });
    return await prisma.post.findFirst({
      where: {
        boardId: board.id,
        ...(category ? { categoryId: category.id } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        subject: true,
        content: true,
        useHtml: true,
        authorName: true,
        createdAt: true,
      },
    });
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
        id: true,
        subject: true,
        createdAt: true,
        updatedAt: true,
        isNotice: true,
        isSecret: true,
        totalComment: true,
        authorName: true,
        depth: true,
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
        id: true,
        content: true,
        authorName: true,
        createdAt: true,
        updatedAt: true,
        postId: true,
        post: {
          select: {
            subject: true,
            board: { select: { slug: true, title: true } },
          },
        },
      },
    });
  } catch {
    return [];
  }
}

export default async function HomePage() {
  // 로그인 여부 확인
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("dc_session")?.value;
  let isLoggedIn = false;
  if (sessionToken) {
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      select: { expires: true },
    });
    isLoggedIn = !!session && session.expires > new Date();
  }

  // 위젯 줄 수
  const rowsRow = await prisma.siteSetting.findUnique({
    where: { key: "skin_widget_rows" },
  });
  const widgetRows = (() => {
    const n = parseInt(rowsRow?.value || "5", 10);
    return Number.isFinite(n) && n >= 3 && n <= 10 ? n : 5;
  })();

  // 레이아웃 (DB 에서 읽고, 없으면 기본값)
  const layoutRow = await prisma.siteSetting.findUnique({
    where: { key: "widget_layout" },
  });
  const layout: WidgetLayout = parseLayout(layoutRow?.value);

  // 레이아웃에 사용된 모든 보드 slug (특수 키 제외)
  const allKeys = collectKeys(layout);
  const boardSlugs = allKeys.filter((k) => !isSpecial(k));

  // 게시판 메타 조회
  const boards = await prisma.board.findMany({
    where: { slug: { in: boardSlugs } },
    select: { id: true, slug: true, title: true, requireLogin: true },
  });
  const boardMap = new Map(boards.map((b) => [b.slug, b]));

  // 보이는 보드 (로그인 필터)
  const visibleBoardIds = boards
    .filter((b) => !b.requireLogin || isLoggedIn)
    .map((b) => b.id);

  // 데이터 페치
  const [postsByBoard, latestNotice, recentNewPosts, recentComments] = await Promise.all([
    getRecentPostsBatch(visibleBoardIds, widgetRows),
    allKeys.includes("__NOTICE__") ? getLatestNotice() : Promise.resolve(null),
    allKeys.includes("__RECENT_POSTS__") ? getRecentNewPosts(widgetRows) : Promise.resolve([]),
    allKeys.includes("__RECENT_COMMENTS__")
      ? getRecentComments(widgetRows)
      : Promise.resolve([]),
  ]);

  const noticeContentHtml = latestNotice
    ? sanitizeHtml(
        latestNotice.useHtml
          ? latestNotice.content
          : latestNotice.content.replace(/\n/g, "<br>"),
      )
    : "";

  /** 키 → 위젯 탭 정보 (단일 키). 권한 없으면 null. */
  function buildTab(key: string): WidgetTab | null {
    if (key === "__NOTICE__") {
      return {
        key,
        title: SPECIAL_LABELS.__NOTICE__,
        href: "/board/DcNotice",
        body: (
          <NoticeBody latestNotice={latestNotice} noticeContentHtml={noticeContentHtml} />
        ),
      };
    }
    if (key === "__RECENT_POSTS__") {
      return {
        key,
        title: SPECIAL_LABELS.__RECENT_POSTS__,
        href: "/board/recent-posts",
        body: <RecentPostsBody posts={recentNewPosts} rows={widgetRows} />,
      };
    }
    if (key === "__RECENT_COMMENTS__") {
      return {
        key,
        title: SPECIAL_LABELS.__RECENT_COMMENTS__,
        href: "/board/recent-comments",
        body: <RecentCommentsBody comments={recentComments} rows={widgetRows} />,
      };
    }
    // 게시판
    const b = boardMap.get(key);
    if (!b) return null;
    if (b.requireLogin && !isLoggedIn) return null;
    const title = TITLE_OVERRIDE[key] || b.title;
    const icon = BOARD_ICONS[key] || "📋";
    const posts = postsByBoard.get(b.id) ?? [];
    return {
      key,
      title,
      icon,
      href: `/board/${b.slug}`,
      body: <BoardBody slug={b.slug} posts={posts} rows={widgetRows} />,
    };
  }

  /** 셀(슬러그 배열) → 탭 배열 (권한 없는 항목 필터) */
  function cellToTabs(cell: string[]): WidgetTab[] {
    return cell.map(buildTab).filter((t): t is WidgetTab => t !== null);
  }

  // 모바일용: 모든 셀을 1열로 풀어서 표시 (각 셀은 그대로 탭 유지)
  const mobileCells = layout.flat();

  return (
    <div className="space-y-2 sm:space-y-2.5">
      {/* 데스크톱: [3열 위젯 그리드] + [현재접속자 도크 사이드바] 가로 배치 */}
      <div
        className="hidden lg:flex lg:items-start"
        style={{ gap: "var(--skin-widget-gap, 8px)" }}
      >
        <div
          className="grid grid-cols-3 auto-rows-min flex-1 min-w-0"
          style={{ gap: "var(--skin-widget-gap, 8px)" }}
        >
          {layout.flatMap((row, rIdx) =>
            row.map((cell, cIdx) => (
              <WidgetSlot key={`${rIdx}-${cIdx}`} tabs={cellToTabs(cell)} />
            )),
          )}
        </div>
        {/* 현재접속자 위젯 '고정' 도크 — 위젯 영역의 칸을 차지하지 않고 우측에 사이드바로 붙음.
            ActivePresenceWidget 가 docked 일 때 portal 로 여기 렌더 → 페이지와 함께 스크롤.
            비어있으면(팝업 모드/비로그인) empty:hidden 으로 사라져 그리드가 전체 폭 사용. */}
        <div id="dc-presence-dock" className="w-60 shrink-0 empty:hidden" />
      </div>

      {/* 모바일/태블릿: 공지 최상단 + 1~2열 */}
      <div className="lg:hidden">
        {(() => {
          const noticeTab = buildTab("__NOTICE__");
          return noticeTab ? <WidgetSlot tabs={[noticeTab]} /> : null;
        })()}
      </div>
      <div
        className="lg:hidden grid grid-cols-1 sm:grid-cols-2"
        style={{ gap: "var(--skin-widget-gap, 8px)" }}
      >
        {mobileCells.map((cell, i) => {
          const tabs = cellToTabs(cell.filter((k) => k !== "__NOTICE__"));
          if (tabs.length === 0) return null;
          return <WidgetSlot key={`m-${i}`} tabs={tabs} />;
        })}
      </div>
    </div>
  );
}
