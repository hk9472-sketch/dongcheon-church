import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import VisitorTracker from "@/components/VisitorTracker";
import prisma from "@/lib/db";
import React from "react";

const SITE_URL = process.env.SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "동천교회",
    template: "%s | 동천교회",
  },
  description: "예수 그리스도의 복음을 전하는 동천교회입니다.",
  icons: {
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "동천교회",
    title: "동천교회",
    description: "예수 그리스도의 복음을 전하는 동천교회입니다.",
    images: [
      {
        url: "/icon-256.png",
        width: 256,
        height: 256,
        alt: "동천교회",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "동천교회",
    description: "예수 그리스도의 복음을 전하는 동천교회입니다.",
    images: ["/icon-256.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
  skin_widget_height: "12rem",
  skin_widget_header_padding: "2px 0",
  skin_widget_rows: "5",
  skin_widget_row_height: "1.75rem",
  skin_widget_gap: "8px",
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
  skin_widget_post_weight: "300",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // DB에서 테마 설정 로드
  let themeStyle: React.CSSProperties = {};
  try {
    const settings = await prisma.siteSetting.findMany({
      where: {
        OR: [
          { key: { startsWith: "theme_" } },
          { key: { startsWith: "skin_" } },
        ],
      },
    });
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const g = (key: string) => settingsMap[key] || THEME_DEFAULTS[key] || SKIN_DEFAULTS[key] || "";

    themeStyle = {
      // 테마
      "--theme-nav-from": g("theme_nav_from"),
      "--theme-nav-to": g("theme_nav_to"),
      "--theme-nav-font": g("theme_nav_font"),
      "--theme-nav-font-size": g("theme_nav_font_size"),
      "--theme-nav-font-color": g("theme_nav_font_color"),
      "--theme-primary": g("theme_primary"),
      "--theme-footer-from": g("theme_footer_from"),
      "--theme-footer-to": g("theme_footer_to"),
      "--theme-header-bg": g("theme_header_bg"),
      // 위젯 스킨
      "--skin-widget-border-color": g("skin_widget_border_color"),
      "--skin-widget-border-width": g("skin_widget_border_width") + "px",
      "--skin-widget-divider-color": g("skin_widget_divider_color"),
      "--skin-widget-divider-width": g("skin_widget_divider_width") + "px",
      "--skin-widget-header-bg": g("skin_widget_header_bg"),
      "--skin-widget-height": g("skin_widget_height"),
      "--skin-widget-header-padding": g("skin_widget_header_padding"),
      "--skin-widget-rows": g("skin_widget_rows"),
      "--skin-widget-row-height": g("skin_widget_row_height"),
      "--skin-widget-gap": g("skin_widget_gap"),
      "--skin-widget-name-font": g("skin_widget_name_font"),
      "--skin-widget-name-size": g("skin_widget_name_size"),
      "--skin-widget-name-color": g("skin_widget_name_color"),
      "--skin-widget-name-weight": g("skin_widget_name_weight"),
      "--skin-widget-name-decoration": g("skin_widget_name_decoration"),
      "--skin-widget-name-style": g("skin_widget_name_style"),
      "--skin-widget-more-font": g("skin_widget_more_font"),
      "--skin-widget-more-size": g("skin_widget_more_size"),
      "--skin-widget-more-color": g("skin_widget_more_color"),
      "--skin-widget-more-weight": g("skin_widget_more_weight"),
      "--skin-widget-more-decoration": g("skin_widget_more_decoration"),
      "--skin-widget-more-style": g("skin_widget_more_style"),
      "--skin-widget-date-font": g("skin_widget_date_font"),
      "--skin-widget-date-size": g("skin_widget_date_size"),
      "--skin-widget-date-color": g("skin_widget_date_color"),
      "--skin-widget-date-weight": g("skin_widget_date_weight"),
      "--skin-widget-date-decoration": g("skin_widget_date_decoration"),
      "--skin-widget-date-style": g("skin_widget_date_style"),
      "--skin-widget-post-font": g("skin_widget_post_font"),
      "--skin-widget-post-size": g("skin_widget_post_size"),
      "--skin-widget-post-color": g("skin_widget_post_color"),
      "--skin-widget-post-weight": g("skin_widget_post_weight"),
      "--skin-widget-post-decoration": g("skin_widget_post_decoration"),
      "--skin-widget-post-style": g("skin_widget_post_style"),
      "--skin-widget-author-font": g("skin_widget_author_font"),
      "--skin-widget-author-size": g("skin_widget_author_size"),
      "--skin-widget-author-color": g("skin_widget_author_color"),
      "--skin-widget-author-weight": g("skin_widget_author_weight"),
      "--skin-widget-author-decoration": g("skin_widget_author_decoration"),
      "--skin-widget-author-style": g("skin_widget_author_style"),
      // 글쓰기 스킨
      "--skin-write-border-color": g("skin_write_border_color"),
      "--skin-write-font": g("skin_write_font"),
      "--skin-write-font-size": g("skin_write_font_size"),
      "--skin-write-font-color": g("skin_write_font_color"),
    } as React.CSSProperties;
  } catch {
    // DB 연결 실패 시 globals.css 기본값 사용
  }

  return (
    <html lang="ko" style={themeStyle}>
      <body className="flex flex-col min-h-dvh bg-gray-50 text-gray-900">
        <VisitorTracker />
        <Header />
        <main className="flex-1 w-full max-w-[1450px] mx-auto px-4 py-2">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
