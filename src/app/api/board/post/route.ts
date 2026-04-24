import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET /api/board/post?id=123
export async function GET(request: NextRequest) {
  const id = parseInt(request.nextUrl.searchParams.get("id") || "", 10);
  if (isNaN(id)) {
    return NextResponse.json({ message: "유효하지 않은 ID" }, { status: 400 });
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      attachments: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!post) {
    return NextResponse.json({ message: "게시글 없음" }, { status: 404 });
  }

  // 세션 기반 편집 권한 계산
  const isGuestPost = post.authorId === null;
  let canEdit = isGuestPost; // 비회원 글은 비밀번호로 누구나 시도 가능

  const sessionToken = request.cookies.get("dc_session")?.value;
  if (sessionToken) {
    const session = await prisma.session.findUnique({ where: { sessionToken } });
    if (session && session.expires > new Date()) {
      const sessionUser = await prisma.user.findUnique({ where: { id: session.userId } });
      if (sessionUser) {
        if (sessionUser.isAdmin <= 2) {
          canEdit = true; // 관리자
        } else if (!isGuestPost && post.authorId === sessionUser.id) {
          canEdit = true; // 작성자 본인
        } else {
          // 게시판 편집 권한 확인
          const perm = await prisma.boardUserPermission.findUnique({
            where: { userId_boardId: { userId: sessionUser.id, boardId: post.boardId } },
          });
          if (perm?.canEdit) canEdit = true;
        }
      }
    }
  }

  return NextResponse.json({
    id: post.id,
    subject: post.subject,
    content: post.content,
    authorName: post.authorName,
    authorId: post.authorId,
    email: post.email,
    homepage: post.homepage,
    isSecret: post.isSecret,
    isNotice: post.isNotice,
    useHtml: post.useHtml,
    commentPolicy: post.commentPolicy,
    sitelink1: post.sitelink1,
    sitelink2: post.sitelink2,
    categoryId: post.categoryId,
    attachments: post.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      origName: a.origName,
      sortOrder: a.sortOrder,
      downloadCount: a.downloadCount,
      size: a.size,
      mimeType: a.mimeType,
      width: a.width,
      height: a.height,
    })),
    isGuestPost,
    canEdit,
  });
}
