"use client";

import { useState } from "react";
import Link from "next/link";

export interface WidgetTab {
  key: string;
  title: string;
  icon?: string;
  href: string;
  /** 본문 — 서버 컴포넌트가 미리 렌더해 둔 ReactNode */
  body: React.ReactNode;
}

/**
 * 한 셀(slot) 의 위젯들을 탭으로 묶어 보여주는 클라이언트 컴포넌트.
 * - tabs.length === 1 → 단일 위젯 (탭 헤더 없이 게시판명 + 더보기)
 * - tabs.length >= 2 → 탭 헤더 (선택 탭만 본문 표시)
 */
export default function WidgetSlot({ tabs }: { tabs: WidgetTab[] }) {
  const [active, setActive] = useState(0);
  if (tabs.length === 0) {
    // 빈 셀 — 같은 높이만 차지
    return (
      <div
        className="bg-white rounded-lg shadow-sm overflow-hidden flex flex-col"
        style={{
          border: "var(--skin-widget-border-width) solid var(--skin-widget-border-color)",
          minHeight:
            "calc(var(--skin-widget-row-height, 1.75rem) * var(--skin-widget-rows, 5) + 2rem)",
        }}
      />
    );
  }

  if (tabs.length === 1) {
    const t = tabs[0];
    return (
      <div
        className="bg-white rounded-lg shadow-sm overflow-hidden flex flex-col"
        style={{ border: "var(--skin-widget-border-width) solid var(--skin-widget-border-color)" }}
      >
        <div
          className="flex items-center justify-between px-2.5 sm:px-3 flex-shrink-0"
          style={{
            backgroundColor: "var(--skin-widget-header-bg)",
            borderBottom:
              "var(--skin-widget-divider-width) solid var(--skin-widget-divider-color)",
            padding: "var(--skin-widget-header-padding, 2px 0)",
            paddingLeft: "0.625rem",
            paddingRight: "0.75rem",
          }}
        >
          <Link
            href={t.href}
            className="flex items-center gap-0.5 hover:opacity-80 transition-opacity"
            style={{
              fontFamily: "var(--skin-widget-name-font)",
              fontSize: "var(--skin-widget-name-size)",
              color: "var(--skin-widget-name-color)",
              fontWeight: "var(--skin-widget-name-weight)" as never,
              textDecoration: "var(--skin-widget-name-decoration)" as never,
              fontStyle: "var(--skin-widget-name-style)" as never,
            }}
          >
            <span
              className="flex-shrink-0 text-[11px] leading-none"
              style={{ color: "var(--theme-nav-from)" }}
            >
              ▶
            </span>
            <span>{t.title}</span>
          </Link>
          <Link
            href={t.href}
            className="hover:opacity-80 transition-opacity"
            style={{
              fontFamily: "var(--skin-widget-more-font)",
              fontSize: "var(--skin-widget-more-size)",
              color: "var(--skin-widget-more-color)",
              fontWeight: "var(--skin-widget-more-weight)" as never,
              textDecoration: "var(--skin-widget-more-decoration)" as never,
              fontStyle: "var(--skin-widget-more-style)" as never,
            }}
          >
            더보기 &rsaquo;
          </Link>
        </div>
        {t.body}
      </div>
    );
  }

  // 탭 형식 (2개 이상)
  const activeTab = tabs[active] ?? tabs[0];
  return (
    <div
      className="bg-white rounded-lg shadow-sm overflow-hidden flex flex-col"
      style={{ border: "var(--skin-widget-border-width) solid var(--skin-widget-border-color)" }}
    >
      {/* 탭 헤더 */}
      <div
        className="flex items-stretch flex-shrink-0 overflow-x-auto"
        style={{
          backgroundColor: "var(--skin-widget-header-bg)",
          borderBottom:
            "var(--skin-widget-divider-width) solid var(--skin-widget-divider-color)",
        }}
      >
        {tabs.map((t, i) => {
          const isActive = i === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(i)}
              className={`px-2.5 sm:px-3 py-1 text-xs sm:text-sm whitespace-nowrap transition-colors border-r border-gray-200 last:border-r-0 ${
                isActive
                  ? "bg-white -mb-px border-b-2 border-b-blue-600 font-semibold text-blue-700"
                  : "text-gray-600 hover:bg-white/60"
              }`}
              style={
                isActive
                  ? {
                      fontFamily: "var(--skin-widget-name-font)",
                      fontSize: "var(--skin-widget-name-size)",
                      fontWeight: "var(--skin-widget-name-weight)" as never,
                    }
                  : undefined
              }
              title={t.title}
            >
              {t.title}
            </button>
          );
        })}
        {/* 활성 탭의 더보기 — 우측 정렬 */}
        <Link
          href={activeTab.href}
          className="ml-auto px-2 sm:px-3 flex items-center hover:opacity-80 transition-opacity"
          style={{
            fontFamily: "var(--skin-widget-more-font)",
            fontSize: "var(--skin-widget-more-size)",
            color: "var(--skin-widget-more-color)",
            fontWeight: "var(--skin-widget-more-weight)" as never,
          }}
        >
          더보기 &rsaquo;
        </Link>
      </div>
      {/* 본문 — 모든 탭을 미리 렌더하고 inactive 는 display:none (state 보존) */}
      {tabs.map((t, i) => (
        <div key={t.key} className={i === active ? "flex flex-col" : "hidden"}>
          {t.body}
        </div>
      ))}
    </div>
  );
}
