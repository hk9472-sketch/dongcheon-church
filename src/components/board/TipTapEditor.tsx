"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import ResizableImage from "./ResizableImage";
import MediaNode, { detectMediaKind, youtubeEmbedUrl } from "./MediaExtension";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import FontFamily from "@tiptap/extension-font-family";
import Placeholder from "@tiptap/extension-placeholder";
import { useState, useRef, useEffect, useCallback } from "react";

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  /** 이미지 업로드 API 에 전달할 게시판 slug. 없으면 업로드 시도 시 알림. */
  boardSlug?: string;
}

// ─── 색상 팔레트 ───
const COLORS = [
  "#000000", "#434343", "#666666", "#999999", "#cccccc", "#efefef", "#ffffff",
  "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#0000ff",
  "#9900ff", "#ff00ff", "#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3",
  "#d0e0e3", "#cfe2f3", "#d9d2e9", "#ead1dc",
];

// ─── 글자 크기 목록 ───
const FONT_SIZES = [
  { label: "9", value: "9px" },
  { label: "10", value: "10px" },
  { label: "11", value: "11px" },
  { label: "12", value: "12px" },
  { label: "13", value: "13px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "28", value: "28px" },
  { label: "32", value: "32px" },
  { label: "36", value: "36px" },
  { label: "48", value: "48px" },
];

// ─── 글꼴 목록 ───
const FONTS = [
  { label: "기본", value: "" },
  { label: "맑은 고딕", value: "Malgun Gothic" },
  { label: "돋움", value: "Dotum" },
  { label: "굴림", value: "Gulim" },
  { label: "바탕", value: "Batang" },
  { label: "궁서", value: "Gungsuh" },
  { label: "나눔고딕", value: "Nanum Gothic" },
  { label: "나눔명조", value: "Nanum Myeongjo" },
  { label: "Arial", value: "Arial" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Courier New", value: "Courier New" },
  { label: "Georgia", value: "Georgia" },
];

// ─── 드롭다운 ───
function Dropdown({
  label,
  children,
  title,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  title?: string;
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
        title={title}
        onClick={() => setOpen(!open)}
        className="h-7 px-2 text-xs text-gray-700 bg-white border border-gray-300 rounded flex items-center gap-1 hover:bg-gray-50"
      >
        {label}
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 max-h-60 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ─── 툴바 버튼 ───
function TBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center text-xs rounded border transition-colors ${
        active
          ? "bg-blue-100 border-blue-400 text-blue-700"
          : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

// ─── 색상 선택 팝업 ───
function ColorPicker({
  label,
  title,
  onSelect,
}: {
  label: React.ReactNode;
  title: string;
  onSelect: (color: string) => void;
}) {
  return (
    <Dropdown label={label} title={title}>
      <div className="p-2 w-48">
        <div className="grid grid-cols-7 gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onSelect(c)}
              className="w-5 h-5 rounded border border-gray-300 hover:scale-110 transition-transform"
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
        <div className="mt-2 pt-2 border-t">
          <button
            type="button"
            onClick={() => onSelect("")}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            색상 제거
          </button>
        </div>
      </div>
    </Dropdown>
  );
}

// ─── 구분선 ───
function Sep() {
  return <div className="w-px h-5 bg-gray-300 mx-0.5" />;
}

// ═══════════════════════════════════════════════
// 메인 TipTapEditor 컴포넌트
// ═══════════════════════════════════════════════
export default function TipTapEditor({ content, onChange, placeholder, minHeight, boardSlug }: TipTapEditorProps) {
  // minHeight: CSS 픽셀값 (예: "60px", "400px")
  const minH = minHeight || "400px";

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      TextStyle,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      ResizableImage.configure({
        HTMLAttributes: { class: "max-w-full" },
      }),
      MediaNode,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-blue-600 underline" },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder: placeholder || "내용을 입력하세요",
      }),
    ],
    immediatelyRender: false,
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none px-4 py-3 text-gray-800 leading-relaxed",
        style: `min-height: ${minH}`,
      },
    },
  });

  // content prop 변경 시 에디터 동기화 (수정 모드 진입 시)
  const initialContentRef = useRef(content);
  useEffect(() => {
    if (editor && content !== initialContentRef.current) {
      const currentHtml = editor.getHTML();
      if (content !== currentHtml) {
        editor.commands.setContent(content);
        initialContentRef.current = content;
      }
    }
  }, [editor, content]);

  // 이미지 업로드 헬퍼 — 파일을 /api/board/image-upload 로 올리고 에디터에 삽입.
  // boardSlug 가 없으면 실패 (글쓰기 페이지에서 prop 전달 필수).
  const uploadAndInsertImage = useCallback(
    async (file: File): Promise<boolean> => {
      if (!editor) return false;
      if (!boardSlug) {
        alert("이 편집기는 현재 파일 업로드를 지원하지 않습니다.");
        return false;
      }
      if (!file.type.startsWith("image/")) return false;
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("boardSlug", boardSlug);
        const res = await fetch("/api/board/image-upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          alert(`이미지 업로드 실패: ${data.message || res.status}`);
          return false;
        }
        editor.chain().focus().setImage({ src: data.url, alt: file.name }).run();
        return true;
      } catch (e) {
        alert(`이미지 업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
    [editor, boardSlug]
  );

  // 미디어(동영상/오디오) 업로드 — /api/board/media-upload
  const uploadAndInsertMedia = useCallback(
    async (file: File): Promise<boolean> => {
      if (!editor) return false;
      if (!boardSlug) {
        alert("이 편집기는 현재 파일 업로드를 지원하지 않습니다.");
        return false;
      }
      const isVideo = file.type.startsWith("video/");
      const isAudio = file.type.startsWith("audio/");
      if (!isVideo && !isAudio) return false;
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("boardSlug", boardSlug);
        const res = await fetch("/api/board/media-upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          alert(`미디어 업로드 실패: ${data.message || res.status}`);
          return false;
        }
        editor
          .chain()
          .focus()
          .insertContent({
            type: "media",
            attrs: { src: data.url, kind: isVideo ? "video" : "audio", title: file.name },
          })
          .run();
        return true;
      } catch (e) {
        alert(`미디어 업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
    [editor, boardSlug]
  );

  // 툴바 이미지 버튼: 파일 선택창 열기 (여러 장 선택 가능)
  const imageInputRef = useRef<HTMLInputElement>(null);
  const addImage = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  // 툴바 미디어 버튼 — 파일 선택창 열기
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const addMediaFile = useCallback(() => {
    mediaInputRef.current?.click();
  }, []);
  const handleMediaInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      for (const f of files) {
        await uploadAndInsertMedia(f);
      }
      e.target.value = "";
    },
    [uploadAndInsertMedia]
  );

  // 툴바 미디어 URL 버튼 — 외부 mp3/mp4 또는 YouTube 링크 삽입
  const addMediaUrl = useCallback(() => {
    if (!editor) return;
    const url = prompt("동영상/음성 URL을 입력하세요\n(mp4·mp3 직접 링크 또는 YouTube/Vimeo URL)", "https://");
    if (!url || url === "https://") return;
    const kind = detectMediaKind(url);
    if (kind === "video" || kind === "audio") {
      editor.chain().focus().insertContent({ type: "media", attrs: { src: url, kind } }).run();
      return;
    }
    if (kind === "iframe") {
      const embed = youtubeEmbedUrl(url) || url;
      editor
        .chain()
        .focus()
        .insertContent(
          `<p><iframe src="${embed}" width="560" height="315" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></p>`
        )
        .run();
      return;
    }
    // 알 수 없는 URL — 일반 링크로 삽입
    if (confirm("일반 링크로 삽입할까요?")) {
      editor.chain().focus().setLink({ href: url }).insertContent(url).run();
    }
  }, [editor]);
  const handleImageInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      for (const f of files) {
        await uploadAndInsertImage(f);
      }
      e.target.value = ""; // 같은 파일 재선택 허용
    },
    [uploadAndInsertImage]
  );

  // 클립보드 붙여넣기 — 이미지가 있으면 자동 업로드 후 삽입
  useEffect(() => {
    const dom = editor?.view.dom;
    if (!dom) return;
    const handler = async (e: ClipboardEvent) => {
      if (!e.clipboardData || !boardSlug) return;
      const all = Array.from(e.clipboardData.files);
      const images = all.filter((f) => f.type.startsWith("image/"));
      const media = all.filter((f) => f.type.startsWith("video/") || f.type.startsWith("audio/"));
      if (images.length === 0 && media.length === 0) return;
      e.preventDefault();
      for (const f of images) await uploadAndInsertImage(f);
      for (const f of media) await uploadAndInsertMedia(f);
    };
    dom.addEventListener("paste", handler);
    return () => dom.removeEventListener("paste", handler);
  }, [editor, boardSlug, uploadAndInsertImage, uploadAndInsertMedia]);

  // 드래그앤드롭 — 에디터 영역에 이미지 파일 놓으면 자동 업로드
  useEffect(() => {
    const dom = editor?.view.dom;
    if (!dom) return;
    const preventDefault = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const handler = async (e: DragEvent) => {
      if (!e.dataTransfer || !boardSlug) return;
      const all = Array.from(e.dataTransfer.files);
      const images = all.filter((f) => f.type.startsWith("image/"));
      const media = all.filter((f) => f.type.startsWith("video/") || f.type.startsWith("audio/"));
      if (images.length === 0 && media.length === 0) return;
      e.preventDefault();
      for (const f of images) await uploadAndInsertImage(f);
      for (const f of media) await uploadAndInsertMedia(f);
    };
    dom.addEventListener("dragover", preventDefault);
    dom.addEventListener("drop", handler);
    return () => {
      dom.removeEventListener("dragover", preventDefault);
      dom.removeEventListener("drop", handler);
    };
  }, [editor, boardSlug, uploadAndInsertImage, uploadAndInsertMedia]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = prompt("링크 URL을 입력하세요:", previousUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  const addTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="tiptap-editor border border-gray-400 rounded-lg overflow-hidden bg-white">
      {/* ── 툴바 ── */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-300">
        {/* 실행취소/재실행 */}
        <TBtn onClick={() => editor.chain().focus().undo().run()} title="실행취소">
          ↩
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().redo().run()} title="재실행">
          ↪
        </TBtn>

        <Sep />

        {/* 글꼴 */}
        <Dropdown
          label={<span className="text-xs w-16 truncate text-left">글꼴</span>}
          title="글꼴"
        >
          <div className="w-40">
            {FONTS.map((f) => (
              <button
                key={f.value || "default"}
                type="button"
                onClick={() => {
                  if (f.value) {
                    editor.chain().focus().setFontFamily(f.value).run();
                  } else {
                    editor.chain().focus().unsetFontFamily().run();
                  }
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-blue-50"
                style={{ fontFamily: f.value || "inherit" }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Dropdown>

        {/* 글자 크기 */}
        <Dropdown
          label={<span className="text-xs w-7 truncate text-left">{editor.getAttributes("textStyle").fontSize?.replace("px", "") || "14"}</span>}
          title="글자 크기"
        >
          <div className="w-20">
            <button
              type="button"
              onClick={() => editor.chain().focus().unsetFontSize().run()}
              className="block w-full px-3 py-1 text-left text-sm hover:bg-blue-50 text-gray-400"
            >
              기본
            </button>
            {FONT_SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => editor.chain().focus().setFontSize(s.value).run()}
                className="block w-full px-3 py-1 text-left text-sm hover:bg-blue-50"
              >
                {s.label}
              </button>
            ))}
          </div>
        </Dropdown>

        {/* 제목 */}
        <Dropdown
          label={<span className="text-xs w-10 truncate text-left">본문</span>}
          title="문단 스타일"
        >
          <div className="w-32">
            <button
              type="button"
              onClick={() => editor.chain().focus().setParagraph().run()}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-blue-50"
            >
              본문
            </button>
            {([1, 2, 3, 4] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
                className={`block w-full px-3 py-1.5 text-left hover:bg-blue-50 font-bold ${
                  level === 1 ? "text-xl" : level === 2 ? "text-lg" : level === 3 ? "text-base" : "text-sm"
                }`}
              >
                제목 {level}
              </button>
            ))}
          </div>
        </Dropdown>

        <Sep />

        {/* 텍스트 서식 */}
        <TBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="굵게"
        >
          <strong>B</strong>
        </TBtn>
        <TBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="기울임"
        >
          <em>I</em>
        </TBtn>
        <TBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="밑줄"
        >
          <u>U</u>
        </TBtn>
        <TBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="취소선"
        >
          <s>S</s>
        </TBtn>

        <Sep />

        {/* 색상 */}
        <ColorPicker
          label={<span className="text-xs" style={{ color: editor.getAttributes("textStyle").color || "#000" }}>A<span className="text-[8px]">색</span></span>}
          title="글자 색상"
          onSelect={(color) => {
            if (color) {
              editor.chain().focus().setColor(color).run();
            } else {
              editor.chain().focus().unsetColor().run();
            }
          }}
        />
        <ColorPicker
          label={<span className="text-xs">A<span className="text-[8px]">배경</span></span>}
          title="배경 색상"
          onSelect={(color) => {
            if (color) {
              editor.chain().focus().toggleHighlight({ color }).run();
            } else {
              editor.chain().focus().unsetHighlight().run();
            }
          }}
        />

        <Sep />

        {/* 정렬 */}
        <TBtn
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="좌측 정렬"
        >
          ≡
        </TBtn>
        <TBtn
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="중앙 정렬"
        >
          ≡
        </TBtn>
        <TBtn
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="우측 정렬"
        >
          ≡
        </TBtn>

        <Sep />

        {/* 목록 */}
        <TBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="글머리 기호"
        >
          ●
        </TBtn>
        <TBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="번호 목록"
        >
          1.
        </TBtn>

        <Sep />

        {/* 삽입 */}
        <TBtn onClick={addImage} title="이미지 삽입 (붙여넣기·드래그앤드롭도 가능)">
          🖼
        </TBtn>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleImageInputChange}
        />
        <TBtn onClick={addMediaFile} title="동영상/음성 파일 업로드 (드래그앤드롭도 가능)">
          🎬
        </TBtn>
        <input
          ref={mediaInputRef}
          type="file"
          accept="video/*,audio/*"
          multiple
          hidden
          onChange={handleMediaInputChange}
        />
        <TBtn onClick={addMediaUrl} title="동영상/음성 URL 삽입 (mp4·mp3 또는 YouTube/Vimeo)">
          📺
        </TBtn>
        <TBtn
          onClick={addLink}
          active={editor.isActive("link")}
          title="링크 삽입"
        >
          🔗
        </TBtn>
        <TBtn onClick={addTable} title="표 삽입">
          ▦
        </TBtn>
        <TBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="구분선"
        >
          ─
        </TBtn>

        {/* 표 편집 (표 안에 커서가 있을 때만 표시) */}
        {editor.isActive("table") && (
          <>
            <Sep />
            <TBtn
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              title="열 추가"
            >
              +열
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().addRowAfter().run()}
              title="행 추가"
            >
              +행
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().deleteColumn().run()}
              title="열 삭제"
            >
              -열
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().deleteRow().run()}
              title="행 삭제"
            >
              -행
            </TBtn>
            <TBtn
              onClick={() => editor.chain().focus().deleteTable().run()}
              title="표 삭제"
            >
              ✕표
            </TBtn>
          </>
        )}
      </div>

      {/* ── 편집 영역 ── */}
      <EditorContent editor={editor} />
    </div>
  );
}
