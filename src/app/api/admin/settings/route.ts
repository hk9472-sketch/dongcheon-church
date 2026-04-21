import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

const THEME_KEYS = [
  "theme_nav_from",
  "theme_nav_to",
  "theme_nav_font",
  "theme_nav_font_size",
  "theme_nav_font_color",
  "theme_primary",
  "theme_footer_from",
  "theme_footer_to",
  "theme_header_bg",
] as const;

const SKIN_KEYS = [
  "skin_widget_border_color",
  "skin_widget_border_width",
  "skin_widget_divider_color",
  "skin_widget_divider_width",
  "skin_widget_header_bg",
  "skin_widget_name_font",
  "skin_widget_name_size",
  "skin_widget_name_color",
  "skin_widget_name_weight",
  "skin_widget_name_decoration",
  "skin_widget_name_style",
  "skin_widget_more_font",
  "skin_widget_more_size",
  "skin_widget_more_color",
  "skin_widget_more_weight",
  "skin_widget_more_decoration",
  "skin_widget_more_style",
  "skin_widget_date_font",
  "skin_widget_date_size",
  "skin_widget_date_color",
  "skin_widget_date_weight",
  "skin_widget_date_decoration",
  "skin_widget_date_style",
  "skin_widget_post_font",
  "skin_widget_post_size",
  "skin_widget_post_color",
  "skin_widget_post_weight",
  "skin_widget_post_decoration",
  "skin_widget_post_style",
  "skin_widget_author_font",
  "skin_widget_author_size",
  "skin_widget_author_color",
  "skin_widget_author_weight",
  "skin_widget_author_decoration",
  "skin_widget_author_style",
  "skin_write_border_color",
  "skin_write_font",
  "skin_write_font_size",
  "skin_write_font_color",
] as const;

// 에디터 키 — JSON 배열 문자열로 저장 ([{label, value}, ...])
const EDITOR_KEYS = ["editor_fonts"] as const;

const ALL_KEYS = [...THEME_KEYS, ...SKIN_KEYS, ...EDITOR_KEYS];

const THEME_DEFAULTS: Record<string, string> = {
  theme_nav_from: "#1d4ed8",
  theme_nav_to: "#4338ca",
  theme_primary: "#2563eb",
  theme_footer_from: "#2563eb",
  theme_footer_to: "#4338ca",
  theme_nav_font: "",
  theme_nav_font_size: "14px",
  theme_nav_font_color: "#dbeafe",
  theme_header_bg: "#eff6ff",
};

const SKIN_DEFAULTS: Record<string, string> = {
  skin_widget_border_color: "#d1d5db",
  skin_widget_border_width: "2",
  skin_widget_divider_color: "#d1d5db",
  skin_widget_divider_width: "2",
  skin_widget_header_bg: "#eff6ff",
  skin_widget_name_font: "",
  skin_widget_name_size: "14px",
  skin_widget_name_color: "#1f2937",
  skin_widget_name_weight: "bold",
  skin_widget_name_decoration: "none",
  skin_widget_name_style: "normal",
  skin_widget_more_font: "",
  skin_widget_more_size: "12px",
  skin_widget_more_color: "#111827",
  skin_widget_more_weight: "normal",
  skin_widget_more_decoration: "none",
  skin_widget_more_style: "normal",
  skin_widget_date_font: "",
  skin_widget_date_size: "12px",
  skin_widget_date_color: "#1f2937",
  skin_widget_date_weight: "normal",
  skin_widget_date_decoration: "none",
  skin_widget_date_style: "normal",
  skin_widget_post_font: "",
  skin_widget_post_size: "14px",
  skin_widget_post_color: "#111827",
  skin_widget_post_weight: "normal",
  skin_widget_post_decoration: "none",
  skin_widget_post_style: "normal",
  skin_widget_author_font: "",
  skin_widget_author_size: "12px",
  skin_widget_author_color: "#1f2937",
  skin_widget_author_weight: "normal",
  skin_widget_author_decoration: "none",
  skin_widget_author_style: "normal",
  skin_write_border_color: "#9ca3af",
  skin_write_font: "",
  skin_write_font_size: "14px",
  skin_write_font_color: "#374151",
};

const EDITOR_DEFAULTS: Record<string, string> = {
  // 빈 배열 = 클라이언트가 TipTapEditor 의 DEFAULT_FONTS 를 사용
  editor_fonts: "[]",
};

const ALL_DEFAULTS: Record<string, string> = { ...THEME_DEFAULTS, ...SKIN_DEFAULTS, ...EDITOR_DEFAULTS };

// 관리자 권한 확인
async function requireAdmin(request: NextRequest) {
  const sessionToken = request.cookies.get("dc_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({ where: { sessionToken } });
  if (!session || session.expires <= new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isAdmin > 2) return null;
  return user;
}

// GET /api/admin/settings - 현재 테마 설정 반환
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const settings = await prisma.siteSetting.findMany({
    where: { key: { in: [...ALL_KEYS] } },
  });

  const result = Object.fromEntries(
    ALL_KEYS.map((key) => [
      key,
      settings.find((s) => s.key === key)?.value ?? ALL_DEFAULTS[key],
    ])
  );

  return NextResponse.json(result);
}

// POST /api/admin/settings - 테마 설정 저장
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = await request.json();

  // 허용된 키만 저장
  const updates = ALL_KEYS.filter((key) => key in body && typeof body[key] === "string");

  await Promise.all(
    updates.map((key) =>
      prisma.siteSetting.upsert({
        where: { key },
        create: { key, value: body[key] },
        update: { value: body[key] },
      })
    )
  );

  return NextResponse.json({ message: "저장되었습니다." });
}
