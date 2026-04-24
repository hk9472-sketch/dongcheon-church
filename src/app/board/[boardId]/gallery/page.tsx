import Link from "next/link";
import Image from "next/image";
import prisma from "@/lib/db";
import { calcPagination, formatDate } from "@/lib/utils";
import Pagination from "@/components/board/Pagination";

// ============================================================
// 갤러리 모드 (제로보드 daerew_BASICgallery 스킨 대체)
// URL: /board/[boardId]/gallery?page=1
// ============================================================

interface PageProps {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

export default async function GalleryPage({ params, searchParams }: PageProps) {
  const { boardId } = await params;
  const query = await searchParams;

  const board = await prisma.board.findUnique({ where: { slug: boardId } });
  if (!board) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
        <p className="text-gray-500">존재하지 않는 게시판입니다.</p>
        <Link href="/" className="mt-4 inline-block text-blue-600 text-sm hover:underline">메인으로</Link>
      </div>
    );
  }

  const page = Math.max(1, parseInt(query.page || "1", 10) || 1);
  const perPage = 12; // 갤러리는 12개씩 (4x3 grid)

  const where = {
    boardId: board.id,
    isNotice: false,
    // 이미지 첨부 한 개라도 있는 글만
    attachments: { some: {} },
  };

  const totalPosts = await prisma.post.count({ where });
  const paging = calcPagination(totalPosts, page, perPage, 8);

  const posts = await prisma.post.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: paging.skip,
    take: paging.take,
    include: {
      attachments: { orderBy: { sortOrder: "asc" } },
    },
  });

  function isImage(name: string) {
    return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name);
  }

  function getThumbnailSrc(post: typeof posts[0]): string | null {
    const img = post.attachments.find((a) => isImage(a.fileName));
    return img ? `/api/image?attachmentId=${img.id}` : null;
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">{board.title}</h1>
          <div className="flex gap-1">
            <Link
              href={`/board/${boardId}?view=list`}
              className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
            >
              목록
            </Link>
            <span className="px-2.5 py-1 text-xs bg-blue-700 text-white rounded">
              갤러리
            </span>
          </div>
        </div>
        <span className="text-sm text-gray-500">
          총 <strong className="text-blue-700">{totalPosts}</strong>건
        </span>
      </div>

      {/* 게시판 안내 문구 */}
      <div className="px-4 py-2.5 bg-blue-50/60 border border-blue-100 rounded text-xs text-gray-500 italic leading-relaxed whitespace-pre-line">
        {board.guideText || "예배당처럼 아끼고 서로 조심하셨으면 합니다.\n주로 우리 교인들이 사용하겠지만 혹 손님들이 오시더라도 깨끗한 우리의 모습을 보였으면 좋겠고, 서로의 신앙에 유익이 되도록 했으면 좋겠습니다."}
      </div>

      {/* 갤러리 그리드 */}
      {posts.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {posts.map((post) => {
            const thumbSrc = getThumbnailSrc(post);
            return (
              <Link
                key={post.id}
                href={`/board/${boardId}/${post.id}`}
                className="group bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md hover:border-blue-300 transition-all skin-gallery-card"
              >
                {/* 썸네일 영역 */}
                <div className="aspect-square bg-gray-100 relative overflow-hidden">
                  {thumbSrc ? (
                    <Image
                      src={thumbSrc}
                      alt={post.subject}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                      </svg>
                    </div>
                  )}
                  {/* 댓글 수 뱃지 */}
                  {post.totalComment > 0 && (
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 text-xs font-bold bg-orange-500 text-white rounded">
                      {post.totalComment}
                    </span>
                  )}
                </div>

                {/* 정보 */}
                <div className="p-3">
                  <h3 className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-700">
                    {post.subject}
                  </h3>
                  <div className="flex items-center justify-between mt-1.5 text-xs text-gray-500">
                    <span>{post.authorName}</span>
                    <span>{formatDate(post.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>조회 {post.hit}</span>
                    {post.vote > 0 && <span>추천 {post.vote}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border p-16 text-center text-gray-400">
          등록된 이미지가 없습니다.
        </div>
      )}

      {/* 페이지네이션 */}
      <Pagination
        currentPage={paging.currentPage}
        totalPages={paging.totalPages}
        startPage={paging.startPage}
        endPage={paging.endPage}
        hasPrev={paging.hasPrev}
        hasNext={paging.hasNext}
        baseUrl={`/board/${boardId}/gallery`}
        queryString=""
      />

      {/* 하단 버튼 */}
      <div className="flex justify-end">
        <Link
          href={`/board/${boardId}/write`}
          className="px-5 py-2 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800 transition-colors"
        >
          글쓰기
        </Link>
      </div>
    </div>
  );
}
