"use client";

import { useEffect, useState } from "react";
import HelpButton from "@/components/HelpButton";
import MediaBaseUrlSetting from "@/components/admin/MediaBaseUrlSetting";
import MediaFtpSetting from "@/components/admin/MediaFtpSetting";
import LiveWorshipSetting from "@/components/admin/LiveWorshipSetting";
import SettingsPreview from "@/components/admin/SettingsPreview";
import { AdminDbContent } from "@/app/admin/db/page";

// ==================== 테마 (색상) ====================
const THEME_FIELDS = [
  { key: "theme_nav_from", label: "네비 색상 (시작)", desc: "상단 메뉴바 그라데이션 시작 색상" },
  { key: "theme_nav_to", label: "네비 색상 (끝)", desc: "상단 메뉴바 그라데이션 끝 색상" },
  { key: "theme_primary", label: "주요 색상", desc: "버튼, 링크 등 주요 색상" },
  { key: "theme_footer_from", label: "푸터 색상 (시작)", desc: "하단 푸터 그라데이션 시작 색상" },
  { key: "theme_footer_to", label: "푸터 색상 (끝)", desc: "하단 푸터 그라데이션 끝 색상" },
  { key: "theme_header_bg", label: "헤더 배경색", desc: "상단 로고/성구 영역 배경색" },
] as const;

const PRESETS = [
  {
    label: "블루 (기본)",
    colors: {
      theme_nav_from: "#1d4ed8", theme_nav_to: "#4338ca", theme_primary: "#2563eb",
      theme_footer_from: "#2563eb", theme_footer_to: "#4338ca", theme_header_bg: "#eff6ff",
    },
  },
  {
    label: "그린",
    colors: {
      theme_nav_from: "#15803d", theme_nav_to: "#0f766e", theme_primary: "#16a34a",
      theme_footer_from: "#16a34a", theme_footer_to: "#0f766e", theme_header_bg: "#f0fdf4",
    },
  },
  {
    label: "레드",
    colors: {
      theme_nav_from: "#b91c1c", theme_nav_to: "#9f1239", theme_primary: "#dc2626",
      theme_footer_from: "#dc2626", theme_footer_to: "#9f1239", theme_header_bg: "#fff1f2",
    },
  },
  {
    label: "다크",
    colors: {
      theme_nav_from: "#1f2937", theme_nav_to: "#111827", theme_primary: "#3b82f6",
      theme_footer_from: "#1f2937", theme_footer_to: "#111827", theme_header_bg: "#f9fafb",
    },
  },
];

// ==================== 스킨 (위젯/글쓰기) ====================
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

const FONT_OPTIONS = [
  { value: "", label: "(기본 글꼴)" },
  { value: "'Noto Sans KR', sans-serif", label: "Noto Sans KR" },
  { value: "'Nanum Gothic', sans-serif", label: "나눔고딕" },
  { value: "'Nanum Myeongjo', serif", label: "나눔명조" },
  { value: "'Malgun Gothic', sans-serif", label: "맑은 고딕" },
  { value: "'Gulim', sans-serif", label: "굴림" },
  { value: "'Dotum', sans-serif", label: "돋움" },
  { value: "'Batang', serif", label: "바탕" },
  { value: "serif", label: "Serif" },
  { value: "sans-serif", label: "Sans-serif" },
  { value: "monospace", label: "Monospace" },
];

