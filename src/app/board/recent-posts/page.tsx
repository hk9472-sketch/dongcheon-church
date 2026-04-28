import Link from "next/link";
import prisma from "@/lib/db";

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

export default async function RecentPostsPage() {
  const oneWeekAgo = new Date(Date.now() - ONE_WEEK_MS);

  // headnum/arrangenum으로 정렬하여 스레드(원글-답글) 순서 유지
  const posts = await prisma.post.findMany({
    where: {
      OR: [
        { createdAt: { gte: oneWeekAgo } },
        { updatedAt: { gte: oneWeekAgo } },
      ],
    },
    orderBy: [{ headnum: "asc" }, { arrangenum: "asc" }],
    take: 200,
    select: {
      id: true,
      subject: true,
      authorName: true,
      createdAt: true,
      updatedAt: true,
      isSecret: true,
      isNotice: true,
      totalComment: true,
      hit: true,
      depth: true,
      board: { select: { slug: true, title: true } },
    },
  });

  return (
    <div className="space-y-4">
      {/* 게시판 제목 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">새글/수정글</h1>
        <span className="text-sm text-gray-500">
          총 <strong className="text-blue-700">{posts.length}</strong>건
        </span>
      </div>

      {/* 안내 문구 */}
      <div className="px-4 py-2.5 bg-blue-50/60 border border-blue-100 rounded text-xs text-gray-500 italic leading-relaxed">
        최근 2개월 내 등록/수정된 글 목록입니다.
      </div>

      {/* 게시글 테이블 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-400 overflow-hidden skin-card">
        <table className="w-full text-sm skin-table">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-400 text-gray-600">
              <th className="w-24 py-2.5 text-center font-medium">게시판</th>
              <th className="py-2.5 text-left font-medium">제목</th>
              <th className="w-24 py-2.5 text-center font-medium hidden sm:table-cell">작성자</th>
              <th className="w-24 py-2.5 text-center font-medium hidden md:table-cell">날짜</th>
              <th className="w-16 py-2.5 text-center font-medium hidden md:table-cell">조회</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {posts.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-gray-400">
                  최근 2개월 내 새글/수정글이 없습니다.
                </td>
              </tr>
            ) : (
              posts.map((post) => {
                const created = new Date(post.createdAt).getTime();
                const updated = new Date(post.updatedAt).getTime();
                const isUpdated = updated - created > 60000;
                return (
                  <tr key={post.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 text-center">
                      <Link href={`/board/${post.board.slug}`} className="text-xs text-blue-600 hover:underline">
                        {post.board.title}
                      </Link>
                    </td>
                    <td className="py-2.5 px-2">
                      <Link
                        href={`/board/${post.board.slug}/${post.id}`}
                        className="text-gray-800 hover:text-blue-700"
                      >
                        {post.depth > 0 && (
                          <span className="text-gray-400 text-xs mr-1">└</span>
                        )}
                        {post.isNotice && (
                          <span className="text-xs text-blue-600 font-bold mr-1">[공지]</span>
                        )}
                        {post.isSecret && (
                          <span className="ml-1 text-xs text-gray-400" title="비밀글">🔒</span>
                        )}
                        {post.subject}
                        {post.totalComment > 0 && (
                          <span className="ml-1.5 text-xs text-orange-500 font-bold">[{post.totalComment}]</span>
                        )}
                        {isUpdated ? (
                          <span className="inline-block ml-1.5 px-1 py-0.5 text-[11px] font-bold leading-none text-orange-600 bg-orange-100 rounded align-middle">U</span>
                        ) : (
                          <span className="inline-block ml-1.5 px-1 py-0.5 text-[11px] font-bold leading-none text-red-600 bg-red-100 rounded align-middle">N</span>
                        )}
                      </Link>
                    </td>
                    <td className="py-2.5 text-center text-gray-600 hidden sm:table-cell">
                      {post.authorName}
                    </td>
                    <td className="py-2.5 text-center text-gray-500 text-xs hidden md:table-cell">
                      {formatDate(post.updatedAt)}
                    </td>
                    <td className="py-2.5 text-center text-gray-500 hidden md:table-cell">
                      {post.hit}
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
  return { title: "새글/수정글 - 동천교회" };
}
