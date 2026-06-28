// 메인 페이지 위젯 본문 — 서버 컴포넌트. page.tsx 에서 분리.
// 헤더(타이틀+더보기) 는 별도 (WidgetSlot 의 탭이 헤더 역할을 함).

import Link from "next/link";
import FloppyIcon from "@/components/icons/FloppyIcon";
import PostBadge from "@/components/board/PostBadge";

export interface RecentPost {
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

export interface RecentComment {
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

export interface NoticeDetail {
  id: number;
  subject: string;
  content: string;
  useHtml: boolean;
  authorName: string;
  createdAt: Date;
}

export function formatShortDate(date: Date): string {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

/** 공지사항 본문 */
export function NoticeBody({
  latestNotice,
  noticeContentHtml,
}: {
  latestNotice: NoticeDetail | null;
  noticeContentHtml: string;
}) {
  if (!latestNotice) {
    return (
      <div className="p-4 text-center text-sm text-gray-400 h-full flex items-center justify-center">
        등록된 공지가 없습니다.
      </div>
    );
  }
  return (
    <div className="px-2 sm:px-3 pt-2 pb-1.5 flex flex-col flex-1">
      <h3 className="font-bold text-gray-800 truncate mb-1 text-sm sm:text-base flex-shrink-0 text-center">
        {latestNotice.subject}
      </h3>
      {/* leading·단락여백을 압축해 본문 아래 불필요한 공백 최소화 (위젯 높이 절감) */}
      <div className="text-xs sm:text-sm font-bold text-blue-800 leading-snug prose prose-sm max-w-none [&_*]:text-blue-800 [&_p]:my-0.5 [&_ol]:my-0.5 [&_ul]:my-0.5 [&_li]:my-0 overflow-auto flex-1 flex items-center justify-center">
        <div
          className="text-left w-fit"
          dangerouslySetInnerHTML={{ __html: noticeContentHtml || "<p>(내용 없음)</p>" }}
        />
      </div>
    </div>
  );
}

/** 게시판 본문 (목록 N행) */
export function BoardBody({
  slug,
  posts,
  rows,
}: {
  slug: string;
  posts: RecentPost[];
  rows: number;
}) {
  const slots = Array.from({ length: rows }, (_, i) => posts[i] ?? null);
  return (
    <ul className="flex flex-col">
      {slots.map((post, i) => (
        <li
          key={post?.id ?? `empty-${i}`}
          className="border-b border-gray-100 last:border-b-0 flex items-center"
          style={{ height: "var(--skin-widget-row-height, 1.75rem)" }}
        >
          {post ? (
            <Link
              href={`/board/${slug}/${post.id}`}
              className="flex items-center px-2.5 sm:px-3 hover:bg-gray-50 transition-colors group w-full min-w-0"
            >
              <span
                className="flex-shrink-0 mr-1.5 sm:mr-2 font-mono"
                style={{
                  fontFamily: "var(--skin-widget-date-font)",
                  fontSize: "var(--skin-widget-date-size)",
                  color: "var(--skin-widget-date-color)",
                  fontWeight: "var(--skin-widget-date-weight)" as never,
                  textDecoration: "var(--skin-widget-date-decoration)" as never,
                  fontStyle: "var(--skin-widget-date-style)" as never,
                }}
              >
                {formatShortDate(post.createdAt)}
              </span>
              <span
                className="group-hover:opacity-80 flex items-center min-w-0 flex-1 mr-1 sm:mr-2"
                style={{
                  fontFamily: "var(--skin-widget-post-font)",
                  fontSize: "var(--skin-widget-post-size)",
                  color: "var(--skin-widget-post-color)",
                  fontWeight: "var(--skin-widget-post-weight)" as never,
                  textDecoration: "var(--skin-widget-post-decoration)" as never,
                  fontStyle: "var(--skin-widget-post-style)" as never,
                }}
              >
                {post.depth > 0 && (
                  <span className="shrink-0 text-gray-400 text-[10px] sm:text-xs mr-0.5">└</span>
                )}
                {post.isNotice && (
                  <span className="shrink-0 inline-block text-[10px] sm:text-xs text-blue-600 font-bold mr-1 sm:mr-1.5">
                    [공지]
                  </span>
                )}
                {post.isSecret && (
                  <span
                    className="shrink-0 inline-block text-[10px] sm:text-xs mr-0.5 align-middle"
                    title="비밀글"
                  >
                    🔒
                  </span>
                )}
                <span className="truncate min-w-0">{post.subject}</span>
                {post.hasAttachment && (
                  <FloppyIcon className="shrink-0 ml-1 w-3.5 h-3.5 text-blue-600" />
                )}
                <span
                  className="shrink-0 ml-1"
                  style={{
                    fontFamily: "var(--skin-widget-author-font)",
                    fontSize: "var(--skin-widget-author-size)",
                    color: "var(--skin-widget-author-color)",
                    fontWeight: "var(--skin-widget-author-weight)" as never,
                    textDecoration: "var(--skin-widget-author-decoration)" as never,
                    fontStyle: "var(--skin-widget-author-style)" as never,
                  }}
                >
                  [{post.authorName}]
                </span>
                <span className="shrink-0">
                  <PostBadge createdAt={post.createdAt} updatedAt={post.updatedAt} />
                </span>
                {post.totalComment > 0 && (
                  <span
                    className={`shrink-0 inline-block ml-1 text-[10px] sm:text-xs font-bold align-middle ${
                      post.hasRecentComment ? "text-red-500" : "text-gray-400"
                    }`}
                  >
                    [{post.totalComment}]
                  </span>
                )}
              </span>
            </Link>
          ) : (
            <div className="px-2.5 sm:px-3 w-full">&nbsp;</div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 새글/수정글 본문 */
export function RecentPostsBody({ posts, rows }: { posts: RecentPost[]; rows: number }) {
  return (
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
              className="flex items-center px-2.5 sm:px-3 hover:bg-gray-50 transition-colors group w-full min-w-0"
            >
              <span
                className="flex-shrink-0 mr-1.5 sm:mr-2 font-mono"
                style={{
                  fontFamily: "var(--skin-widget-date-font)",
                  fontSize: "var(--skin-widget-date-size)",
                  color: "var(--skin-widget-date-color)",
                  fontWeight: "var(--skin-widget-date-weight)" as never,
                }}
              >
                {formatShortDate(post.updatedAt)}
              </span>
              <span
                className="group-hover:opacity-80 flex items-center min-w-0 flex-1 mr-1 sm:mr-2"
                style={{
                  fontFamily: "var(--skin-widget-post-font)",
                  fontSize: "var(--skin-widget-post-size)",
                  color: "var(--skin-widget-post-color)",
                  fontWeight: "var(--skin-widget-post-weight)" as never,
                }}
              >
                {post.depth > 0 && (
                  <span className="shrink-0 text-gray-400 text-[10px] sm:text-xs mr-0.5">└</span>
                )}
                {post.isSecret && (
                  <span
                    className="shrink-0 text-[10px] sm:text-xs mr-0.5 align-middle"
                    title="비밀글"
                  >
                    🔒
                  </span>
                )}
                <span className="truncate min-w-0">{post.subject}</span>
                {post.hasAttachment && (
                  <FloppyIcon className="shrink-0 ml-1 w-3.5 h-3.5 text-blue-600" />
                )}
                <span
                  className="shrink-0 ml-1"
                  style={{
                    fontFamily: "var(--skin-widget-author-font)",
                    fontSize: "var(--skin-widget-author-size)",
                    color: "var(--skin-widget-author-color)",
                    fontWeight: "var(--skin-widget-author-weight)" as never,
                  }}
                >
                  [{post.authorName}]
                </span>
                <span className="shrink-0">
                  <PostBadge createdAt={post.createdAt} updatedAt={post.updatedAt} />
                </span>
              </span>
            </Link>
          ) : (
            <div className="px-2.5 sm:px-3 w-full">&nbsp;</div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 새댓글 본문 */
export function RecentCommentsBody({
  comments,
  rows,
}: {
  comments: RecentComment[];
  rows: number;
}) {
  return (
    <ul className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => comments[i] ?? null).map((comment, i) => (
        <li
          key={comment?.id ?? `empty-comment-${i}`}
          className="border-b border-gray-100 last:border-b-0 flex items-center"
          style={{ height: "var(--skin-widget-row-height, 1.75rem)" }}
        >
          {comment ? (
            <Link
              href={`/board/${comment.post.board.slug}/${comment.postId}#comment-${comment.id}`}
              className="flex items-center px-2.5 sm:px-3 hover:bg-gray-50 transition-colors group w-full min-w-0"
            >
              <span
                className="flex-shrink-0 mr-1.5 sm:mr-2 font-mono"
                style={{
                  fontFamily: "var(--skin-widget-date-font)",
                  fontSize: "var(--skin-widget-date-size)",
                  color: "var(--skin-widget-date-color)",
                  fontWeight: "var(--skin-widget-date-weight)" as never,
                }}
              >
                {formatShortDate(comment.updatedAt)}
              </span>
              <span
                className="group-hover:opacity-80 flex items-center min-w-0 flex-1 mr-1 sm:mr-2"
                style={{
                  fontFamily: "var(--skin-widget-post-font)",
                  fontSize: "var(--skin-widget-post-size)",
                  color: "var(--skin-widget-post-color)",
                  fontWeight: "var(--skin-widget-post-weight)" as never,
                }}
              >
                <span className="truncate min-w-0">
                  {comment.content.replace(/<[^>]*>/g, "").substring(0, 50)}
                </span>
                <span
                  className="shrink-0 ml-1"
                  style={{
                    fontFamily: "var(--skin-widget-author-font)",
                    fontSize: "var(--skin-widget-author-size)",
                    color: "var(--skin-widget-author-color)",
                    fontWeight: "var(--skin-widget-author-weight)" as never,
                  }}
                >
                  [{comment.authorName}]
                </span>
                <span className="shrink-0">
                  <PostBadge createdAt={comment.createdAt} updatedAt={comment.updatedAt} />
                </span>
              </span>
            </Link>
          ) : (
            <div className="px-2.5 sm:px-3 w-full">&nbsp;</div>
          )}
        </li>
      ))}
    </ul>
  );
}
