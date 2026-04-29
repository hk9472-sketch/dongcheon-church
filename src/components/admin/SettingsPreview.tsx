"use client";

// 사이트 설정 미리보기 컴포넌트.
//   · activeTab 별로 다른 미리보기 (theme / skin / editor)
//   · CSS var (--theme-nav-from 등) 으로 실제 사이트와 동일한 모양
//   · highlightKey 로 설정 필드 ↔ 미리보기 영역 양방향 강조
//
// 사용:
//   <SettingsPreview type="theme" highlightKey={hover} />
//   <FieldRow data-preview-key="theme_nav_from" onMouseEnter={() => setHover("theme_nav_from")}>...

import React from "react";

interface Props {
  type: "theme" | "widget" | "write" | "editor" | "other";
  highlightKey: string | null;
  onRegionHover?: (key: string | null) => void;
  values: Record<string, string>;
}

// 강조 ring 클래스
const HL = "ring-2 ring-amber-400 ring-offset-1 z-10";

function Region({
  fieldKey,
  match,
  highlightKey,
  onRegionHover,
  className = "",
  style,
  children,
}: {
  fieldKey: string;
  // 추가 매칭 키 — 여러 필드 (예: nav_from, nav_to, nav_font) 가 같은 영역을 강조해야 할 때
  match?: string[];
  highlightKey: string | null;
  onRegionHover?: (k: string | null) => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const allKeys = [fieldKey, ...(match || [])];
  const active = highlightKey !== null && allKeys.includes(highlightKey);
  return (
    <div
      data-preview-key={fieldKey}
      onMouseEnter={() => onRegionHover?.(fieldKey)}
      onMouseLeave={() => onRegionHover?.(null)}
      className={`relative cursor-pointer transition-shadow ${active ? HL : ""} ${className}`}
      style={style}
      title={allKeys.join(", ")}
    >
      {children}
    </div>
  );
}

export default function SettingsPreview({ type, highlightKey, onRegionHover, values }: Props) {
  // CSS var 값 fallback
  const v = (k: string, fb: string) => values[k] || fb;
  const px = (k: string, fb: string) => {
    const x = values[k] || fb;
    return x.endsWith("px") || /[a-z%]$/.test(x) ? x : `${x}px`;
  };

  if (type === "theme") {
    const navFrom = v("theme_nav_from", "#1d4ed8");
    const navTo = v("theme_nav_to", "#4338ca");
    const headerBg = v("theme_header_bg", "#eff6ff");
    const footerFrom = v("theme_footer_from", "#2563eb");
    const footerTo = v("theme_footer_to", "#4338ca");
    const primary = v("theme_primary", "#2563eb");
    const navFont = v("theme_nav_font", "");
    const navFontSize = v("theme_nav_font_size", "14px");

    return (
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm">
        {/* 헤더 영역 */}
        <Region
          fieldKey="theme_header_bg"
          highlightKey={highlightKey}
          onRegionHover={onRegionHover}
          className="px-3 py-3 text-center"
          style={{ backgroundColor: headerBg }}
        >
          <div className="text-base font-bold text-gray-700">동천교회</div>
          <div className="text-xs text-gray-500 mt-0.5">○○ 표어 / 성구</div>
        </Region>

        {/* 네비게이션 그라데이션 */}
        <Region
          fieldKey="theme_nav_from"
          match={["theme_nav_to", "theme_nav_font", "theme_nav_font_size"]}
          highlightKey={highlightKey}
          onRegionHover={onRegionHover}
          className="flex items-center gap-3 px-4 py-2 text-white"
          style={{
            background: `linear-gradient(to right, ${navFrom}, ${navTo})`,
            fontFamily: navFont || "inherit",
            fontSize: navFontSize,
          }}
        >
          {["홈", "공지사항", "교회소식", "성경읽기", "회계"].map((m) => (
            <span key={m} className="hover:underline">
              {m}
            </span>
          ))}
        </Region>

        {/* 본문 샘플 */}
        <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
          <div className="bg-white border border-gray-200 rounded p-3">
            <div className="text-xs text-gray-500 mb-2">본문 영역</div>
            <Region
              fieldKey="theme_primary"
              highlightKey={highlightKey}
              onRegionHover={onRegionHover}
              className="inline-block"
            >
              <button
                className="px-3 py-1 text-xs text-white rounded"
                style={{ backgroundColor: primary }}
              >
                주요 버튼
              </button>
            </Region>
            <span className="ml-2 text-xs" style={{ color: primary }}>
              주요 색상 링크 텍스트
            </span>
          </div>
        </div>

        {/* 푸터 그라데이션 */}
        <Region
          fieldKey="theme_footer_from"
          match={["theme_footer_to"]}
          highlightKey={highlightKey}
          onRegionHover={onRegionHover}
          className="px-4 py-3 text-white text-xs text-center"
          style={{
            background: `linear-gradient(to right, ${footerFrom}, ${footerTo})`,
          }}
        >
          © 동천교회 · 푸터 영역
        </Region>
      </div>
    );
  }

  if (type === "widget") {
    const borderColor = v("skin_widget_border_color", "#d1d5db");
    const borderWidth = px("skin_widget_border_width", "2");
    const dividerColor = v("skin_widget_divider_color", "#d1d5db");
    const dividerWidth = px("skin_widget_divider_width", "2");
    const headerBg = v("skin_widget_header_bg", "#eff6ff");

    const sample = [
      { date: "04/29", subject: "주일 예배 안내", author: "관리자" },
      { date: "04/28", subject: "수요예배 시간 변경", author: "관리자" },
      { date: "04/27", subject: "구역모임 알림", author: "권찰" },
      { date: "04/26", subject: "교회 봄 야유회", author: "총무" },
    ];

    return (
      <div className="space-y-3">
        <Region
          fieldKey="skin_widget_border_color"
          match={["skin_widget_border_width"]}
          highlightKey={highlightKey}
          onRegionHover={onRegionHover}
          className="bg-white rounded-lg overflow-hidden inline-block w-full max-w-md"
          style={{
            border: `${borderWidth} solid ${borderColor}`,
          }}
        >
          {/* 위젯 헤더 */}
          <Region
            fieldKey="skin_widget_header_bg"
            match={["skin_widget_divider_color", "skin_widget_divider_width", "skin_widget_header_padding"]}
            highlightKey={highlightKey}
            onRegionHover={onRegionHover}
            className="px-3 py-1.5 flex items-center justify-between"
            style={{
              backgroundColor: headerBg,
              borderBottom: `${dividerWidth} solid ${dividerColor}`,
            }}
          >
            <Region
              fieldKey="skin_widget_name_color"
              match={[
                "skin_widget_name_font",
                "skin_widget_name_size",
                "skin_widget_name_weight",
                "skin_widget_name_decoration",
                "skin_widget_name_style",
              ]}
              highlightKey={highlightKey}
              onRegionHover={onRegionHover}
              className="inline-block"
            >
              <span
                style={{
                  fontFamily: v("skin_widget_name_font", "") || "inherit",
                  fontSize: v("skin_widget_name_size", "14px"),
                  color: v("skin_widget_name_color", "#1f2937"),
                  fontWeight: v("skin_widget_name_weight", "bold") as React.CSSProperties["fontWeight"],
                }}
              >
                ▶ 공지사항
              </span>
            </Region>
            <Region
              fieldKey="skin_widget_more_color"
              match={[
                "skin_widget_more_font",
                "skin_widget_more_size",
                "skin_widget_more_weight",
                "skin_widget_more_decoration",
                "skin_widget_more_style",
              ]}
              highlightKey={highlightKey}
              onRegionHover={onRegionHover}
              className="inline-block"
            >
              <span
                style={{
                  fontFamily: v("skin_widget_more_font", "") || "inherit",
                  fontSize: v("skin_widget_more_size", "12px"),
                  color: v("skin_widget_more_color", "#111827"),
                }}
              >
                more
              </span>
            </Region>
          </Region>

          {/* 위젯 행 */}
          <ul className="divide-y" style={{ borderColor: dividerColor }}>
            {sample.map((s, i) => (
              <li
                key={i}
                className="flex items-center gap-2 px-3"
                style={{ height: v("skin_widget_row_height", "1.75rem") }}
              >
                <Region
                  fieldKey="skin_widget_date_color"
                  match={[
                    "skin_widget_date_font",
                    "skin_widget_date_size",
                    "skin_widget_date_weight",
                    "skin_widget_date_decoration",
                    "skin_widget_date_style",
                  ]}
                  highlightKey={highlightKey}
                  onRegionHover={onRegionHover}
                  className="inline-block"
                >
                  <span
                    style={{
                      fontFamily: v("skin_widget_date_font", "") || "inherit",
                      fontSize: v("skin_widget_date_size", "12px"),
                      color: v("skin_widget_date_color", "#6b7280"),
                    }}
                  >
                    {s.date}
                  </span>
                </Region>
                <Region
                  fieldKey="skin_widget_post_color"
                  match={[
                    "skin_widget_post_font",
                    "skin_widget_post_size",
                    "skin_widget_post_weight",
                    "skin_widget_post_decoration",
                    "skin_widget_post_style",
                  ]}
                  highlightKey={highlightKey}
                  onRegionHover={onRegionHover}
                  className="flex-1 truncate"
                >
                  <span
                    style={{
                      fontFamily: v("skin_widget_post_font", "") || "inherit",
                      fontSize: v("skin_widget_post_size", "13px"),
                      color: v("skin_widget_post_color", "#1f2937"),
                    }}
                  >
                    {s.subject}
                  </span>
                </Region>
                <Region
                  fieldKey="skin_widget_author_color"
                  match={[
                    "skin_widget_author_font",
                    "skin_widget_author_size",
                    "skin_widget_author_weight",
                    "skin_widget_author_decoration",
                    "skin_widget_author_style",
                  ]}
                  highlightKey={highlightKey}
                  onRegionHover={onRegionHover}
                  className="inline-block"
                >
                  <span
                    style={{
                      fontFamily: v("skin_widget_author_font", "") || "inherit",
                      fontSize: v("skin_widget_author_size", "12px"),
                      color: v("skin_widget_author_color", "#9ca3af"),
                    }}
                  >
                    [{s.author}]
                  </span>
                </Region>
              </li>
            ))}
          </ul>
        </Region>

      </div>
    );
  }

  if (type === "write") {
    const writeBorder = v("skin_write_border_color", "#d1d5db");
    const writeFont = v("skin_write_font", "");
    const writeFontSize = v("skin_write_font_size", "14px");
    const writeFontColor = v("skin_write_font_color", "#1f2937");

    return (
      <Region
        fieldKey="skin_write_border_color"
        match={["skin_write_font", "skin_write_font_size", "skin_write_font_color"]}
        highlightKey={highlightKey}
        onRegionHover={onRegionHover}
        className="bg-white rounded-lg p-3 inline-block w-full max-w-md"
        style={{ border: `1px solid ${writeBorder}` }}
      >
        <input
          value="글 제목"
          readOnly
          className="w-full px-2 py-1.5 mb-2 rounded outline-none"
          style={{
            border: `1px solid ${writeBorder}`,
            fontFamily: writeFont || "inherit",
            fontSize: writeFontSize,
            color: writeFontColor,
          }}
        />
        <textarea
          value="본문이 여기에 표시됩니다.&#10;글꼴/크기/색상 설정이 적용된 미리보기입니다."
          readOnly
          rows={3}
          className="w-full px-2 py-1.5 rounded outline-none resize-none"
          style={{
            border: `1px solid ${writeBorder}`,
            fontFamily: writeFont || "inherit",
            fontSize: writeFontSize,
            color: writeFontColor,
          }}
        />
      </Region>
    );
  }

  if (type === "other") {
    return (
      <div className="text-xs text-gray-500 italic">
        외부 미디어 서버·기타 인프라 설정 — 시각 미리보기 없음.
      </div>
    );
  }

  // editor
  // 에디터 폰트 / 크기 미리보기는 EditorFontsSection 자체가 미리보기 역할이라 별도 작게 추가
  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-white text-sm">
      <div className="text-xs text-gray-500 mb-2">에디터 본문 미리보기</div>
      <div className="prose prose-sm max-w-none">
        <h2>제목 1</h2>
        <p>
          본문 단락 — 에디터 글꼴 설정이 게시글 작성·표시 화면에 적용됩니다.
          <strong> 강조</strong>나 <em>기울임</em>도 같은 스타일로 보입니다.
        </p>
        <ul>
          <li>글머리 기호 항목</li>
          <li>두 번째 항목</li>
        </ul>
      </div>
    </div>
  );
}
