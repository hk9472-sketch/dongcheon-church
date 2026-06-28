import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { checkAccAccess } from "@/lib/accountAuth";
import {
  FIXED_LEADS,
  buildThanksDataItems,
  buildThanksFooterLine,
  buildThanksListHtml,
  buildThanksPostTitle,
} from "@/lib/thanksOfferingList";

function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}
function toNextDay(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// GET /api/accounting/offering/post-thanks
//   게시판 선택용 목록 (연보 권한자에게 노출). slug/title/grantWrite 반환.
export async function GET() {
  const access = await checkAccAccess("offering");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const boards = await prisma.board.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, slug: true, title: true, grantWrite: true },
  });
  return NextResponse.json({ boards });
}

// POST /api/accounting/offering/post-thanks
//   body: { boardSlug, date }
//   지정 일자의 감사연보 내역을 '등재용' 형식으로 모아 선택한 게시판에 글 등록.
//   작성자 = 로그인 사용자, 제목 = 주일(yyyy년MM월dd일) 감사연보내역
export async function POST(req: NextRequest) {
  const access = await checkAccAccess("offering");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: { boardSlug?: string; date?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }

  const boardSlug = (body.boardSlug || "").trim();
  const date = (body.date || "").trim();
  if (!boardSlug) {
    return NextResponse.json({ error: "게시판을 선택하세요." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(toDateOnly(date).getTime())) {
    return NextResponse.json({ error: "기준일자가 올바르지 않습니다." }, { status: 400 });
  }

  const board = await prisma.board.findUnique({ where: { slug: boardSlug } });
  if (!board) {
    return NextResponse.json({ error: "게시판이 존재하지 않습니다." }, { status: 404 });
  }

  // 작성자 정보 + 쓰기 권한 확인 (연보 권한과 별개로 해당 게시판 글쓰기 권한 필요)
  const author = await prisma.user.findUnique({
    where: { id: access.userId },
    select: { id: true, name: true, userId: true, level: true, isAdmin: true },
  });
  if (!author) {
    return NextResponse.json({ error: "세션이 만료되었습니다." }, { status: 401 });
  }
  const isAdminUser = author.isAdmin <= 2;
  if (!isAdminUser && author.level > board.grantWrite) {
    return NextResponse.json(
      { error: "선택한 게시판에 글쓰기 권한이 없습니다." },
      { status: 403 },
    );
  }

  // 지정 일자 감사연보 내역 조회
  const entries = await prisma.offeringEntry.findMany({
    where: {
      offeringType: "감사연보",
      date: { gte: toDateOnly(date), lt: toNextDay(date) },
    },
    select: { id: true, description: true },
  });

  const dataItems = buildThanksDataItems(entries);
  if (dataItems.length === 0) {
    return NextResponse.json(
      { error: "해당 일자에 등재할 감사연보 내역이 없습니다." },
      { status: 400 },
    );
  }

  // 봉투수(envelopeCount) — 결산 저장돼 있으면 사용, 없으면 0
  const settlement = await prisma.offeringSettlement.findUnique({
    where: { date: toDateOnly(date) },
    select: { envelopeCount: true },
  });
  const envelopeCount = settlement?.envelopeCount ?? 0;

  const totalKinds = FIXED_LEADS.length + dataItems.length;
  const footerLine = buildThanksFooterLine(totalKinds, envelopeCount);
  const content = buildThanksListHtml(date, dataItems, footerLine);
  const subject = buildThanksPostTitle(date);

  // ---- 새 글 생성 (board/write 의 새글 모드와 동일: headnum 직렬화) ----
  const postId = await prisma.$transaction(async (tx) => {
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
        authorId: author.id,
        authorLevel: author.level,
        authorName: author.name,
        subject,
        content,
        useHtml: true,
        isNotice: false,
        isSecret: false,
        commentPolicy: board.defaultCommentPolicy,
      },
    });

    await tx.board.update({
      where: { id: board.id },
      data: { totalPosts: { increment: 1 } },
    });

    return created.id;
  });

  return NextResponse.json({ ok: true, postId, boardSlug, subject });
}
