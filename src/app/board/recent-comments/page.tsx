import Link from "next/link";
import prisma from "@/lib/db";

// 최근 댓글은 실시간성 데이터이므로 요청 시점에 렌더 (빌드 시 DB 접근 불필요)
export const dynamic = "force-dynamic";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function formatDate(date: Date): string {
  const d = new Date(date);
  const today = new Date();
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export default async function RecentCommentsPage() {
  const oneWeekAgo = new Date(Date.now() - ONE_WEEK_MS);

  const comments = await prisma.comment.findMany({
    where: {
      OR: [
        { createdAt: { gte: oneWeekAgo } },
        { updatedAt: { gte: oneWeekAgo } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
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

  return (
    <div className="space-y-4">
      {/* 게시판 제목 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">새댓글</h1>
        <span className="text-sm text-gray-500">
          총 <strong className="text-blue-700">{comments.length}</strong>건
        </span>
      </div>

      {/* 안내 문구 */}
      <div className="px-4 py-2.5 bg-blue-50/60 border border-blue-100 rounded text-xs text-gray-500 italic leading-relaxed">
        최근 2개월 내 등록/수정된 댓글 목록입니다.
      </div>

      {/* 댓글 테이블 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-400 overflow-hidden skin-card">
        <table className="w-full text-sm skin-table">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-400 text-gray-600">
              <th className="w-24 py-2.5 text-center font-medium">게시판</th>
              <th className="py-2.5 text-left font-medium">댓글 내용</th>
              <th className="w-48 py-2.5 text-left font-medium hidden lg:table-cell">원글 제목</th>
              <th className="w-24 py-2.5 text-center font-medium hidden sm:table-cell">작성자</th>
              <th className="w-24 py-2.5 text-center font-medium hidden md:table-cell">날짜</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {comments.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-gray-400">
                  최근 2개월 내 새댓글이 없습니다.
                </td>
              </tr>
            ) : (
              comments.map((comment) => {
                const created = new Date(comment.createdAt).getTime();
                const updated = new Date(comment.updatedAt).getTime();
                const isUpdated = updated - created > 60000;
                const plainContent = stripHtml(comment.content).substring(0, 80);
                return (
                  <tr key={comment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 text-center">
                      <Link href={`/board/${comment.post.board.slug}`} className="text-xs text-blue-600 hover:underline">
                        {comment.post.board.title}
                      </Link>
                    </td>
                    <td className="py-2.5 px-2">
                      <Link
                        href={`/board/${comment.post.board.slug}/${comment.postId}`}
                        className="text-gray-800 hover:text-blue-700"
                      >
                        {plainContent}
                        {isUpdated ? (
                          <span className="inline-block ml-1.5 px-1 py-0.5 text-[10px] font-bold leading-none text-orange-600 bg-orange-100 rounded align-middle">U</span>
                        ) : (
                          <span className="inline-block ml-1.5 px-1 py-0.5 text-[10px] font-bold leading-none text-red-600 bg-red-100 rounded align-middle">N</span>
                        )}
                      </Link>
                    </td>
                    <td className="py-2.5 px-2 text-xs text-gray-600 hidden lg:table-cell">
                      <Link
                        href={`/board/${comment.post.board.slug}/${comment.postId}`}
                        className="hover:text-blue-700 truncate block max-w-[12rem]"
                      >
                        {comment.post.subject}
                      </Link>
                    </td>
                    <td className="py-2.5 text-center text-gray-600 hidden sm:table-cell">
                      {comment.authorName}
                    </td>
                    <td className="py-2.5 text-center text-gray-500 text-xs hidden md:table-cell">
                      {formatDate(comment.updatedAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 홈으로 */}
      <div className="flex justify-end">
        <Link
          href="/"
          className="px-5 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded hover:bg-gray-200 transition-colors"
        >
          메인으로
        </Link>
      </div>
    </div>
  );
}

export function generateMetadata() {
  return { title: "새댓글 - 동천교회" };
}
