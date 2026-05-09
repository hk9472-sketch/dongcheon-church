import Link from "next/link";
import prisma from "@/lib/db";
import { calcPagination, formatDate } from "@/lib/utils";
import Pagination from "@/components/board/Pagination";
import BoardGuideBox from "@/components/board/BoardGuideBox";
import GalleryCard from "@/components/board/GalleryCard";

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

  // 첨부 이미지 OR 본문에 <img> 가 있는 글
  const where = {
    boardId: board.id,
    isNotice: false,
    OR: [
      { attachments: { some: {} } },
      { content: { contains: "<img" } },
    ],
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

  // 본문 HTML 의 첫 <img src="..."> 추출
  function getContentImageSrc(html: string): string | null {
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return m ? m[1] : null;
  }

  // HTML 제거 + 공백 정리 + 길이 컷 — 호버 툴팁용
  function getContentSnippet(html: string, max = 200): string {
    const text = html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/?(p|div|h[1-6])[^>]*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "";
    return text.length > max ? text.slice(0, max) + "…" : text;
  }

  function getThumbnailSrc(post: typeof posts[0]): string | null {
    // 1) 첨부에서 이미지 우선
    const img = post.attachments.find((a) => isImage(a.fileName));
    if (img) return `/api/image?attachmentId=${img.id}`;
    // 2) 본문 첫 이미지 fallback
    return getContentImageSrc(post.content);
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
      <BoardGuideBox text={board.guideText} />

      {/* 갤러리 그리드 */}
      {posts.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {posts.map((post) => (
            <GalleryCard
              key={post.id}
              href={`/board/${boardId}/${post.id}`}
              thumbSrc={getThumbnailSrc(post)}
              subject={post.subject}
              authorName={post.authorName}
              createdAtLabel={formatDate(post.createdAt)}
              hit={post.hit}
              vote={post.vote}
              totalComment={post.totalComment}
              contentSnippet={getContentSnippet(post.content)}
            />
          ))}
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