// 위젯 레이아웃 · 외관 관련 설정을 하나의 섹션으로 묶어 상단 배치.
// 폰트 스타일은 SKIN_SECTIONS 가 아닌 별도의 compact 표(아래 FONT_ROLES/FONT_ATTRS)로 그린다.
const SKIN_SECTIONS = [
  {
    title: "위젯 레이아웃",
    fields: [
      { key: "skin_widget_rows", label: "줄 수", type: "number" as const },
      { key: "skin_widget_row_height", label: "줄 높이", type: "size" as const },
      { key: "skin_widget_gap", label: "위젯 간격", type: "size" as const },
      { key: "skin_widget_header_padding", label: "헤더 패딩", type: "size" as const },
    ],
  },
  {
    title: "위젯 외관",
    fields: [
      { key: "skin_widget_border_color", label: "테두리 색상", type: "color" as const },
      { key: "skin_widget_border_width", label: "테두리 두께 (px)", type: "number" as const },
      { key: "skin_widget_divider_color", label: "구분선 색상", type: "color" as const },
      { key: "skin_widget_divider_width", label: "구분선 두께 (px)", type: "number" as const },
      { key: "skin_widget_header_bg", label: "헤더 배경색", type: "color" as const },
    ],
  },
  {
    title: "글쓰기 페이지",
    fields: [
      { key: "skin_write_border_color", label: "테두리 색상", type: "color" as const },
      { key: "skin_write_font", label: "글꼴", type: "font" as const },
      { key: "skin_write_font_size", label: "글자 크기", type: "size" as const },
      { key: "skin_write_font_color", label: "글자 색상", type: "color" as const },
    ],
  },
];

// 위젯 텍스트 스타일을 행(역할) × 열(속성) 표로 표시하기 위한 정의.
// 30개 폰트 필드가 한 화면에 깔끔하게 들어감.
const FONT_ROLES = [
  { prefix: "skin_widget_name", label: "게시판명" },
  { prefix: "skin_widget_more", label: "더보기" },
  { prefix: "skin_widget_date", label: "일자" },
  { prefix: "skin_widget_post", label: "게시글 제목" },
  { prefix: "skin_widget_author", label: "작성자" },
] as const;

const FONT_ATTRS = [
  { suffix: "font", label: "글꼴", type: "font" as const },
  { suffix: "size", label: "크기", type: "size" as const },
  { suffix: "color", label: "색상", type: "color" as const },
  { suffix: "weight", label: "굵기", type: "weight" as const },
  { suffix: "decoration", label: "밑줄", type: "decoration" as const },
  { suffix: "style", label: "이탤릭", type: "fontstyle" as const },
] as const;

// 모든 키의 기본값 통합 맵
const ALL_DEFAULTS: Record<string, string> = {
  ...PRESETS[0].colors,
  theme_nav_font: "",
  theme_nav_font_size: "14px",
  theme_nav_font_color: "#dbeafe",
  ...SKIN_DEFAULTS,
};

type SettingValues = Record<string, string>;

