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

  // 장식용 글머리/박스/도형 문자 — 본문 의미 손실 거의 없으므로 제거
  const DECORATIVE_CHARS = new Set([
    "■", "□", "▣", "▤", "▥", "▦", "▧", "▨", "▩",
    "◆", "◇", "◈", "★", "☆", "※",
    "▶", "▷", "▸", "◀", "◁",
    "●", "○", "◎",
  ]);

  function isInvisibleOrControl(c: number): boolean {
    if (c < 0x20 || c === 0x7f) return true; // C0 / DEL
    if (c === 0x00a0) return true; // NBSP
    if (c === 0xfeff) return true; // BOM
    if (c >= 0x200b && c <= 0x200f) return true; // zero-width / RTL marks
    if (c >= 0x202a && c <= 0x202e) return true; // bidi embeddings
    if (c >= 0x2060 && c <= 0x206f) return true; // word joiner / invisible separators
    return false;
  }

  // 단일 패스 엔티티 디코더 — name / decimal / hex 모두 처리.
  // 알 수 없는 엔티티는 공백으로 (살아남아 toolitp 에 노출되지 않도록).
  const NAMED_ENTITIES: Record<string, string> = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    ensp: " ",
    emsp: " ",
    thinsp: " ",
  };
  function decodeEntitiesOnce(input: string): string {
    return input.replace(
      /&(?:#x([0-9a-fA-F]+)|#([0-9]+)|([a-zA-Z][a-zA-Z0-9]*));/g,
      (_, hex, dec, name) => {
        if (hex) {
          const cp = parseInt(hex, 16);
          if (Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff) {
            return String.fromCodePoint(cp);
          }
          return " ";
        }
        if (dec) {
          const cp = parseInt(dec, 10);
          if (Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff) {
            return String.fromCodePoint(cp);
          }
          return " ";
        }
        if (name) {
          const lower = name.toLowerCase();
          return NAMED_ENTITIES[lower] ?? " ";
        }
        return " ";
      },
    );
  }

  // HTML 제거 + 엔티티 디코드 + 공백/특수문자 정리 + 길이 컷 — 호버 툴팁용
  function getContentSnippet(html: string, max = 200): string {
    // 1) 줄바꿈 의미 태그를 공백으로 → 모든 태그 제거
    let text = html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/?(p|div|h[1-6]|li|tr|td)[^>]*>/gi, " ")
      .replace(/<[^>]*>/g, " ");

    // 2) 엔티티 디코드 — 더블/트리플 인코딩(&amp;#160; / &amp;amp;#160; 등) 까지 안정화될 때까지 반복
    for (let i = 0; i < 6; i++) {
      const before = text;
      text = decodeEntitiesOnce(text);
      if (text === before) break;
    }

    // 3) 마지막 안전망 — 어떤 형태든 남은 &xxx; 패턴은 모두 공백으로
    text = text.replace(/&[^;\s]{1,20};/g, " ");

    // 4) 제어/invisible 문자 + 장식 도형 문자를 공백으로 (char-by-char)
    let cleaned = "";
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      const ch = text[i];
      if (isInvisibleOrControl(c) || DECORATIVE_CHARS.has(ch)) {
        cleaned += " ";
      } else {
        cleaned += ch;
      }
    }

    text = cleaned.replace(/\s+/g, " ").trim();
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
