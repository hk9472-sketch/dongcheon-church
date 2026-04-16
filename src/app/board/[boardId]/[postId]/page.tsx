import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth";
import CommentSection from "@/components/board/CommentSection";
import PostActions from "@/components/board/PostActions";


// ============================================================
// 게시글 상세 페이지 (제로보드 view.php 대체)
// URL: /board/[boardId]/[postId]
// ============================================================

interface PageProps {
  params: Promise<{ boardId: string; postId: string }>;
}

export default async function PostDetailPage({ params }: PageProps) {
  const { boardId, postId } = await params;
  const postNo = parseInt(postId, 10);
  if (isNaN(postNo)) notFound();

  // 1. 게시판 설정
  const board = await prisma.board.findUnique({
    where: { slug: boardId },
  });
  if (!board) notFound();

  // 2. 게시글 조회 (제로보드: select * from $t_board_$id where no='$no')
  const post = await prisma.post.findFirst({
    where: { id: postNo, boardId: board.id },
  });
  if (!post) notFound();

  // 3. 현재 사용자 확인 + 권한 체크
  const currentUser = await getCurrentUser();
  const userLevel = currentUser?.level ?? 99;

  // grantView 체크: 열람 권한 없으면 로그인 유도 또는 접근 불가
  if (userLevel > board.grantView) {
    if (!currentUser) {
      redirect(`/auth/login?redirect=/board/${boardId}/${postId}`);
    }
    return (
      <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
        <p className="text-4xl mb-4">🔒</p>
        <h2 className="text-lg font-semibold text-gray-700 mb-2">접근 권한이 없습니다</h2>
        <p className="text-sm text-gray-500">이 게시판은 열람 권한이 있는 회원만 접근할 수 있습니다.</p>
        <Link href={`/board/${boardId}`} className="mt-4 inline-block text-blue-600 text-sm hover:underline">
          목록으로
        </Link>
      </div>
    );
  }

  // 비밀글 접근 권한 체크
  // - 관리자(isAdmin <= board.grantViewSecret 기준) 또는 작성자 본인만 열람 가능
  const isSecretBlocked =
    post.isSecret &&
    !((currentUser?.isAdmin ?? 3) <= board.grantViewSecret) &&
    !(currentUser?.id !== undefined && currentUser.id === post.authorId);

  // 조회수 증가 (비밀글로 차단되지 않을 때만)
  // updateMany 사용하여 @updatedAt 자동 갱신 회피 (수정 표시 방지)
  if (!isSecretBlocked) {
    await prisma.post.updateMany({
      where: { id: post.id },
      data: { hit: { increment: 1 } },
    });
  }

  // 수정/삭제 권한 확인
  // isGuestPost: authorId=null인 비회원(ZeroBoard 이관) 글 → 비밀번호로 처리
  const isGuestPost = post.authorId === null;
  let canEdit = false;
  let canDelete = false;
  if (currentUser) {
    if (currentUser.isAdmin <= 2) {
      canEdit = true;
      canDelete = true;
    } else if (!isGuestPost && post.authorId === currentUser.id) {
      // 작성자 본인
      canEdit = true;
      canDelete = true;
    } else {
      const perm = await prisma.boardUserPermission.findUnique({
        where: { userId_boardId: { userId: currentUser.id, boardId: board.id } },
      });
      if (perm) {
        canEdit = perm.canEdit;
        canDelete = perm.canDelete;
      }
    }
  }

  // 비밀글 차단 시 안내 화면 반환
  if (isSecretBlocked) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Link href={`/board/${boardId}`} className="text-lg font-bold text-gray-800 hover:text-blue-700">
            {board.title}
          </Link>
        </div>
        <article className="bg-white rounded-lg shadow-sm border border-gray-400 overflow-hidden">
          <div className="border-b border-gray-300 px-6 py-4">
            <h1 className="text-lg font-bold text-gray-900 mb-3">
              <span className="mr-1 text-gray-400" title="비밀글">🔒</span>
              {post.subject}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
              <span><strong className="text-gray-700">{post.authorName}</strong></span>
              <span>{formatDate(post.createdAt)}</span>
            </div>
          </div>
          <div className="px-6 py-12 text-center text-gray-500">
            <p className="text-4xl mb-4">🔒</p>
            <p className="text-base font-medium text-gray-700 mb-1">비밀글입니다</p>
            <p className="text-sm text-gray-500">
              이 글은 작성자와 관리자만 열람할 수 있습니다.
            </p>
            {!currentUser && (
              <Link
                href={`/auth/login?redirect=/board/${boardId}/${postId}`}
                className="mt-4 inline-block px-5 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-800"
              >
                로그인하기
              </Link>
            )}
          </div>
        </article>
        <div className="flex items-center justify-between">
          <Link href={`/board/${boardId}`} className="px-5 py-2 text-sm border border-gray-400 rounded hover:bg-gray-50">
            목록
          </Link>
        </div>
      </div>
    );
  }

  // 4. 댓글 조회 (제로보드: select * from $t_comment_$id where parent='$no')
  const comments = await prisma.comment.findMany({
    where: { postId: post.id },
    orderBy: { createdAt: "asc" },
  });

  // 5. 이전글/다음글 (제로보드: prev_no, next_no)
  const prevPost = await prisma.post.findFirst({
    where: {
      boardId: board.id,
      isNotice: false,
      createdAt: { lt: post.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, subject: true },
  });

  const nextPost = await prisma.post.findFirst({
    where: {
      boardId: board.id,
      isNotice: false,
      createdAt: { gt: post.createdAt },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, subject: true },
  });

  // 6. 관련 답글 조회 (같은 headnum 그룹)
  let replyList: { id: number; subject: string; authorName: string; depth: number; arrangenum: number; createdAt: Date }[] = [];
  if (post.headnum !== 0) {
    replyList = await prisma.post.findMany({
      where: {
        boardId: board.id,
        headnum: post.headnum,
        id: { not: post.id },
      },
      orderBy: { arrangenum: "asc" },
      take: 20,
    });
  }
  const posts = replyList;

  // 본문 렌더링 (HTML 허용 여부에 따라)
  const contentHtml = post.useHtml
    ? post.content
    : post.content.replace(/\n/g, "<br />");

  // 갤러리 유형: 첨부파일 중 이미지만 추출
  const isGallery = board.boardType === "GALLERY";
  const isImageFile = (name: string | null) =>
    !!name && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name);
  const galleryImages: { src: string; alt: string }[] = [];
  if (isGallery) {
    if (post.fileName1 && isImageFile(post.fileName1)) {
      galleryImages.push({
        src: `/api/image?boardId=${boardId}&postId=${post.id}&fileNo=1`,
        alt: post.origName1 || post.fileName1,
      });
    }
    if (post.fileName2 && isImageFile(post.fileName2)) {
      galleryImages.push({
        src: `/api/image?boardId=${boardId}&postId=${post.id}&fileNo=2`,
        alt: post.origName2 || post.fileName2,
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* 게시판 제목 */}
      <div className="flex items-center justify-between">
        <Link href={`/board/${boardId}`} className="text-lg font-bold text-gray-800 hover:text-blue-700">
          {board.title}
        </Link>
      </div>

      {/* 게시판 안내 문구 */}
      <div className="px-4 py-2.5 bg-blue-50/60 border border-blue-100 rounded text-xs text-gray-500 italic leading-relaxed whitespace-pre-line">
        {board.guideText || "예배당처럼 아끼고 서로 조심하셨으면 합니다.\n주로 우리 교인들이 사용하겠지만 혹 손님들이 오시더라도 깨끗한 우리의 모습을 보였으면 좋겠고, 서로의 신앙에 유익이 되도록 했으면 좋겠습니다."}
      </div>

      {/* 게시글 본문 */}
      <article className="bg-white rounded-lg shadow-sm border border-gray-400 overflow-hidden skin-card">
        {/* 헤더 */}
        <div className="border-b border-gray-300 px-6 py-4">
          <h1 className="text-lg font-bold text-gray-900 mb-3">
            {post.isNotice && (
              <span className="inline-block px-1.5 py-0.5 text-xs font-bold text-white bg-blue-600 rounded mr-2 align-middle">
                공지
              </span>
            )}
            {post.isSecret && (
              <span className="mr-1 text-gray-400" title="비밀글">🔒</span>
            )}
            {post.depth > 0 && <span className="text-gray-400 mr-1">Re:</span>}
            {post.subject}
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
            <span>
              <strong className="text-gray-700">{post.authorName}</strong>
            </span>
            <span>{formatDate(post.createdAt)}</span>
            {post.lastEditedAt && post.lastEditorUserId && (
              <span className="text-orange-600 text-xs">
                수정: {formatDate(post.lastEditedAt)} ({post.lastEditorName || post.lastEditorUserId})
              </span>
            )}
            <span>조회 {post.hit + 1}</span>
            {post.vote > 0 && <span>추천 {post.vote}</span>}
            {post.email && (
              <a href={`mailto:${post.email}`} className="text-blue-600 hover:underline">
                {post.email}
              </a>
            )}
            {post.homepage && (
              <a
                href={post.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                홈페이지
              </a>
            )}

          </div>
        </div>

        {/* 본문 */}
        <div className="px-6 py-6">
          {/* 갤러리: 첨부 이미지 표시 */}
          {galleryImages.length > 0 && (
            <div className="mb-6 space-y-4">
              {galleryImages.map((img, i) => (
                <div key={i} className="text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.src}
                    alt={img.alt}
                    className="inline-block max-w-full h-auto rounded-lg border border-gray-200"
                    style={{ maxHeight: "70vh" }}
                  />
                </div>
              ))}
            </div>
          )}

          <div
            className="prose prose-sm max-w-none text-gray-800 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />

          {/* 링크 (제로보드: sitelink1, sitelink2) */}
          {(post.sitelink1 || post.sitelink2) && (
            <div className="mt-6 pt-4 border-t border-gray-300 text-sm space-y-1">
              {post.sitelink1 && (
                <div>
                  <span className="text-gray-500 mr-2">링크1:</span>
                  <a
                    href={post.sitelink1}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all"
                  >
                    {post.sitelink1}
                  </a>
                </div>
              )}
              {post.sitelink2 && (
                <div>
                  <span className="text-gray-500 mr-2">링크2:</span>
                  <a
                    href={post.sitelink2}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all"
                  >
                    {post.sitelink2}
                  </a>
                </div>
              )}
            </div>
          )}

          {/* 첨부파일 (제로보드: file_name1, file_name2) */}
          {(post.fileName1 || post.fileName2) && (
            <div className="mt-6 pt-4 border-t border-gray-300">
              <h3 className="text-sm font-medium text-gray-700 mb-2">첨부파일</h3>
              <div className="space-y-1.5">
                {post.fileName1 && (
                  <a
                    href={`/api/download?boardId=${boardId}&postId=${post.id}&fileNo=1`}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  >
                    <span>📎</span>
                    <span>{post.origName1 || post.fileName1}</span>
                    <span className="text-gray-400 text-xs">(다운로드 {post.download1})</span>
                  </a>
                )}
                {post.fileName2 && (
                  <a
                    href={`/api/download?boardId=${boardId}&postId=${post.id}&fileNo=2`}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  >
                    <span>📎</span>
                    <span>{post.origName2 || post.fileName2}</span>
                    <span className="text-gray-400 text-xs">(다운로드 {post.download2})</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 추천/액션 버튼 */}
        <PostActions boardSlug={boardId} postId={post.id} currentVote={post.vote} canEdit={canEdit} canDelete={canDelete} isGuestPost={isGuestPost} />
      </article>

      {/* 답글 목록 (같은 headnum 그룹) */}
      {posts.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-400 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-400">
            <h3 className="text-sm font-medium text-gray-700">관련 답글</h3>
          </div>
          <ul className="divide-y divide-gray-200">
            {posts.map((reply) => (
              <li key={reply.id}>
                <Link
                  href={`/board/${boardId}/${reply.id}`}
                  className="flex items-center px-4 py-2.5 hover:bg-gray-50 text-sm"
                  style={{ paddingLeft: 16 + reply.depth * 16 }}
                >
                  {reply.depth > 0 && <span className="text-gray-400 mr-1">└</span>}
                  <span className="text-gray-800 flex-1 truncate">{reply.subject}</span>
                  <span className="text-gray-500 ml-3 whitespace-nowrap">{reply.authorName}</span>
                  <span className="text-gray-400 ml-3 text-xs whitespace-nowrap">
                    {formatDate(reply.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 댓글 섹션 (제로보드: view_comment.php + view_write_comment.php) */}
      {board.useComment && (
        <CommentSection
          boardSlug={boardId}
          postId={post.id}
          commentPolicy={post.commentPolicy}
          isAdmin={currentUser ? currentUser.isAdmin <= 2 : false}
          currentUserId={currentUser?.id ?? null}
          postAuthorId={post.authorId}
          comments={comments.map((c) => ({
            id: c.id,
            authorName: c.authorName,
            content: c.content,
            isSecret: c.isSecret,
            createdAt: c.createdAt.toISOString(),
            authorId: c.authorId,
          }))}
        />
      )}

      {/* 이전글/다음글 네비게이션 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-400 overflow-hidden text-sm">
        <div className="divide-y divide-gray-200">
          {nextPost && (
            <Link
              href={`/board/${boardId}/${nextPost.id}`}
              className="flex items-center px-4 py-2.5 hover:bg-gray-50"
            >
              <span className="w-16 text-gray-400 font-medium">다음글</span>
              <span className="text-gray-400 mx-2">▲</span>
              <span className="text-gray-700 truncate">{nextPost.subject}</span>
            </Link>
          )}
          {prevPost && (
            <Link
              href={`/board/${boardId}/${prevPost.id}`}
              className="flex items-center px-4 py-2.5 hover:bg-gray-50"
            >
              <span className="w-16 text-gray-400 font-medium">이전글</span>
              <span className="text-gray-400 mx-2">▼</span>
              <span className="text-gray-700 truncate">{prevPost.subject}</span>
            </Link>
          )}
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="flex items-center justify-between">
        <Link
          href={`/board/${boardId}`}
          className="px-5 py-2 text-sm border border-gray-400 rounded hover:bg-gray-50 transition-colors"
        >
          목록
        </Link>
        <div className="flex gap-2">
          {board.useReply && (
            <Link
              href={`/board/${boardId}/write?mode=reply&no=${post.id}`}
              className="px-4 py-2 text-sm border border-gray-400 rounded hover:bg-gray-50 transition-colors"
            >
              답글
            </Link>
          )}
          <Link
            href={`/board/${boardId}/write`}
            className="px-5 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-800 transition-colors skin-btn-primary"
          >
            글쓰기
          </Link>
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { boardId, postId } = await params;
  const board = await prisma.board.findUnique({ where: { slug: boardId } });
  const post = await prisma.post.findUnique({ where: { id: parseInt(postId, 10) } });
  return {
    title: post ? `${post.subject} - ${board?.title || "게시판"} - 동천교회` : "동천교회",
  };
}