export default function AdminSettingsPage() {
  const [values, setValues] = useState<SettingValues>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"theme" | "widget" | "write" | "editor" | "other" | "db">("theme");
  // 미리보기 ↔ 설정 필드 양방향 hover 매칭용 키
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => setValues(data))
      .catch(() => setMessage({ type: "error", text: "설정을 불러오지 못했습니다." }))
      .finally(() => setLoading(false));
  }, []);

  function applyPreview(vals: SettingValues) {
    const root = document.documentElement;
    Object.entries(vals).forEach(([key, val]) => {
      // 에디터 관련 키(editor_*)는 JSON 문자열이라 CSS var 대상 아님
      if (!key.startsWith("theme_") && !key.startsWith("skin_")) return;
      const cssVar = `--${key.replace(/_/g, "-")}`;
      // border width에는 px 단위 추가
      if (key.endsWith("_width") && val && !val.endsWith("px")) {
        root.style.setProperty(cssVar, val + "px");
      } else {
        root.style.setProperty(cssVar, val);
      }
    });
  }

  function handleChange(key: string, val: string) {
    const next = { ...values, [key]: val };
    setValues(next);
    applyPreview(next);
  }

  function handlePreset(preset: (typeof PRESETS)[number]) {
    const next = { ...values, ...preset.colors };
    setValues(next);
    applyPreview(next);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "저장되었습니다. 페이지를 새로고침하면 모든 사용자에게 적용됩니다." });
      } else {
        setMessage({ type: "error", text: data.message || "저장에 실패했습니다." });
      }
    } catch {
      setMessage({ type: "error", text: "서버 연결에 실패했습니다." });
    } finally {
      setSaving(false);
    }
  }

  // 개별 항목 기본값 복원 버튼
  function ResetBtn({ fieldKey }: { fieldKey: string }) {
    const def = ALL_DEFAULTS[fieldKey];
    if (def === undefined) return null;
    const current = values[fieldKey] ?? "";
    const isDefault = current === def;
    return (
      <button
        type="button"
        title={`기본값: ${def || "(없음)"}`}
        onClick={() => handleChange(fieldKey, def)}
        disabled={isDefault}
        className={`px-1.5 py-0.5 text-[11px] rounded border transition-colors ${
          isDefault
            ? "border-gray-200 text-gray-300 cursor-default"
            : "border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        }`}
      >
        초기화
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <div className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2" />
        불러오는 중...
      </div>
    );
  }

  // 스킨 값 가져오기 (기본값 폴백)
  const sv = (key: string) => values[key] ?? SKIN_DEFAULTS[key] ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">사이트 설정 <HelpButton slug="admin-settings" /></h1>
        <p className="text-sm text-gray-500 mt-1">색상, 위젯 스킨, 글쓰기 페이지 디자인을 관리합니다.</p>
      </div>

      {/* 탭 — 가장 위에 sticky 로 항상 보이게 */}
      <div className="sticky top-0 z-30 -mx-4 px-4 bg-white border-b border-gray-200 flex flex-wrap">
        {[
          { key: "theme", label: "사이트 색상" },
          { key: "widget", label: "위젯" },
          { key: "write", label: "글쓰기" },
          { key: "editor", label: "에디터" },
          { key: "other", label: "기타" },
          { key: "db", label: "DB" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key as typeof activeTab)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 미리보기 — 탭 아래에 표시 (탭별로 내용 바뀜). 탭이 가려지지 않도록 sticky 제거 */}
      <div className="-mx-4 px-4 py-3 bg-gray-50 border-b border-gray-200 mb-2">
        <div className="text-xs text-gray-500 mb-2 flex items-center gap-2">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          미리보기 — 설정 변경 시 페이지 전체와 아래 영역이 즉시 반영됩니다.
          {highlightKey && (
            <span className="ml-auto px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-mono">
              hover: {highlightKey}
            </span>
          )}
        </div>
        <SettingsPreview
          type={activeTab}
          highlightKey={highlightKey}
          onRegionHover={setHighlightKey}
          values={values}
        />
      </div>

      {/* ==================== 사이트 색상 탭 ==================== */}
      {activeTab === "theme" && (
        <>
          {/* 프리셋 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700">색상 프리셋</h2>
            </div>
            <div className="p-5 flex flex-wrap gap-3">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePreset(preset)}
                  className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <span
                    className="inline-block w-4 h-4 rounded-full"
                    style={{ background: `linear-gradient(to right, ${preset.colors.theme_nav_from}, ${preset.colors.theme_nav_to})` }}
                  />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* 색상 편집 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700">색상 직접 설정</h2>
            </div>
            <div className="p-5 space-y-4">
              {THEME_FIELDS.map(({ key, label, desc }) => (
                <div
                  key={key}
                  onMouseEnter={() => setHighlightKey(key)}
                  onMouseLeave={() => setHighlightKey(null)}
                  className={`flex items-center gap-4 px-2 py-1 rounded transition-colors ${
                    highlightKey === key ? "bg-amber-50 ring-1 ring-amber-300" : ""
                  }`}
                >
                  <label className="w-40 shrink-0">
                    <div className="text-sm font-medium text-gray-700">{label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={values[key] || "#000000"}
                      onChange={(e) => handleChange(key, e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                    />
                    <input
                      type="text"
                      value={values[key] || ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                      className="w-28 px-3 py-1.5 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="#000000"
                    />
                    <ResetBtn fieldKey={key} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 메뉴바 글꼴 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700">메뉴바 글꼴</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <label className="w-40 shrink-0 text-sm font-medium text-gray-700">글꼴</label>
                <select
                  value={values.theme_nav_font || ""}
                  onChange={(e) => handleChange("theme_nav_font", e.target.value)}
                  className="w-52 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value} style={{ fontFamily: f.value || "inherit" }}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <ResetBtn fieldKey="theme_nav_font" />
              </div>
              <div className="flex items-center gap-4">
                <label className="w-40 shrink-0 text-sm font-medium text-gray-700">글자 크기</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={values.theme_nav_font_size || "14px"}
                    onChange={(e) => handleChange("theme_nav_font_size", e.target.value)}
                    className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="14px"
                  />
                  <span className="text-xs text-gray-400">예: 12px, 14px, 16px</span>
                  <ResetBtn fieldKey="theme_nav_font_size" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="w-40 shrink-0 text-sm font-medium text-gray-700">글자 색상</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={values.theme_nav_font_color || "#dbeafe"}
                    onChange={(e) => handleChange("theme_nav_font_color", e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                  />
                  <input
                    type="text"
                    value={values.theme_nav_font_color || "#dbeafe"}
                    onChange={(e) => handleChange("theme_nav_font_color", e.target.value)}
                    className="w-28 px-3 py-1.5 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="#dbeafe"
                  />
                  <ResetBtn fieldKey="theme_nav_font_color" />
                </div>
              </div>
            </div>
          </div>

        </>
      )}

      {/* ==================== 위젯 탭 ==================== */}
      {activeTab === "widget" && (
        <>
          {/* 위젯 관련 섹션만 (위젯 레이아웃 + 위젯 외관) */}
          {SKIN_SECTIONS.filter((s) => s.title.includes("위젯")).map((section) => (
            <div key={section.title} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-700">{section.title}</h2>
              </div>
              <div className="p-5 space-y-4">
                {section.fields.map((field) => (
                  <div
                    key={field.key}
                    onMouseEnter={() => setHighlightKey(field.key)}
                    onMouseLeave={() => setHighlightKey(null)}
                    className={`flex items-center gap-4 px-2 py-1 rounded transition-colors ${
                      highlightKey === field.key ? "bg-amber-50 ring-1 ring-amber-300" : ""
                    }`}
                  >
                    <label className="w-36 shrink-0 text-sm font-medium text-gray-700">
                      {field.label}
                    </label>

                    {field.type === "color" && (
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={sv(field.key) || "#000000"}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                        />
                        <input
                          type="text"
                          value={sv(field.key)}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          className="w-28 px-3 py-1.5 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          placeholder="#000000"
                        />
                        <ResetBtn fieldKey={field.key} />
                      </div>
                    )}

                    {field.type === "number" && (
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={sv(field.key)}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          className="w-20 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                        <ResetBtn fieldKey={field.key} />
                      </div>
                    )}

                    {field.type === "font" && (
                      <div className="flex items-center gap-3">
                        <select
                          value={sv(field.key)}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          className="w-52 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                          {FONT_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value} style={{ fontFamily: f.value || "inherit" }}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <ResetBtn fieldKey={field.key} />
                      </div>
                    )}

                    {field.type === "size" && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={sv(field.key)}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          className="w-28 px-3 py-1.5 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          placeholder={SKIN_DEFAULTS[field.key] || "14px"}
                        />
                        <span className="text-xs text-gray-400">
                          {field.key.includes("height") ? "예: 10rem, 12rem, 14rem" : field.key.includes("padding") ? "예: 4px 0, 6px 0" : "예: 12px, 14px, 16px"}
                        </span>
                        <ResetBtn fieldKey={field.key} />
                      </div>
                    )}

                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* ==================== 위젯 텍스트 스타일 (compact 표) ==================== */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700">위젯 텍스트 스타일</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                위젯 내 각 텍스트 역할별 글꼴·크기·색상·굵기 등을 한눈에.
              </p>
            </div>
            <div className="p-3 overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[720px]">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="border border-gray-200 px-2 py-1.5 text-left w-20">역할</th>
                    {FONT_ATTRS.map((a) => (
                      <th key={a.suffix} className="border border-gray-200 px-2 py-1.5 text-left font-medium">
                        {a.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FONT_ROLES.map((role) => (
                    <tr
                      key={role.prefix}
                      onMouseEnter={() => setHighlightKey(`${role.prefix}_color`)}
                      onMouseLeave={() => setHighlightKey(null)}
                      className={
                        highlightKey?.startsWith(role.prefix) ? "bg-amber-50" : ""
                      }
                    >
                      <td className="border border-gray-200 px-2 py-1.5 font-medium text-gray-700 bg-gray-50/50">
                        {role.label}
                      </td>
                      {FONT_ATTRS.map((attr) => {
                        const key = `${role.prefix}_${attr.suffix}`;
                        const val = sv(key);
                        return (
                          <td
                            key={attr.suffix}
                            onMouseEnter={(e) => {
                              e.stopPropagation();
                              setHighlightKey(key);
                            }}
                            className="border border-gray-200 px-1 py-1"
                          >
                            {attr.type === "font" && (
                              <select
                                value={val}
                                onChange={(e) => handleChange(key, e.target.value)}
                                className="w-full text-xs px-1 py-1 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                              >
                                {FONT_OPTIONS.map((f) => (
                                  <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                              </select>
                            )}
                            {attr.type === "size" && (
                              <input
                                type="text"
                                value={val}
                                onChange={(e) => handleChange(key, e.target.value)}
                                className="w-16 text-xs px-1 py-1 border border-gray-200 rounded font-mono focus:outline-none focus:border-blue-400"
                                placeholder={SKIN_DEFAULTS[key] || "14px"}
                              />
                            )}
                            {attr.type === "color" && (
                              <div className="flex items-center gap-1">
                                <input
                                  type="color"
                                  value={val || "#000000"}
                                  onChange={(e) => handleChange(key, e.target.value)}
                                  className="w-7 h-7 rounded cursor-pointer border border-gray-300 p-0"
                                />
                                <input
                                  type="text"
                                  value={val}
                                  onChange={(e) => handleChange(key, e.target.value)}
                                  className="w-20 text-xs px-1 py-1 border border-gray-200 rounded font-mono focus:outline-none focus:border-blue-400"
                                />
                              </div>
                            )}
                            {attr.type === "weight" && (
                              <select
                                value={val}
                                onChange={(e) => handleChange(key, e.target.value)}
                                className="w-full text-xs px-1 py-1 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                              >
                                <option value="300">가늘게</option>
                                <option value="normal">보통</option>
                                <option value="bold">굵게</option>
                              </select>
                            )}
                            {attr.type === "decoration" && (
                              <select
                                value={val}
                                onChange={(e) => handleChange(key, e.target.value)}
                                className="w-full text-xs px-1 py-1 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                              >
                                <option value="none">없음</option>
                                <option value="underline">밑줄</option>
                              </select>
                            )}
                            {attr.type === "fontstyle" && (
                              <select
                                value={val}
                                onChange={(e) => handleChange(key, e.target.value)}
                                className="w-full text-xs px-1 py-1 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                              >
                                <option value="normal">보통</option>
                                <option value="italic">이탤릭</option>
                              </select>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </>
      )}

      {/* ==================== 글쓰기 탭 ==================== */}
      {activeTab === "write" && (
        <>
          {SKIN_SECTIONS.filter((s) => s.title.includes("글쓰기")).map((section) => (
            <div key={section.title} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-700">{section.title}</h2>
              </div>
              <div className="p-5 space-y-4">
                {section.fields.map((field) => (
                  <div
                    key={field.key}
                    onMouseEnter={() => setHighlightKey(field.key)}
                    onMouseLeave={() => setHighlightKey(null)}
                    className={`flex items-center gap-4 px-2 py-1 rounded transition-colors ${
                      highlightKey === field.key ? "bg-amber-50 ring-1 ring-amber-300" : ""
                    }`}
                  >
                    <label className="w-36 shrink-0 text-sm font-medium text-gray-700">
                      {field.label}
                    </label>
                    {field.type === "color" && (
                      <div className="flex items-center gap-3">
                        <input type="color" value={sv(field.key) || "#000000"} onChange={(e) => handleChange(field.key, e.target.value)} className="w-10 h-10 rounded cursor-pointer border border-gray-300" />
                        <input type="text" value={sv(field.key)} onChange={(e) => handleChange(field.key, e.target.value)} className="w-28 px-3 py-1.5 text-sm border border-gray-300 rounded-lg font-mono" placeholder="#000000" />
                        <ResetBtn fieldKey={field.key} />
                      </div>
                    )}
                    {field.type === "font" && (
                      <div className="flex items-center gap-3">
                        <select value={sv(field.key)} onChange={(e) => handleChange(field.key, e.target.value)} className="w-52 px-3 py-1.5 text-sm border border-gray-300 rounded-lg">
                          {FONT_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value} style={{ fontFamily: f.value || "inherit" }}>{f.label}</option>
                          ))}
                        </select>
                        <ResetBtn fieldKey={field.key} />
                      </div>
                    )}
                    {field.type === "size" && (
                      <div className="flex items-center gap-2">
                        <input type="text" value={sv(field.key)} onChange={(e) => handleChange(field.key, e.target.value)} className="w-28 px-3 py-1.5 text-sm border border-gray-300 rounded-lg font-mono" placeholder={SKIN_DEFAULTS[field.key] || "14px"} />
                        <span className="text-xs text-gray-400">예: 12px, 14px, 16px</span>
                        <ResetBtn fieldKey={field.key} />
                      </div>
                    )}
                    {field.type === "number" && (
                      <div className="flex items-center gap-3">
                        <input type="number" min={0} max={10} value={sv(field.key)} onChange={(e) => handleChange(field.key, e.target.value)} className="w-20 px-3 py-1.5 text-sm border border-gray-300 rounded-lg" />
                        <ResetBtn fieldKey={field.key} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ==================== 에디터 탭 ==================== */}
      {activeTab === "editor" && (
        <EditorFontsSection
          value={values.editor_fonts ?? "[]"}
          onChange={(v) => handleChange("editor_fonts", v)}
        />
      )}

      {/* ==================== 기타 탭 ==================== */}
      {activeTab === "other" && (
        <div className="space-y-4">
          <MediaBaseUrlSetting />
          <MediaFtpSetting />
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block w-1 h-5 bg-red-600 rounded-full" />
              <h2 className="text-sm font-bold text-red-700">내계집회중계</h2>
              <span className="text-xs text-gray-400">— 헤더 [내계집회] 버튼 / 실시간 예배 송출 URL</span>
            </div>
            <LiveWorshipSetting />
          </div>
        </div>
      )}

      {/* ==================== DB 탭 (방문자 통계 / 사이트 설정 raw / 방문 로그) ==================== */}
      {activeTab === "db" && <AdminDbContent hideHeader />}

      {/* 공통: 메시지 + 저장/초기화 버튼 */}
      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${
          message.type === "success"
            ? "bg-green-50 border border-green-200 text-green-800"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {message.text}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장하기"}
        </button>
      </div>

    </div>
  );
}

// ============================================================
// 에디터 글꼴 목록 편집 섹션
// ============================================================
// SiteSetting.editor_fonts 는 JSON 배열 문자열 (`[{label,value}, ...]`) 로 저장.
// 이 컴포넌트는 내부적으로 { label, value }[] 로 다루다가 변경 시 stringify 하여
// 부모(handleChange("editor_fonts", ...))로 올린다. 저장 버튼은 상위 페이지가
// 이미 가지고 있으므로 여기선 목록 편집 UI 만 담당.
//
// 목록이 비어 있으면(= 저장값이 "[]") 에디터는 클라이언트의 DEFAULT_FONTS 폴백을 사용한다.
function EditorFontsSection({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  type Font = { label: string; value: string };
  const parseFonts = (raw: string): Font[] => {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (f) => f && typeof f.label === "string" && typeof f.value === "string"
        )
        .map((f) => ({ label: String(f.label), value: String(f.value) }));
    } catch {
      return [];
    }
  };

  const fonts = parseFonts(value);

  function commit(next: Font[]) {
    onChange(JSON.stringify(next));
  }

  function updateField(idx: number, field: "label" | "value", v: string) {
    const next = fonts.map((f, i) => (i === idx ? { ...f, [field]: v } : f));
    commit(next);
  }

  function removeRow(idx: number) {
    commit(fonts.filter((_, i) => i !== idx));
  }

  function addRow() {
    commit([...fonts, { label: "", value: "" }]);
  }

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= fonts.length) return;
    const next = [...fonts];
    [next[idx], next[j]] = [next[j], next[idx]];
    commit(next);
  }

  function resetToBuiltin() {
    // 내장 기본값으로 되돌릴 땐 DB 를 비워(`"[]"`) 클라이언트 DEFAULT_FONTS 가 그대로 쓰이도록.
    commit([]);
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">에디터 글꼴 목록</h2>
        <button
          type="button"
          onClick={resetToBuiltin}
          className="px-3 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-100"
          title="DB 값을 비워 내장 기본 27종이 표시되도록"
        >
          내장 기본으로 되돌리기
        </button>
      </div>

      <div className="p-5 space-y-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          게시글/댓글 에디터의 글꼴 드롭다운에 표시될 항목. <strong>라벨</strong> 은 목록에 보일 이름,
          <strong> 폰트명</strong> 은 실제 CSS font-family 값입니다 (PC 에 설치돼 있어야 렌더됨).
          목록이 비어 있으면 내장 기본 27종이 사용됩니다.
        </p>

        {fonts.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400 bg-gray-50 border border-dashed border-gray-300 rounded">
            저장된 목록이 없어 <strong>내장 기본 27종</strong> 이 에디터에 표시됩니다.
            <br />
            아래 "항목 추가" 로 커스텀 목록을 시작하세요.
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 px-1 text-[11px] text-gray-500 font-medium">
              <span className="w-6" />
              <span className="flex-1">라벨</span>
              <span className="flex-1">폰트명 (font-family)</span>
              <span className="w-24" />
            </div>
            {fonts.map((f, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-6 text-xs text-gray-400 text-right select-none">
                  {idx + 1}
                </span>
                <input
                  type="text"
                  value={f.label}
                  onChange={(e) => updateField(idx, "label", e.target.value)}
                  placeholder="예: 나눔고딕"
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={f.value}
                  onChange={(e) => updateField(idx, "value", e.target.value)}
                  placeholder="예: Nanum Gothic"
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                  style={{ fontFamily: f.value || "inherit" }}
                />
                <div className="w-24 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="w-7 h-7 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="위로"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === fonts.length - 1}
                    className="w-7 h-7 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="아래로"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="w-7 h-7 text-xs border border-gray-300 text-red-600 rounded hover:bg-red-50 hover:border-red-400"
                    title="삭제"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addRow}
          className="w-full px-3 py-2 text-sm text-blue-600 border border-dashed border-blue-300 rounded hover:bg-blue-50"
        >
          + 항목 추가
        </button>
      </div>
    </div>
  );
}
