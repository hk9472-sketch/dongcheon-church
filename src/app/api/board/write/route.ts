import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import prisma from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { verifyCaptcha } from "@/lib/captcha";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getUploadDir, getRelUploadPath, getUploadRoot } from "@/lib/uploadPath";

// ───── 파일 업로드 검증 상수 ─────
const ALLOWED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".pdf", ".hwp", ".hwpx", ".doc", ".docx",
  ".xls", ".xlsx", ".ppt", ".pptx",
  ".zip", ".txt", ".mp3", ".mp4",
]);

const BLOCKED_EXTENSIONS = new Set([
  ".php", ".phtml", ".js", ".html", ".htm",
  ".svg", ".exe", ".bat", ".sh",
]);

const MAX_UPLOAD_SIZE = (() => {
  const envSize = process.env.MAX_UPLOAD_SIZE ? parseInt(process.env.MAX_UPLOAD_SIZE, 10) : NaN;
  return Number.isFinite(envSize) && envSize > 0 ? envSize : 10 * 1024 * 1024; // 10MB
})();

/** 파일명을 안전하게 정화: alphanumeric + underscore + dot만 허용, 경로 구분자 제거 */
function sanitizeStoredName(stored: string): string {
  // 경로 구분자 및 ..를 제거하고 화이트리스트 외 문자는 언더스코어로 치환
  const base = stored.replace(/[\\/]+/g, "_").replace(/\.\.+/g, ".");
  return base.replace(/[^A-Za-z0-9_.]/g, "_");
}

/** 업로드 파일 검증. 유효하지 않으면 에러 메시지를 반환. */
function validateUploadFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_SIZE) {
    return `첨부파일 크기가 허용치(${Math.floor(MAX_UPLOAD_SIZE / 1024 / 1024)}MB)를 초과합니다.`;
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!ext) {
    return "확장자가 없는 파일은 업로드할 수 없습니다.";
  }
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return `허용되지 않는 파일 형식입니다: ${ext}`;
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `허용되지 않는 파일 형식입니다: ${ext}`;
  }
  return null;
}

