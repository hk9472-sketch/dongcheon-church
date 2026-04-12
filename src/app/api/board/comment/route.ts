import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";

/** 세션 쿠키에서 사용자 정보를 가져오는 헬퍼 */
async function getSessionUser(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  return prisma.user.findUnique({ where: { id: session.userId } });
}

// POST /api/board/comment - 댓글 작성
export async function POST(request: NextRequest) {
  try {
    const { postId, name, password, content, isSecret } = await request.json();

    if (!postId || !content?.trim()) {
      return NextResponse.json({ message: "필수 항목을 입력하세요." }, { status: 400 });
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      return NextResponse.json({ message: "게시글이 존재하지 않습니다." }, { status: 404 });
    }

    // 댓글 정책 확인
    if (post.commentPolicy === "DISABLED") {
      return NextResponse.json({ message: "이 게시글은 댓글이 허용되지 않습니다." }, { status: 403 });
    }

    // 세션 확인
    const sessionUser = await getSessionUser(request);

    let authorId: number | null = null;
    let authorName = name || "익명";
    let hashedPw: string | null = null;

    if (sessionUser) {
      // 로그인 사용자: authorId 저장, 이름은 회원명 사용
      authorId = sessionUser.id;
      authorName = name || sessionUser.name;
    } else {
      // 비로그인: 이름과 비밀번호 필수
      if (!name?.trim() || !password) {
        return NextResponse.json({ message: "이름과 비밀번호를 입력하세요." }, { status: 400 });
      }
      hashedPw = await hashPassword(password);
    }

    const comment = await prisma.comment.create({
      data: {
        postId,
        authorId,
        authorName,
        password: hashedPw,
        content: content.trim(),
        isSecret: !!isSecret,
        authorIp: request.headers.get("x-forwarded-for")?.split(",")[0] || null,
      },
    });

    // 댓글 수 업데이트
    await prisma.post.update({
      where: { id: postId },
      data: { totalComment: { increment: 1 } },
    });

    return NextResponse.json({ id: comment.id });
  } catch (error) {
    console.error("Comment error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}

// PUT /api/board/comment - 댓글 수정
export async function PUT(request: NextRequest) {
  try {
    const { commentId, password, content } = await request.json();

    if (!commentId || !content?.trim()) {
      return NextResponse.json({ message: "필수 항목을 입력하세요." }, { status: 400 });
    }

    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) {
      return NextResponse.json({ message: "댓글이 존재하지 않습니다." }, { status: 404 });
    }

    // 해당 게시글의 commentPolicy 확인 (관리자는 예외)
    const post = await prisma.post.findUnique({ where: { id: comment.postId } });

    // 세션 기반 권한 확인
    const sessionUser = await getSessionUser(request);
    let hasEditPermission = false;

    if (sessionUser) {
      if (sessionUser.isAdmin <= 2) {
        hasEditPermission = true; // 관리자
      } else if (comment.authorId && comment.authorId === sessionUser.id) {
        // 작성자 본인: commentPolicy 확인
        if (post?.commentPolicy === "ALLOW_EDIT") {
          hasEditPermission = true;
        } else {
          return NextResponse.json({ message: "이 게시글에서는 댓글 수정이 허용되지 않습니다." }, { status: 403 });
        }
      } else {
        // 게시판 수정 권한 확인
        if (post) {
          const perm = await prisma.boardUserPermission.findUnique({
            where: { userId_boardId: { userId: sessionUser.id, boardId: post.boardId } },
          });
          if (perm?.canEdit) hasEditPermission = true;
        }
      }
    }

    if (!hasEditPermission) {
      if (comment.authorId === null && comment.password) {
        // 비회원 댓글: 비밀번호 확인 + commentPolicy 확인
        if (!post || post.commentPolicy !== "ALLOW_EDIT") {
          return NextResponse.json({ message: "이 게시글에서는 댓글 수정이 허용되지 않습니다." }, { status: 403 });
        }
        const valid = await verifyPassword(password, comment.password);
        if (!valid) {
          return NextResponse.json({ message: "비밀번호가 일치하지 않습니다." }, { status: 403 });
        }
      } else {
        return NextResponse.json({ message: "수정 권한이 없습니다." }, { status: 403 });
      }
    }

    await prisma.comment.update({
      where: { id: commentId },
      data: { content: content.trim() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Edit comment error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}

// DELETE /api/board/comment - 댓글 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { commentId, password } = await request.json();

    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) {
      return NextResponse.json({ message: "댓글이 존재하지 않습니다." }, { status: 404 });
    }

    // 세션 기반 권한 확인
    const sessionUser = await getSessionUser(request);
    let hasDeletePermission = false;

    if (sessionUser) {
      if (sessionUser.isAdmin <= 2) {
        hasDeletePermission = true; // 관리자
      } else if (comment.authorId && comment.authorId === sessionUser.id) {
        hasDeletePermission = true; // 작성자 본인
      } else {
        // 게시판 삭제 권한 확인
        const post = await prisma.post.findUnique({ where: { id: comment.postId } });
        if (post) {
          const perm = await prisma.boardUserPermission.findUnique({
            where: { userId_boardId: { userId: sessionUser.id, boardId: post.boardId } },
          });
          if (perm?.canDelete) hasDeletePermission = true;
        }
      }
    }

    if (!hasDeletePermission) {
      if (comment.authorId === null && comment.password) {
        // 비회원 댓글: 비밀번호로 확인
        const valid = await verifyPassword(password, comment.password);
        if (!valid) {
          return NextResponse.json({ message: "비밀번호가 일치하지 않습니다." }, { status: 403 });
        }
      } else {
        return NextResponse.json({ message: "삭제 권한이 없습니다." }, { status: 403 });
      }
    }

    await prisma.comment.delete({ where: { id: commentId } });

    // 댓글 수 감소
    await prisma.post.update({
      where: { id: comment.postId },
      data: { totalComment: { decrement: 1 } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete comment error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
