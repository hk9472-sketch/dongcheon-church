import { NextResponse } from "next/server";
import prisma from "@/lib/db";

const KEYS = [
  "theme_motto_text",
  "theme_motto_text_font",
  "theme_motto_text_size",
  "theme_motto_text_weight",
  "theme_motto_text_style",
  "theme_motto_subtext",
  "theme_motto_subtext_font",
  "theme_motto_subtext_size",
  "theme_motto_subtext_weight",
  "theme_motto_subtext_style",
  "theme_motto_color",
  "theme_motto_banner_interval",
];

interface TextStyle {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
}

// GET /api/board/motto
//   1) site_settings.theme_motto_text 가 있으면 — 관리자 입력 우선 (text + subtext + 각 스타일)
//   2) 없으면 — DcNotice "표어" 카테고리 최신글 HTML fallback (legacy)
export async function GET() {
  try {
    const settings = await prisma.siteSetting.findMany({
      where: { key: { in: KEYS } },
    });
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    // 기본 문구 — 관리자 미저장 + DcNotice 글 없을 때 사용 (현재 Header 의 fallback 과 동일)
    const DEFAULT_TEXT = "그러나 너는 배우고 확신한 일에 거하라\n네가 뉘게서 배운 것을 알며";
    const DEFAULT_SUBTEXT = "(딤후 3:14)";

    const adminText = (map.theme_motto_text || "").trim();
    const adminSubtext = (map.theme_motto_subtext || "").trim();

    const intervalRaw = map.theme_motto_banner_interval || "0";
    const interval = Number.parseFloat(intervalRaw);
    const bannerInterval = Number.isFinite(interval) ? Math.max(0, interval) : 0;

    const color = map.theme_motto_color || "";
    const textStyle: TextStyle = {
      fontFamily: map.theme_motto_text_font || undefined,
      fontSize: map.theme_motto_text_size || undefined,
      fontWeight: map.theme_motto_text_weight || undefined,
      fontStyle: map.theme_motto_text_style || undefined,
    };
    const subtextStyle: TextStyle = {
      fontFamily: map.theme_motto_subtext_font || undefined,
      fontSize: map.theme_motto_subtext_size || undefined,
      fontWeight: map.theme_motto_subtext_weight || undefined,
      fontStyle: map.theme_motto_subtext_style || undefined,
    };

    if (adminText || adminSubtext) {
      // 관리자 입력 모드 — 평문이라 클라이언트에서 단어 분리/렌더
      return NextResponse.json({
        mode: "admin",
        text: adminText,
        subtext: adminSubtext,
        textStyle,
        subtextStyle,
        color,
        bannerInterval,
        // 호환성: 기존 코드가 content 를 읽고 있으면 합쳐서 제공
        content: [adminText, adminSubtext].filter(Boolean).join(" "),
      });
    }

    // DcNotice "표어" 카테고리 fallback (legacy HTML)
    let legacyContent: string | null = null;
    const board = await prisma.board.findUnique({
      where: { slug: "DcNotice" },
      select: { id: true },
    });
    if (board) {
      const category = await prisma.category.findFirst({
        where: { boardId: board.id, name: "표어" },
      });
      if (category) {
        const post = await prisma.post.findFirst({
          where: { boardId: board.id, categoryId: category.id },
          orderBy: { createdAt: "desc" },
          select: { content: true },
        });
        legacyContent = post?.content || null;
      }
    }

    if (legacyContent) {
      return NextResponse.json({
        mode: "legacy",
        content: legacyContent,
        bannerInterval,
        color,
      });
    }

    // 관리자 미저장 + DcNotice 미존재 — 빌트인 기본 표어/성구 (admin 모드로 반환)
    return NextResponse.json({
      mode: "admin",
      text: DEFAULT_TEXT,
      subtext: DEFAULT_SUBTEXT,
      textStyle,
      subtextStyle,
      color: color || "#6b7280",
      bannerInterval,
      content: `${DEFAULT_TEXT} ${DEFAULT_SUBTEXT}`,
    });
  } catch {
    return NextResponse.json({ mode: "legacy", content: null, bannerInterval: 0, color: "" });
  }
}