// POST /api/board/write (FormData)
export async function POST(request: NextRequest) {
  try {
    // Rate limit: IP당 10회/10분 (CAPTCHA 통과 후에도 스팸 도배 방지)
    const rlIp = getClientIp(request);
    const rl = checkRateLimit(`write:${rlIp}`, 10, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } }
      );
    }

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

    // 세션 확인 (로그인 여부 판단 + 사용자 정보 획득)
    const sessionToken = request.cookies.get("dc_session")?.value;
    let isSessionValid = false;
    let sessionUserId: number | null = null;
    let sessionUserLoginId: string | null = null;
    let sessionUserName: string | null = null;
    let sessionUserLevel = 10;
    let sessionUserIsAdmin = 3;
    if (sessionToken) {
      const session = await prisma.session.findUnique({ where: { sessionToken } });
      if (session && session.expires > new Date()) {
        isSessionValid = true;
        const sUser = await prisma.user.findUnique({ where: { id: session.userId } });
        if (sUser) {
          sessionUserId = sUser.id;
          sessionUserLoginId = sUser.userId;
          sessionUserName = sUser.name;
          sessionUserLevel = sUser.level;
          sessionUserIsAdmin = sUser.isAdmin;
        }
      }
    }

    // 유효성 검사 (로그인 사용자는 이름/비밀번호를 서버측에서 강제하므로 필수 검사에서 제외)
    if (!boardSlug || !subject || !content) {
      return NextResponse.json({ message: "필수 항목을 입력하세요." }, { status: 400 });
    }
    if (!isSessionValid && (!name || !passwordRaw)) {
      return NextResponse.json({ message: "필수 항목을 입력하세요." }, { status: 400 });
    }

    // 비로그인 글쓰기/답글/수정 시 CAPTCHA 검증 — 비회원의 모든 쓰기 경로에서 봇 방어
    if (!isSessionValid) {
      if (!captchaAnswer || !captchaToken || !verifyCaptcha(captchaAnswer, captchaToken)) {
        return NextResponse.json({ message: "보안 문자가 올바르지 않습니다." }, { status: 400 });
      }
    }

    // 게시판 확인
    const board = await prisma.board.findUnique({ where: { slug: boardSlug } });
    if (!board) {
      return NextResponse.json({ message: "게시판이 존재하지 않습니다." }, { status: 404 });
    }

    // ===== 권한 계산 =====
    const effectiveUserLevel = isSessionValid ? sessionUserLevel : 99;
    const isAdminUser = isSessionValid && sessionUserIsAdmin <= 2;

    // 게시판 권한 체크 (수정은 별도 경로 아래에서 체크)
    if (mode === "write") {
      if (!isAdminUser && effectiveUserLevel > board.grantWrite) {
        return NextResponse.json({ message: "글쓰기 권한이 없습니다." }, { status: 403 });
      }
    } else if (mode === "reply") {
      if (!isAdminUser && effectiveUserLevel > board.grantReply) {
        return NextResponse.json({ message: "답글 작성 권한이 없습니다." }, { status: 403 });
      }
    }

    // 공지사항 등록 권한 체크 (write/modify 모드에서 isNotice=true인 경우)
    if (isNotice && (mode === "write" || mode === "modify")) {
      if (!isAdminUser && effectiveUserLevel > board.grantNotice) {
        return NextResponse.json({ message: "공지사항 등록 권한이 없습니다." }, { status: 403 });
      }
    }

    // 작성자 이름 강제: 로그인 사용자는 세션 이름으로 덮어씌움 (사칭 방지)
    const effectiveName = isSessionValid && sessionUserName ? sessionUserName : name;

    // 비밀번호 해시:
    // - 비회원: 작성/수정/삭제·unlock 비번 (필수)
    // - 회원 + 비밀글 + 비번 입력: 비밀글 unlock 비번 (선택, 비로그인자도 비번 알면 열람 가능)
    // - 회원 + 그 외: 비번 저장 안 함
    let hashedPassword: string | null;
    if (!isSessionValid) {
      hashedPassword = await hashPassword(passwordRaw);
    } else if (isSecret && passwordRaw) {
      hashedPassword = await hashPassword(passwordRaw);
    } else {
      hashedPassword = null;
    }

    // ─── 파일 업로드 (다중) ───
    // FormData: "files" 필드에 여러 파일이 들어옴 (HTML: <input type="file" multiple name="files">).
    // 수정 모드: "keepIds" (JSON array) 에 유지할 기존 첨부 id. 포함 안 된 건 삭제.
    const files = formData.getAll("files").filter(
      (f): f is File => f instanceof File && f.size > 0
    );
    const keepIdsRaw = formData.get("keepIds") as string | null;
    const keepIds: number[] = (() => {
      if (!keepIdsRaw) return [];
      try {
        const arr = JSON.parse(keepIdsRaw);
        return Array.isArray(arr) ? arr.filter((n) => typeof n === "number" && Number.isInteger(n)) : [];
      } catch {
        return [];
      }
    })();

    // 파일 검증 먼저 (디스크 기록 전)
    for (const f of files) {
      const err = validateUploadFile(f);
      if (err) return NextResponse.json({ message: err }, { status: 400 });
    }

    // 업로드 디렉터리 보장
    const uploadDir = getUploadDir(boardSlug);
    await mkdir(uploadDir, { recursive: true });

    type NewFile = { fileName: string; origName: string; size: number; mimeType: string | null };

    // 디스크에 저장 (모드에 관계없이 먼저 기록)
    const newFiles: NewFile[] = [];
    let seq = 0;
    for (const f of files) {
      const ext = path.extname(f.name).toLowerCase();
      const storedName = sanitizeStoredName(`${Date.now()}_${++seq}${ext}`);
      const relPath = getRelUploadPath(boardSlug, storedName);
      const buffer = Buffer.from(await f.arrayBuffer());
      await writeFile(path.join(uploadDir, storedName), buffer);
      newFiles.push({
        fileName: relPath,
        origName: f.name,
        size: f.size,
        mimeType: f.type || null,
      });
    }

    // ================================================================
    // 모드별 처리
    // ================================================================

    if (mode === "modify" && parentNo) {
      // ---- 수정 모드 ----
      const existingPost = await prisma.post.findUnique({
        where: { id: parentNo },
        include: { attachments: true },
      });
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
          if (!passwordRaw) {
            return NextResponse.json({ message: "비밀번호가 필요합니다." }, { status: 403 });
          }
          const valid = await verifyPassword(passwordRaw, existingPost.password);
          if (!valid) {
            return NextResponse.json({ message: "비밀번호가 일치하지 않습니다." }, { status: 403 });
          }
        } else {
          return NextResponse.json({ message: "수정 권한이 없습니다." }, { status: 403 });
        }
      }

      // ─── 첨부 재구성 ───
      // 1. keepIds 에 없는 기존 첨부는 DB·디스크에서 삭제
      // 2. keepIds 순서대로 sortOrder 재부여
      // 3. newFiles 를 뒤에 이어서 추가
      const removed = existingPost.attachments.filter((a) => !keepIds.includes(a.id));

      await prisma.$transaction(async (tx) => {
        // 본문 먼저 갱신
        await tx.post.update({
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
            // 회원이 비밀글에 새 unlock 비번 입력한 경우 password 도 갱신.
            // 비번 빈 값이면 기존 password 유지 (필드 미포함).
            ...(isSessionValid && isSecret && passwordRaw
              ? { password: await hashPassword(passwordRaw) }
              : {}),
            ...(isSessionValid && sessionUserId ? {
              lastEditorId: sessionUserId,
              lastEditorUserId: sessionUserLoginId,
              lastEditorName: sessionUserName,
              lastEditedAt: new Date(),
            } : {}),
          },
        });

        // 삭제 대상
        if (removed.length > 0) {
          await tx.postAttachment.deleteMany({
            where: { id: { in: removed.map((a) => a.id) } },
          });
        }

        // keepIds 순서대로 sortOrder 재지정
        for (let i = 0; i < keepIds.length; i++) {
          await tx.postAttachment.update({
            where: { id: keepIds[i] },
            data: { sortOrder: i },
          });
        }

        // 새로 올라온 파일들을 뒤에 append
        for (let i = 0; i < newFiles.length; i++) {
          const nf = newFiles[i];
          await tx.postAttachment.create({
            data: {
              postId: parentNo,
              fileName: nf.fileName,
              origName: nf.origName,
              sortOrder: keepIds.length + i,
              size: nf.size,
              mimeType: nf.mimeType,
            },
          });
        }
      });

      // 디스크 파일 삭제 (DB 트랜잭션 성공 후). 실패해도 응답에는 영향 주지 않음 (고아 파일은 별도 정리 필요 시 스크립트).
      const uploadRoot = getUploadRoot();
      for (const a of removed) {
        try {
          const base = a.fileName.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
          if (base && !base.includes("..")) {
            const abs = path.normalize([uploadRoot, boardSlug, base].join(path.sep));
            if (abs.startsWith(uploadRoot + path.sep)) await unlink(abs).catch(() => {});
          }
        } catch {
          /* ignore */
        }
      }

      return NextResponse.json({ postId: parentNo });
    }

    if (mode === "reply" && parentNo) {
      // ---- 답글 모드 (제로보드 트리 구조) ----
      const parentPost = await prisma.post.findUnique({ where: { id: parentNo } });
      if (!parentPost) {
        return NextResponse.json({ message: "원글이 존재하지 않습니다." }, { status: 404 });
      }

      // headnum/arrangenum 경합 방지: Board 행을 FOR UPDATE 로 직렬화
      const createdId = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM boards WHERE id = ${board.id} FOR UPDATE`;

        const maxArrange = await tx.post.aggregate({
          where: { boardId: board.id, headnum: parentPost.headnum },
          _max: { arrangenum: true },
        });
        const newArrangenum = (maxArrange._max.arrangenum || 0) + 1;

        const created = await tx.post.create({
          data: {
            boardId: board.id,
            headnum: parentPost.headnum,
            arrangenum: newArrangenum,
            depth: parentPost.depth + 1,
            parentId: parentPost.id,
            authorId: sessionUserId,
            authorLevel: sessionUserId ? sessionUserLevel : 10,
            authorName: effectiveName,
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
            attachments: {
              create: newFiles.map((f, i) => ({
                fileName: f.fileName,
                origName: f.origName,
                sortOrder: i,
                size: f.size,
                mimeType: f.mimeType,
              })),
            },
          },
        });

        await tx.board.update({
          where: { id: board.id },
          data: { totalPosts: { increment: 1 } },
        });

        return created.id;
      });

      return NextResponse.json({ postId: createdId });
    }

    // ---- 새 글 모드 ----
    // headnum: 음수 (가장 작은 값 - 1, 최신글일수록 작음)
    // 경합 방지: Board 행을 FOR UPDATE 로 직렬화한 뒤 MIN(headnum) 계산
    const createdId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM boards WHERE id = ${board.id} FOR UPDATE`;

      const minHeadnum = await tx.post.aggregate({
        where: { boardId: board.id },
        _min: { headnum: true },
      });
      const newHeadnum = (minHeadnum._min.headnum || 0) - 1;

      const created = await tx.post.create({
        data: {
          boardId: board.id,
          headnum: newHeadnum,
          arrangenum: 0,
          depth: 0,
          division: 1,
          authorId: sessionUserId,
          authorLevel: sessionUserId ? sessionUserLevel : 10,
          authorName: effectiveName,
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
          attachments: {
            create: newFiles.map((f, i) => ({
              fileName: f.fileName,
              origName: f.origName,
              sortOrder: i,
              size: f.size,
              mimeType: f.mimeType,
            })),
          },
        },
      });

      await tx.board.update({
        where: { id: board.id },
        data: { totalPosts: { increment: 1 } },
      });

      return created.id;
    });

    return NextResponse.json({ postId: createdId });
  } catch (error) {
    console.error("Write error:", error);
    return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
