"use client";

import { RefObject, useState, useRef, useEffect } from "react";

interface HtmlToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  content: string;
  onContentChange: (newContent: string) => void;
}

// 드롭다운 컴포넌트
function Dropdown({
  label,
  items,
  onSelect,
  width = "w-28",
}: {
  label: string;
  items: { label: string; value: string }[];
  onSelect: (value: string) => void;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${width} h-7 px-2 text-xs text-gray-700 bg-white border border-gray-400 rounded flex items-center justify-between hover:border-gray-500 transition-colors`}
      >
        <span className="truncate">{label}</span>
        <svg className="w-3 h-3 text-gray-400 shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 max-h-52 overflow-y-auto min-w-full">
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => { onSelect(item.value); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 색상 팔레트 버튼
function ColorButton({
  icon,
  title,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  onSelect: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const colors = [
    "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff",
    "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff",
    "#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc",
    "#dd7e6b", "#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#a4c2f4", "#9fc5e8", "#b4a7d6", "#d5a6bd",
    "#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0",
    "#a61c00", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6", "#674ea7", "#a64d79",
    "#85200c", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47",
  ];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={title}
        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded transition-colors"
      >
        {icon}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-white border border-gray-300 rounded shadow-lg z-50">
          <div className="grid grid-cols-10 gap-0.5" style={{ width: 200 }}>
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onSelect(c); setOpen(false); }}
                className="w-[18px] h-[18px] rounded-sm border border-gray-200 hover:scale-125 transition-transform"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const custom = prompt("색상 코드 입력 (예: #ff0000):", "#ff0000");
              if (custom) { onSelect(custom); setOpen(false); }
            }}
            className="w-full mt-1.5 px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors text-center"
          >
            직접 입력...
          </button>
        </div>
      )}
    </div>
  );
}

// SVG 아이콘 도우미
const icons = {
  bold: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>,
  italic: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>,
  underline: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>,
  strikethrough: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/></svg>,
  textColor: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 3L5.5 17h2.25l1.12-3h6.25l1.12 3h2.25L13 3h-2zm-1.38 9L12 5.67 14.38 12H9.62z"/>
      <rect x="3" y="19" width="18" height="3" fill="#ff0000"/>
    </svg>
  ),
  bgColor: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15a1.49 1.49 0 000 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10L10 5.21 14.79 10H5.21zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z"/>
      <rect x="3" y="19" width="18" height="3" fill="#ffff00"/>
    </svg>
  ),
  orderedList: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg>,
  unorderedList: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>,
  alignLeft: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>,
  alignCenter: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>,
  alignRight: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>,
  alignJustify: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z"/></svg>,
  image: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>,
  link: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>,
  unlink: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1 0 1.43-.98 2.63-2.31 2.98l1.46 1.46C20.88 15.61 22 13.95 22 12c0-2.76-2.24-5-5-5zm-1 4h-2.19l2 2H16v-2zM2 4.27l3.11 3.11C3.29 8.12 2 9.91 2 12c0 2.76 2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1 0-1.59 1.21-2.9 2.76-3.07L8.73 11H8v2h2.73L13 15.27V17h1.73l4.01 4.01 1.41-1.41L3.41 2.86 2 4.27z"/></svg>,
  hr: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="11" width="18" height="2"/></svg>,
  table: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm0-6H4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4z"/></svg>,
  undo: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>,
  redo: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>,
  code: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>,
  specialChar: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><text x="4" y="18" fontSize="16" fontFamily="serif" fontWeight="bold">Ω</text></svg>,
  indent: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 9h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/></svg>,
  outdent: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11 17h10v-2H11v2zm-8-5l4 4V8l-4 4zm0 9h18v-2H3v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/></svg>,
};

// 글꼴 목록
const fontFamilies = [
  { label: "맑은 고딕", value: "'Malgun Gothic', '맑은 고딕'" },
  { label: "돋움", value: "Dotum, '돋움'" },
  { label: "굴림", value: "Gulim, '굴림'" },
  { label: "바탕", value: "Batang, '바탕'" },
  { label: "궁서", value: "Gungsuh, '궁서'" },
  { label: "나눔고딕", value: "'Nanum Gothic', '나눔고딕'" },
  { label: "나눔명조", value: "'Nanum Myeongjo', '나눔명조'" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
];

// 글자 크기 목록
const fontSizes = [
  { label: "9px", value: "9px" },
  { label: "10px", value: "10px" },
  { label: "11px", value: "11px" },
  { label: "12px", value: "12px" },
  { label: "13px", value: "13px" },
  { label: "14px", value: "14px" },
  { label: "16px", value: "16px" },
  { label: "18px", value: "18px" },
  { label: "20px", value: "20px" },
  { label: "24px", value: "24px" },
  { label: "28px", value: "28px" },
  { label: "32px", value: "32px" },
  { label: "36px", value: "36px" },
  { label: "48px", value: "48px" },
];

// 문단 스타일
const headingStyles = [
  { label: "본문", value: "" },
  { label: "제목 1", value: "h1" },
  { label: "제목 2", value: "h2" },
  { label: "제목 3", value: "h3" },
  { label: "제목 4", value: "h4" },
  { label: "인용문", value: "blockquote" },
];

export default function HtmlToolbar({ textareaRef, content, onContentChange }: HtmlToolbarProps) {
  const [fontFamily, setFontFamily] = useState("맑은 고딕");
  const [fontSize, setFontSize] = useState("16px");
  const [headingStyle, setHeadingStyle] = useState("본문");

  // 선택된 텍스트를 HTML 태그로 감싸기
  function wrapSelection(openTag: string, closeTag: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    const before = content.substring(0, start);
    const after = content.substring(end);
    const newContent = before + openTag + selectedText + closeTag + after;

    onContentChange(newContent);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + openTag.length,
        start + openTag.length + selectedText.length
      );
    });
  }

  // 커서 위치에 태그 삽입
  function insertAtCursor(tag: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const before = content.substring(0, start);
    const after = content.substring(start);

    onContentChange(before + tag + after);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    });
  }

  function handleFontFamily(value: string) {
    const item = fontFamilies.find((f) => f.value === value);
    if (item) setFontFamily(item.label);
    wrapSelection(`<span style="font-family:${value}">`, `</span>`);
  }

  function handleFontSize(value: string) {
    setFontSize(value);
    wrapSelection(`<span style="font-size:${value}">`, `</span>`);
  }

  function handleHeading(value: string) {
    const item = headingStyles.find((h) => h.value === value);
    if (item) setHeadingStyle(item.label);
    if (!value) return;
    if (value === "blockquote") {
      wrapSelection(`<blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#666">`, `</blockquote>`);
    } else {
      wrapSelection(`<${value}>`, `</${value}>`);
    }
  }

  function handleLink() {
    const url = prompt("URL을 입력하세요:", "https://");
    if (url) {
      wrapSelection(`<a href="${url}" target="_blank">`, `</a>`);
    }
  }

  function handleImage() {
    const url = prompt("이미지 URL을 입력하세요:");
    if (url) {
      insertAtCursor(`<img src="${url}" alt="" style="max-width:100%" />`);
    }
  }

  function handleTable() {
    const rows = prompt("행 수:", "3");
    const cols = prompt("열 수:", "3");
    if (!rows || !cols) return;
    const r = parseInt(rows, 10) || 3;
    const c = parseInt(cols, 10) || 3;
    let table = `\n<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">\n`;
    for (let i = 0; i < r; i++) {
      table += "  <tr>\n";
      for (let j = 0; j < c; j++) {
        table += i === 0 ? `    <th>&nbsp;</th>\n` : `    <td>&nbsp;</td>\n`;
      }
      table += "  </tr>\n";
    }
    table += "</table>\n";
    insertAtCursor(table);
  }

  function handleSpecialChar() {
    const chars = "© ® ™ € £ ¥ ¢ § ¶ † ‡ ° ± × ÷ ≠ ≤ ≥ ≈ ∞ ← → ↑ ↓ ↔ ♠ ♣ ♥ ♦ ★ ☆ ♪ ♫ ✓ ✗ • … — –";
    const ch = prompt(`특수문자를 선택하세요:\n\n${chars}\n\n입력할 문자:`);
    if (ch) insertAtCursor(ch);
  }

  // 툴바 버튼 컴포넌트
  function ToolBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded transition-colors"
      >
        {icon}
      </button>
    );
  }

  function Divider() {
    return <div className="w-px h-5 bg-gray-300 mx-0.5 shrink-0" />;
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border border-gray-400 border-b-0 rounded-t-lg">
      {/* 글꼴 */}
      <Dropdown
        label={fontFamily}
        items={fontFamilies}
        onSelect={handleFontFamily}
        width="w-28"
      />

      {/* 글자 크기 */}
      <Dropdown
        label={fontSize}
        items={fontSizes}
        onSelect={handleFontSize}
        width="w-16"
      />

      {/* 문단 스타일 */}
      <Dropdown
        label={headingStyle}
        items={headingStyles}
        onSelect={handleHeading}
        width="w-20"
      />

      <Divider />

      {/* 텍스트 서식 */}
      <ToolBtn icon={icons.bold} title="굵게 (B)" onClick={() => wrapSelection("<b>", "</b>")} />
      <ToolBtn icon={icons.italic} title="기울임 (I)" onClick={() => wrapSelection("<i>", "</i>")} />
      <ToolBtn icon={icons.underline} title="밑줄 (U)" onClick={() => wrapSelection("<u>", "</u>")} />
      <ToolBtn icon={icons.strikethrough} title="취소선 (S)" onClick={() => wrapSelection("<s>", "</s>")} />

      {/* 글자 색상 */}
      <ColorButton
        icon={icons.textColor}
        title="글자 색상"
        onSelect={(c) => wrapSelection(`<span style="color:${c}">`, `</span>`)}
      />

      {/* 배경 색상 */}
      <ColorButton
        icon={icons.bgColor}
        title="배경 색상"
        onSelect={(c) => wrapSelection(`<span style="background-color:${c}">`, `</span>`)}
      />

      <Divider />

      {/* 목록 */}
      <ToolBtn icon={icons.orderedList} title="번호 목록" onClick={() => wrapSelection("<ol>\n  <li>", "</li>\n</ol>")} />
      <ToolBtn icon={icons.unorderedList} title="글머리 기호" onClick={() => wrapSelection("<ul>\n  <li>", "</li>\n</ul>")} />

      <Divider />

      {/* 정렬 */}
      <ToolBtn icon={icons.alignLeft} title="왼쪽 정렬" onClick={() => wrapSelection(`<div style="text-align:left">`, `</div>`)} />
      <ToolBtn icon={icons.alignCenter} title="가운데 정렬" onClick={() => wrapSelection(`<div style="text-align:center">`, `</div>`)} />
      <ToolBtn icon={icons.alignRight} title="오른쪽 정렬" onClick={() => wrapSelection(`<div style="text-align:right">`, `</div>`)} />
      <ToolBtn icon={icons.alignJustify} title="양쪽 정렬" onClick={() => wrapSelection(`<div style="text-align:justify">`, `</div>`)} />

      <Divider />

      {/* 들여쓰기 */}
      <ToolBtn icon={icons.indent} title="들여쓰기" onClick={() => wrapSelection(`<div style="margin-left:40px">`, `</div>`)} />
      <ToolBtn icon={icons.outdent} title="내어쓰기" onClick={() => wrapSelection(`<div style="margin-left:-40px">`, `</div>`)} />

      <Divider />

      {/* 삽입 */}
      <ToolBtn icon={icons.image} title="이미지 삽입" onClick={handleImage} />
      <ToolBtn icon={icons.specialChar} title="특수문자" onClick={handleSpecialChar} />
      <ToolBtn icon={icons.link} title="링크 삽입" onClick={handleLink} />
      <ToolBtn icon={icons.unlink} title="링크 제거" onClick={() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const sel = content.substring(start, end);
        // <a ...>텍스트</a> 패턴에서 텍스트만 추출
        const stripped = sel.replace(/<a[^>]*>(.*?)<\/a>/gi, "$1");
        if (stripped !== sel) {
          const before = content.substring(0, start);
          const after = content.substring(end);
          onContentChange(before + stripped + after);
        }
      }} />

      <Divider />

      {/* 구분선 & 표 */}
      <ToolBtn icon={icons.hr} title="구분선" onClick={() => insertAtCursor("\n<hr />\n")} />
      <ToolBtn icon={icons.table} title="표 삽입" onClick={handleTable} />

      <Divider />

      {/* 실행취소 / 다시실행 (textarea에는 직접 undo/redo가 없으므로 Ctrl+Z 안내) */}
      <ToolBtn icon={icons.undo} title="실행취소 (Ctrl+Z)" onClick={() => {
        textareaRef.current?.focus();
        document.execCommand("undo");
      }} />
      <ToolBtn icon={icons.redo} title="다시실행 (Ctrl+Y)" onClick={() => {
        textareaRef.current?.focus();
        document.execCommand("redo");
      }} />

      <Divider />

      {/* 소스코드 보기 (현재 textarea 자체가 소스 보기) */}
      <ToolBtn icon={icons.code} title="HTML 소스" onClick={() => {
        // HTML 소스 정리 (줄바꿈 추가)
        const formatted = content
          .replace(/></g, ">\n<")
          .replace(/\n\n+/g, "\n\n");
        if (formatted !== content) onContentChange(formatted);
      }} />
    </div>
  );
}
