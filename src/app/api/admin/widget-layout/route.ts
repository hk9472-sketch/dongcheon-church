import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  parseLayout,
  serializeLayout,
  parseTitles,
  isSpecial,
  SPECIAL_LABELS,
  SPECIAL_KEYS,
  BOARD_TITLE_OVERRIDE,
  WIDGET_TITLES_KEY,
  DEFAULT_LAYOUT,
  type WidgetLayout,
  type WidgetTitles,
} from "@/lib/widgetLayout";

async function requireAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

// GET /api/admin/widget-layout
//   현재 레이아웃 + 사용 가능한 항목 목록(게시판 + 특수) 반환
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: "권한 없음" }, { status: 403 });

  const [row, titlesRow] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { key: "widget_layout" } }),
    prisma.siteSetting.findUnique({ where: { key: WIDGET_TITLES_KEY } }),
  ]);
  const layout = parseLayout(row?.value);
  const titles = parseTitles(titlesRow?.value);

  const boards = await prisma.board.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { slug: true, title: true, showOnMain: true },
  });

  // defaultTitle = 오버라이드 없을 때 메인에 뜨는 기본 표시명. title = 실제 적용값(오버라이드 우선).
  const items = [
    ...SPECIAL_KEYS.map((k) => {
      const def = SPECIAL_LABELS[k];
      return { key: k, title: titles[k] || def, defaultTitle: def, special: true as const };
    }),
    ...boards.map((b) => {
      const def = BOARD_TITLE_OVERRIDE[b.slug] || b.title;
      return {
        key: b.slug,
        title: titles[b.slug] || def,
        defaultTitle: def,
        special: false as const,
        showOnMain: b.showOnMain,
      };
    }),
  ];

  return NextResponse.json({ layout, items, titles });
}

// PUT /api/admin/widget-layout
//   body: { layout: WidgetLayout }
export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: "권한 없음" }, { status: 403 });

  let body: { layout?: unknown; titles?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "잘못된 요청" }, { status: 400 });
  }

  if (!Array.isArray(body.layout)) {
    return NextResponse.json({ message: "layout 형식 오류" }, { status: 400 });
  }

  // 위젯 제목 오버라이드 (선택). { 위젯키: 표시명 } — 빈 값/기본값과 같으면 저장 안 함.
  let titles: WidgetTitles | null = null;
  if (body.titles !== undefined) {
    if (body.titles === null || typeof body.titles !== "object" || Array.isArray(body.titles)) {
      return NextResponse.json({ message: "titles 형식 오류" }, { status: 400 });
    }
    titles = {};
    for (const [k, v] of Object.entries(body.titles as Record<string, unknown>)) {
      if (typeof v !== "string") continue;
      const t = v.trim();
      if (!t) continue; // 빈 값 = 기본 표시명 사용
      if (t.length > 40) {
        return NextResponse.json({ message: "제목은 40자 이내" }, { status: 400 });
      }
      titles[k] = t;
    }
  }

  // 정규화: 각 행은 정확히 3 셀, 각 셀은 string 배열
  const normalized: WidgetLayout = [];
  for (const r of body.layout) {
    if (!Array.isArray(r) || r.length !== 3) {
      return NextResponse.json({ message: "각 행은 3 셀이어야 합니다." }, { status: 400 });
    }
    const cells = r.map((c: unknown) => {
      if (!Array.isArray(c)) return [];
      return c.filter((k): k is string => typeof k === "string");
    });
    normalized.push([cells[0] || [], cells[1] || [], cells[2] || []]);
  }
  if (normalized.length === 0) {
    return NextResponse.json({ message: "최소 1행 필요" }, { status: 400 });
  }
  if (normalized.length > 20) {
    return NextResponse.json({ message: "최대 20행" }, { status: 400 });
  }

  // 유효성 — 게시판 slug 가 실제 존재하는지 (특수 키는 통과)
  const allKeys = Array.from(
    new Set(normalized.flat().flatMap((c) => c)),
  );
  const boardSlugs = allKeys.filter((k) => !isSpecial(k));
  if (boardSlugs.length > 0) {
    const found = await prisma.board.findMany({
      where: { slug: { in: boardSlugs } },
      select: { slug: true },
    });
    const foundSet = new Set(found.map((b) => b.slug));
    const missing = boardSlugs.filter((s) => !foundSet.has(s));
    if (missing.length > 0) {
      return NextResponse.json(
        { message: `존재하지 않는 게시판: ${missing.join(", ")}` },
        { status: 400 },
      );
    }
  }

  await prisma.siteSetting.upsert({
    where: { key: "widget_layout" },
    create: { key: "widget_layout", value: serializeLayout(normalized) },
    update: { value: serializeLayout(normalized) },
  });

  // 위젯 제목 오버라이드 저장 (titles 가 전달된 경우만). 키는 특수 키 또는 실재 게시판 slug 만 허용.
  if (titles) {
    const titleKeys = Object.keys(titles);
    const titleBoardSlugs = titleKeys.filter((k) => !isSpecial(k));
    if (titleBoardSlugs.length > 0) {
      const found = await prisma.board.findMany({
        where: { slug: { in: titleBoardSlugs } },
        select: { slug: true },
      });
      const foundSet = new Set(found.map((b) => b.slug));
      for (const k of titleBoardSlugs) {
        if (!foundSet.has(k)) delete titles[k]; // 사라진 게시판 키는 조용히 제거
      }
    }
    await prisma.siteSetting.upsert({
      where: { key: WIDGET_TITLES_KEY },
      create: { key: WIDGET_TITLES_KEY, value: JSON.stringify(titles) },
      update: { value: JSON.stringify(titles) },
    });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/widget-layout — 기본값으로 복원
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: "권한 없음" }, { status: 403 });

  await prisma.siteSetting.upsert({
    where: { key: "widget_layout" },
    create: { key: "widget_layout", value: serializeLayout(DEFAULT_LAYOUT) },
    update: { value: serializeLayout(DEFAULT_LAYOUT) },
  });
  return NextResponse.json({ ok: true, layout: DEFAULT_LAYOUT });
}
