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

  // 본문 HTML 의 모든 <img src="..."> 추출
  function getContentImageSrcs(html: string): string[] {
    const out: string[] = [];
    const re = /<img[^>]+src=["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) out.push(m[1]);
    return out;
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

  // 한 글의 모든 이미지 src 를 순서대로 수집 — 첨부 이미지 → 본문 임베드 이미지
  function collectImageSrcs(post: typeof posts[0]): string[] {
    const srcs: string[] = [];
    for (const a of post.attachments) {
      if (isImage(a.fileName)) srcs.push(`/api/image?attachmentId=${a.id}`);
    }
    for (const s of getContentImageSrcs(post.content)) srcs.push(s);
    return srcs;
  }

  // posts → 카드 엔트리 펼침. 이미지 1장이면 1카드, N장이면 N카드 (모두 같은 글 링크)
  const cardEntries = posts.flatMap((post) => {
    const srcs = collectImageSrcs(post);
    const total = srcs.length;
    if (total === 0) {
      return [{ post, src: null as string | null, idx: 1, total: 1 }];
    }
    return srcs.map((src, i) => ({ post, src, idx: i + 1, total }));
  });

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
      {cardEntries.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {cardEntries.map((e, i) => (
            <GalleryCard
              key={`${e.post.id}-${i}`}
              href={`/board/${boardId}/${e.post.id}`}
              thumbSrc={e.src}
              subject={e.post.subject}
              authorName={e.post.authorName}
              createdAtLabel={formatDate(e.post.createdAt)}
              hit={e.post.hit}
              vote={e.post.vote}
              totalComment={e.post.totalComment}
              contentSnippet={getContentSnippet(e.post.content)}
              imageIndex={e.idx}
              imageTotal={e.total}
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
