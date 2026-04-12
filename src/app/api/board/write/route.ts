import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { verifyCaptcha } from "@/lib/captcha";

// POST /api/board/write (FormData)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const boardSlug = formData.get("boardSlug") as string;
    const mode = (formData.get("mode") as string) || "write";
    const name = formData.get("name") as string;
    const passwordRaw = formData.get("password") as string;
    const email = (formData.get("email") as string) || null;
    const homepage = (formData.get("homepage") as string) || null;
    const subject = formData.get("subject") as string;
    const content = formData.get("content") as string;
    const isSecret = formData.get("isSecret") === "true";
    const isNotice = formData.get("isNotice") === "true";
    const useHtml = formData.get("useHtml") === "true";
    const commentPolicyRaw = (formData.get("commentPolicy") as string) || "ALLOW";
    const validPolicies = ["ALLOW_EDIT", "ALLOW", "DISABLED"] as const;
    const commentPolicy = validPolicies.includes(commentPolicyRaw as typeof validPolicies[number])
      ? (commentPolicyRaw as typeof validPolicies[number])
      : "ALLOW" as const;
    const sitelink1 = (formData.get("sitelink1") as string) || null;
    const sitelink2 = (formData.get("sitelink2") as string) || null;
    const categoryId = formData.get("categoryId") ? parseInt(formData.get("categoryId") as string, 10) : null;
    const parentNo = formData.get("parentNo") ? parseInt(formData.get("parentNo") as string, 10) : null;

    const captchaAnswer = (formData.get("captchaAnswer") as string) || "";
    const captchaToken = (formData.get("captchaToken") as string) || "";

    // 유효성 검사
    if (!boardSlug || !name || !passwordRaw || !subject || !content) {
      return NextResponse.json({ message: "필수 항목을 입력하세요." }, { status: 400 });
    }

    // 세션 확인 (로그인 여부 판단 + 사용자 정보 획득)
    const sessionToken = request.cookies.get("dc_session")?.value;
    let isSessionValid = false;
    let sessionUserId: number | null = null;
    let sessionUserLevel = 10;
    let sessionUserIsAdmin = 3;
    if (sessionToken) {
      const session = await prisma.session.findUnique({ where: { sessionToken } });
      if (session && session.expires > new Date()) {
        isSessionValid = true;
        const sUser = await prisma.user.findUnique({ where: { id: session.userId } });
        if (sUser) {
          sessionUserId = sUser.id;
          sessionUserLevel = sUser.level;
          sessionUserIsAdmin = sUser.isAdmin;
        }
      }
    }

    // 비로그인 글쓰기/답글 시 CAPTCHA 검증
    if (!isSessionValid && mode !== "modify") {
      if (!captchaAnswer || !captchaToken || !verifyCaptcha(captchaAnswer, captchaToken)) {
        return NextResponse.json({ message: "보안 문자가 올바르지 않습니다." }, { status: 400 });
      }
    }

    // 게시판 확인
    const board = await prisma.board.findUnique({ where: { slug: boardSlug } });
    if (!board) {
      return NextResponse.json({ message: "게시판이 존재하지 않습니다." }, { status: 404 });
    }

    // 비밀번호 해시
    const hashedPassword = await hashPassword(passwordRaw);

    // 파일 업로드 처리
    const file1 = formData.get("file1") as File | null;
    const file2 = formData.get("file2") as File | null;

    let fileName1: string | null = null;
    let origName1: string | null = null;
    let fileName2: string | null = null;
    let origName2: string | null = null;

    // ZeroBoard 구조와 호환: 파일을 data/{boardSlug}/ 에 저장
    // DB에는 "data/{boardSlug}/{fileName}" 형식으로 저장 (download route와 동일 기준)
    const uploadDir = path.join(process.cwd(), "data", boardSlug);
    await mkdir(uploadDir, { recursive: true });

    if (file1 && file1.size > 0) {
      const ext = path.extname(file1.name);
      const storedName = `${Date.now()}_1${ext}`;
      fileName1 = `data/${boardSlug}/${storedName}`;
      origName1 = file1.name;
      const buffer = Buffer.from(await file1.arrayBuffer());
      await writeFile(path.join(uploadDir, storedName), buffer);
    }

    if (file2 && file2.size > 0) {
      const ext = path.extname(file2.name);
      const storedName = `${Date.now()}_2${ext}`;
      fileName2 = `data/${boardSlug}/${storedName}`;
      origName2 = file2.name;
      const buffer = Buffer.from(await file2.arrayBuffer());
      await writeFile(path.join(uploadDir, storedName), buffer);
    }

    // ================================================================
    // 모드별 처리
    // ================================================================

    if (mode === "modify" && parentNo) {
      // ---- 수정 모드 ----
      const existingPost = await prisma.post.findUnique({ where: { id: parentNo } });
      if (!existingPost) {
        return NextResponse.json({ message: "게시글이 존재하지 않습니다." }, { status: 404 });
      }

      // 세션 기반 권한 확인 (관리자, 게시판 수정 권한, 작성자 본인)
      let hasEditPermission = false;
      if (isSessionValid && sessionUserId) {
        if (sessionUserIsAdmin <= 2) {
          hasEditPermission = true; // 관리자
        } else if (existingPost.authorId && existingPost.authorId === sessionUserId) {
          hasEditPermission = true; // 작성자 본인
        } else {
          const perm = await prisma.boardUserPermission.findUnique({
            where: { userId_boardId: { userId: sessionUserId, boardId: board.id } },
          });
          if (perm?.canEdit) hasEditPermission = true; // 게시판 수정 권한
        }
      }

      // 권한 없으면: 비회원 글(authorId=null)은 비밀번호 확인, 회원 글은 거부
      if (!hasEditPermission) {
        if (existingPost.authorId === null && existingPost.password) {
          // 비회원(ZeroBoard 이관) 글: 비밀번호로 확인
          const valid = await verifyPassword(passwordRaw, existingPost.password);
          if (!valid) {
            return NextResponse.json({ message: "비밀번호가 일치하지 않습니다." }, { status: 403 });
          }
        } else {
          return NextResponse.json({ message: "수정 권한이 없습니다." }, { status: 403 });
        }
      }

      const updatedPost = await prisma.post.update({
        where: { id: parentNo },
        data: {
          subject,
          content,
          email,
          homepage,
          isSecret,
          isNotice,
          useHtml,
          sitelink1,
          sitelink2,
          categoryId,
          commentPolicy,
          ...(fileName1 ? { fileName1, origName1 } : {}),
          ...(fileName2 ? { fileName2, origName2 } : {}),
        },
      });

      return NextResponse.json({ postId: updatedPost.id });
    }

    if (mode === "reply" && parentNo) {
      // ---- 답글 모드 (제로보드 트리 구조) ----
      const parentPost = await prisma.post.findUnique({ where: { id: parentNo } });
      if (!parentPost) {
        return NextResponse.json({ message: "원글이 존재하지 않습니다." }, { status: 404 });
      }

      // 같은 headnum 그룹에서 arrangenum 최대값 + 1
      const maxArrange = await prisma.post.aggregate({
        where: { boardId: board.id, headnum: parentPost.headnum },
        _max: { arrangenum: true },
      });
      const newArrangenum = (maxArrange._max.arrangenum || 0) + 1;

      const newPost = await prisma.post.create({
        data: {
          boardId: board.id,
          headnum: parentPost.headnum,
          arrangenum: newArrangenum,
          depth: parentPost.depth + 1,
          parentId: parentPost.id,
          authorId: sessionUserId,
          authorLevel: sessionUserId ? sessionUserLevel : 10,
          authorName: name,
          password: hashedPassword,
          email,
          homepage,
          subject,
          content,
          isSecret,
          useHtml,
          sitelink1,
          sitelink2,
          categoryId,
          commentPolicy,
          fileName1,
          origName1,
          fileName2,
          origName2,
        },
      });

      // 게시판 글 수 업데이트
      await prisma.board.update({
        where: { id: board.id },
        data: { totalPosts: { increment: 1 } },
      });

      return NextResponse.json({ postId: newPost.id });
    }

    // ---- 새 글 모드 ----
    // headnum: 음수 (가장 작은 값 - 1, 최신글일수록 작음)
    const minHeadnum = await prisma.post.aggregate({
      where: { boardId: board.id },
      _min: { headnum: true },
    });
    const newHeadnum = (minHeadnum._min.headnum || 0) - 1;

    const newPost = await prisma.post.create({
      data: {
        boardId: board.id,
        headnum: newHeadnum,
        arrangenum: 0,
        depth: 0,
        division: 1,
        authorId: sessionUserId,
        authorLevel: sessionUserId ? sessionUserLevel : 10,
        authorName: name,
        password: hashedPassword,
        email,
        homepage,
        subject,
        content,
        isSecret,
        isNotice,
        useHtml,
        commentPolicy,
        sitelink1,
        sitelink2,
        categoryId,
        fileName1,
        origName1,
        fileName2,
        origName2,
      },
    });

    // 게시판 글 수 업데이트
    await prisma.board.update({
      where: { id: board.id },
      data: { totalPosts: { increment: 1 } },
    });

    return NextResponse.json({ postId: newPost.id });
  } catch (error) {
    console.error("Write error:", error);
    return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
