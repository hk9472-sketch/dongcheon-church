import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyPassword } from "@/lib/auth";

// POST /api/board/delete
export async function POST(request: NextRequest) {
  try {
    const { postId, password } = await request.json();
    if (!postId || typeof postId !== "number") {
      return NextResponse.json({ message: "유효하지 않은 ID" }, { status: 400 });
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      return NextResponse.json({ message: "게시글이 존재하지 않습니다." }, { status: 404 });
    }

    // 세션 기반 권한 확인 (관리자, 게시판 삭제 권한, 작성자 본인)
    let hasDeletePermission = false;
    const sessionToken = request.cookies.get("dc_session")?.value;
    if (sessionToken) {
      const session = await prisma.session.findUnique({ where: { sessionToken } });
      if (session && session.expires > new Date()) {
        const sessionUser = await prisma.user.findUnique({ where: { id: session.userId } });
        if (sessionUser) {
          if (sessionUser.isAdmin <= 2) {
            hasDeletePermission = true; // 관리자
          } else if (post.authorId && post.authorId === sessionUser.id) {
            hasDeletePermission = true; // 작성자 본인
          } else {
            const perm = await prisma.boardUserPermission.findUnique({
              where: { userId_boardId: { userId: sessionUser.id, boardId: post.boardId } },
            });
            if (perm?.canDelete) hasDeletePermission = true; // 게시판 삭제 권한
          }
        }
      }
    }

    // 권한 없으면: 비회원 글(authorId=null)은 비밀번호 확인, 회원 글/로그인 사용자는 거부
    if (!hasDeletePermission) {
      if (post.authorId === null && post.password) {
        // 비회원(ZeroBoard 이관) 글: 비밀번호로 확인
        const valid = await verifyPassword(password, post.password);
        if (!valid) {
          return NextResponse.json({ message: "비밀번호가 일치하지 않습니다." }, { status: 403 });
        }
      } else {
        return NextResponse.json({ message: "삭제 권한이 없습니다." }, { status: 403 });
      }
    }

    // 댓글 먼저 삭제 (cascade가 설정되어 있지만 명시적으로)
    await prisma.comment.deleteMany({ where: { postId: post.id } });

    // 게시글 삭제
    await prisma.post.delete({ where: { id: post.id } });

    // 게시판 글 수 감소
    await prisma.board.update({
      where: { id: post.boardId },
      data: { totalPosts: { decrement: 1 } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
