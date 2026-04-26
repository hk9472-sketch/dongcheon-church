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
import MediaRow from "./MediaRow";
import MediaUrlDialog from "./MediaUrlDialog";
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

// XMLHttpRequest 기반 업로드 — fetch 는 upload progress 트래킹 안 됨.
// 큰 미디어 파일 업로드 시 사용자에게 진행률 표시하기 위함.
type XhrResult = { ok: boolean; status: number; data: { url?: string; kind?: string; message?: string } };
function xhrUpload(
  url: string,
  formData: FormData,
  onProgress: (loaded: number, total: number) => void
): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      let data: XhrResult["data"] = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // JSON 아닌 응답 (nginx 413 등) — message 에 일부 노출
        data = { message: xhr.responseText.slice(0, 200) || `HTTP ${xhr.status}` };
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("네트워크 오류"));
    xhr.onabort = () => reject(new Error("업로드 취소됨"));
    xhr.send(formData);
  });
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
// 브라우저 보안상 사용자 PC 에 설치된 폰트를 에디터가 자동으로 열람할 수 없다
// (Local Font Access API 는 Chrome 전용 + 사용자 권한 프롬프트 필요).
// 따라서 한국에서 널리 깔려 있는 한글 폰트 + 일반 웹 폰트를 수동으로 정리.
// 사용자가 목록에 없는 폰트를 쓰려면 "직접 입력" 항목으로 이름을 타이핑한다.
//
// 이 DEFAULT_FONTS 는 DB(SiteSetting.editorFonts) 가 비어 있거나 불러오기 실패 시
// 사용되는 폴백. 런타임에 관리자가 /admin/settings 에서 편집한 목록이 우선.
const DEFAULT_FONTS = [
  { label: "기본", value: "" },
  // ─ 한글 고딕
  { label: "맑은 고딕", value: "Malgun Gothic" },
  { label: "돋움", value: "Dotum" },
  { label: "굴림", value: "Gulim" },
  { label: "나눔고딕", value: "Nanum Gothic" },
  { label: "나눔스퀘어", value: "NanumSquare" },
  { label: "나눔바른고딕", value: "NanumBarunGothic" },
  { label: "Noto Sans KR", value: "Noto Sans KR" },
  { label: "Pretendard", value: "Pretendard" },
  { label: "Spoqa Han Sans", value: "Spoqa Han Sans Neo" },
  // ─ 한글 명조/바탕
  { label: "바탕", value: "Batang" },
  { label: "궁서", value: "Gungsuh" },
  { label: "나눔명조", value: "Nanum Myeongjo" },
  { label: "Noto Serif KR", value: "Noto Serif KR" },
  // ─ 손글씨
  { label: "나눔손글씨 펜", value: "Nanum Pen Script" },
  { label: "나눔손글씨 붓", value: "Nanum Brush Script" },
  // ─ 영문
  { label: "Arial", value: "Arial" },
  { label: "Helvetica", value: "Helvetica" },
  { label: "Tahoma", value: "Tahoma" },
  { label: "Verdana", value: "Verdana" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Georgia", value: "Georgia" },
  { label: "Courier New", value: "Courier New" },
  { label: "Consolas", value: "Consolas" },
  { label: "Comic Sans MS", value: "Comic Sans MS" },
  { label: "Trebuchet MS", value: "Trebuchet MS" },
  { label: "Impact", value: "Impact" },
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

// ─── 표 생성 그리드 피커 (PPT 스타일) ───
function TablePicker({ onInsert, title }: { onInsert: (rows: number, cols: number) => void; title?: string }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const MAX_ROWS = 8;
  const MAX_COLS = 10;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const label = hover.r > 0 && hover.c > 0 ? `${hover.r} × ${hover.c} 표` : "크기 선택";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={title}
        onClick={() => {
          setOpen((v) => !v);
          setHover({ r: 0, c: 0 });
        }}
        className="w-7 h-7 flex items-center justify-center text-xs rounded border transition-colors bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
      >
        ▦
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 p-2">
          <div className="text-[11px] text-gray-600 mb-1 text-center font-medium">{label}</div>
          <div
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 16px)` }}
            onMouseLeave={() => setHover({ r: 0, c: 0 })}
          >
            {Array.from({ length: MAX_ROWS * MAX_COLS }).map((_, idx) => {
              const r = Math.floor(idx / MAX_COLS) + 1;
              const c = (idx % MAX_COLS) + 1;
              const active = r <= hover.r && c <= hover.c;
              return (
                <button
                  key={idx}
                  type="button"
                  onMouseEnter={() => setHover({ r, c })}
                  onClick={() => {
                    onInsert(hover.r || r, hover.c || c);
                    setOpen(false);
                  }}
                  className={`w-4 h-4 border ${
                    active ? "bg-blue-500 border-blue-600" : "bg-gray-50 border-gray-300 hover:bg-gray-200"
                  }`}
                />
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-400">생성 후 열 경계·셀 하단을 드래그해 크기 조절</span>
            <button
              type="button"
              onClick={() => {
                onInsert(3, 3);
                setOpen(false);
              }}
              className="text-[11px] text-blue-600 hover:underline"
            >
              기본 3×3
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// 메인 TipTapEditor 컴포넌트
// ═══════════════════════════════════════════════
export default function TipTapEditor({ content, onChange, placeholder, minHeight, boardSlug }: TipTapEditorProps) {
  // minHeight: CSS 픽셀값 (예: "60px", "400px")
  const minH = minHeight || "400px";

  // 미디어 업로드 진행률 — null 이면 업로드 중 아님.
  const [uploadProgress, setUploadProgress] = useState<{
    name: string;
    loaded: number;
    total: number;
  } | null>(null);

  // 100% 도달 후 서버 처리(NAS FTP 전송) 단계의 경과 시간(초). 1초마다 증가.
  const [processingSeconds, setProcessingSeconds] = useState(0);
  useEffect(() => {
    if (!uploadProgress) {
      setProcessingSeconds(0);
      return;
    }
    if (uploadProgress.loaded < uploadProgress.total || uploadProgress.total === 0) {
      setProcessingSeconds(0);
      return;
    }
    // 100% 도달 → 카운터 시작
    const id = setInterval(() => setProcessingSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [uploadProgress]);

  // 글꼴 목록 — 관리자가 /admin/settings 에서 편집한 DB 값을 우선 사용하고,
  // 비어 있거나 fetch 실패 시 DEFAULT_FONTS 로 폴백.
  const [fonts, setFonts] = useState<typeof DEFAULT_FONTS>(DEFAULT_FONTS);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/editor-fonts")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const dbFonts = Array.isArray(data?.fonts) ? data.fonts : [];
        if (dbFonts.length > 0) {
          setFonts([{ label: "기본", value: "" }, ...dbFonts]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Canvas 측정 기반 설치 여부 감지는 false-negative 가 잦아 제거.
  // (지역화된 폰트 이름 vs CSS 가 매칭하는 Latin 패밀리명 불일치, 폰트 간 글자폭 우연 일치 등)
  // 전 항목을 동일하게 노출하고, 미설치 폰트는 브라우저가 fallback 으로 자연스럽게 처리하도록 맡김.

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
      MediaRow,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-blue-600 underline" },
      }),
      // resizable: true → 컬럼 경계를 마우스로 드래그해 폭 조정.
      // 행 높이는 CSS resize: vertical 로 셀마다 개별 조절(아래 globals.css 참고).
      Table.configure({ resizable: true, handleWidth: 6, cellMinWidth: 40 }),
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

  // content prop 변경 시 에디터 동기화.
  // 과거 구현은 initialContentRef 를 사용자 타이핑 중에 갱신하지 않아,
  // 제출 후 부모가 setContent("") 해도 비교가 "" !== "" 로 스킵돼 에디터가 비워지지 않았다.
  // 단순히 editor.getHTML() 과 직접 비교하면 타이핑 루프는 자동으로 no-op 이 되고
  // 외부 리셋은 정상적으로 반영된다.
  useEffect(() => {
    if (!editor) return;
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content);
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
        // 이미지 뒤에 zero-width space(U+200B) 를 삽입해 IME 버퍼 확보.
        // ProseMirror + 한글 IME 는 atomic inline 노드(이미지) 바로 뒤에서 조합 중인
        // 문자가 깨지는 알려진 이슈가 있어, 보이지 않는 텍스트 노드를 하나 두면 예방된다.
        // 사용자가 공백을 수동으로 치지 않아도 곧바로 한글 입력이 정상 작동.
        editor
          .chain()
          .focus()
          .setImage({ src: data.url, alt: file.name })
          .insertContent("\u200B")
          .run();
        return true;
      } catch (e) {
        alert(`이미지 업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
    [editor, boardSlug]
  );

  // 미디어(동영상/오디오) 업로드 — /api/board/media-upload (XHR + 진행률)
  // dateBase: "YYYY-MM-DD" — 통합 모달에서 사용자가 지정한 기준일자.
  //          이 값이 있으면 폴더가 그 날짜의 YYYY/MM 으로 결정.
  const uploadAndInsertMedia = useCallback(
    async (
      file: File,
      mode: "general" | "realtime" = "general",
      dateBase?: string
    ): Promise<boolean> => {
      if (!editor) return false;
      if (!boardSlug) {
        alert("이 편집기는 현재 파일 업로드를 지원하지 않습니다.");
        return false;
      }
      const isVideo = file.type.startsWith("video/");
      const isAudio = file.type.startsWith("audio/");
      if (!isVideo && !isAudio) return false;
      setUploadProgress({ name: file.name, loaded: 0, total: file.size });
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("boardSlug", boardSlug);
        fd.append("mode", mode);
        if (dateBase) fd.append("dateBase", dateBase);
        const { ok, status, data } = await xhrUpload(
          "/api/board/media-upload",
          fd,
          (loaded, total) => setUploadProgress({ name: file.name, loaded, total })
        );
        if (!ok) {
          alert(`미디어 업로드 실패: ${data.message || status}`);
          return false;
        }
        editor
          .chain()
          .focus()
          .insertContent({
            type: "media",
            attrs: {
              src: data.url,
              kind: isVideo ? "video" : "audio",
              title: file.name,
              width: isVideo ? "60%" : "400px",
              align: "left",
            },
          })
          .run();
        return true;
      } catch (e) {
        alert(`미디어 업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      } finally {
        setUploadProgress(null);
      }
    },
    [editor, boardSlug]
  );

  // 툴바 이미지 버튼: 파일 선택창 열기 (여러 장 선택 가능)
  const imageInputRef = useRef<HTMLInputElement>(null);
  const addImage = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  // 툴바 미디어 버튼 — 파일 선택창 열기 (일반 모드)
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const addMediaFile = useCallback(() => {
    mediaInputRef.current?.click();
  }, []);

  // (실시간 미디어 / URL 입력은 통합 모달 MediaUrlDialog 로 대체됨)

  // 툴바 "여러 개 나란히" 버튼 — 이미지+미디어 다중 선택해 MediaRow 한 덩어리로 삽입.
  const rowInputRef = useRef<HTMLInputElement>(null);
  const addMediaRow = useCallback(() => {
    rowInputRef.current?.click();
  }, []);

  // 파일을 업로드만 하고 URL 을 돌려주는 헬퍼 (에디터에 삽입은 호출자가 담당)
  const uploadImageOnly = useCallback(
    async (file: File): Promise<string | null> => {
      if (!boardSlug) {
        alert("이 편집기는 현재 파일 업로드를 지원하지 않습니다.");
        return null;
      }
      if (!file.type.startsWith("image/")) return null;
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("boardSlug", boardSlug);
        const res = await fetch("/api/board/image-upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          alert(`이미지 업로드 실패: ${data.message || res.status}`);
          return null;
        }
        return data.url as string;
      } catch (e) {
        alert(`이미지 업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    },
    [boardSlug]
  );

  const uploadMediaOnly = useCallback(
    async (file: File): Promise<{ url: string; kind: "video" | "audio" } | null> => {
      if (!boardSlug) {
        alert("이 편집기는 현재 파일 업로드를 지원하지 않습니다.");
        return null;
      }
      const isVideo = file.type.startsWith("video/");
      const isAudio = file.type.startsWith("audio/");
      if (!isVideo && !isAudio) return null;
      setUploadProgress({ name: file.name, loaded: 0, total: file.size });
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("boardSlug", boardSlug);
        const { ok, status, data } = await xhrUpload(
          "/api/board/media-upload",
          fd,
          (loaded, total) => setUploadProgress({ name: file.name, loaded, total })
        );
        if (!ok) {
          alert(`미디어 업로드 실패: ${data.message || status}`);
          return null;
        }
        return { url: data.url as string, kind: isVideo ? "video" : "audio" };
      } catch (e) {
        alert(`미디어 업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      } finally {
        setUploadProgress(null);
      }
    },
    [boardSlug]
  );

  // 이미지+미디어 파일 여러 개를 업로드 후 MediaRow 한 덩어리로 삽입.
  const handleRowInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      e.target.value = "";
      if (!editor || files.length === 0) return;

      // 업로드 순서대로 자식 노드 구성 (선택 순서 유지)
      const children: Array<Record<string, unknown>> = [];
      for (const f of files) {
        if (f.type.startsWith("image/")) {
          const url = await uploadImageOnly(f);
          if (url) children.push({ type: "image", attrs: { src: url, alt: f.name } });
        } else if (f.type.startsWith("video/") || f.type.startsWith("audio/")) {
          const r = await uploadMediaOnly(f);
          if (r) {
            children.push({
              type: "media",
              attrs: { src: r.url, kind: r.kind, title: f.name, width: null, align: "left" },
            });
          }
        }
      }
      if (children.length === 0) return;
      editor
        .chain()
        .focus()
        .insertContent({ type: "mediaRow", content: children })
        .insertContent("\u200B")
        .run();
    },
    [editor, uploadImageOnly, uploadMediaOnly]
  );
  const handleMediaInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      for (const f of files) {
        await uploadAndInsertMedia(f, "general");
      }
      e.target.value = "";
    },
    [uploadAndInsertMedia]
  );
  // 툴바 미디어 URL 버튼 — 외부 mp3/mp4 또는 YouTube 링크 삽입.
  // 미디어 URL 삽입 — React 모달(MediaUrlDialog)로 대체.
  // 기본 URL(사이트 설정) prefix + 경로/파일명 입력 패턴을 지원.
  const [mediaUrlOpen, setMediaUrlOpen] = useState(false);
  const addMediaUrl = useCallback(() => setMediaUrlOpen(true), []);
  const handleMediaUrlSubmit = useCallback(
    (url: string) => {
      if (!editor || !url) return;
      const kind = detectMediaKind(url);
      if (kind === "video" || kind === "audio") {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "media",
            attrs: { src: url, kind, width: kind === "audio" ? "400px" : "60%", align: "left" },
          })
          .run();
        return;
      }
      if (kind === "iframe") {
        const embed = youtubeEmbedUrl(url) || url;
        editor
          .chain()
          .focus()
          .insertContent({
            type: "media",
            attrs: { src: embed, kind: "iframe", width: "60%", align: "left" },
          })
          .run();
        return;
      }
      if (confirm("미디어로 인식할 수 없습니다. 일반 텍스트 링크로 삽입할까요?")) {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: url,
            marks: [{ type: "link", attrs: { href: url, target: "_blank", rel: "noopener noreferrer" } }],
          })
          .run();
      }
    },
    [editor]
  );
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

  // 링크: 빈 선택이면 새 링크를 텍스트로 삽입(인접 링크 영향 없음),
  //       선택된 텍스트가 있으면 해당 범위에만 적용.
  const addLink = useCallback(() => {
    if (!editor) return;
    const { empty } = editor.state.selection;
    if (empty) {
      const url = prompt("링크 URL을 입력하세요:", "https://");
      if (!url || url === "https://") return;
      const text = prompt("표시할 텍스트(공백 시 URL 그대로):", url) || url;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text,
          marks: [{ type: "link", attrs: { href: url, target: "_blank", rel: "noopener noreferrer" } }],
        })
        .run();
      return;
    }
    // 선택된 텍스트가 있을 때만 기존 링크 mark 갱신
    const previousUrl = editor.getAttributes("link").href;
    const url = prompt("링크 URL을 입력하세요:", previousUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url, target: "_blank", rel: "noopener noreferrer" }).run();
    }
  }, [editor]);

  const addTable = useCallback(
    (rows: number, cols: number) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertTable({ rows, cols, withHeaderRow: true })
        .run();
    },
    [editor]
  );

  if (!editor) return null;

  return (
    // overflow-hidden 제거 — 이게 있으면 툴바 드롭다운이 에디터 하단에서 잘린다
    // (특히 댓글처럼 에디터 높이가 작은 곳). 둥근 모서리는 toolbar 의 rounded-t-lg
    // 과 ProseMirror 영역의 .tiptap-editor CSS 로 처리.
    <div className="tiptap-editor border border-gray-400 rounded-lg bg-white">
      <MediaUrlDialog
        open={mediaUrlOpen}
        onClose={() => setMediaUrlOpen(false)}
        onSubmit={handleMediaUrlSubmit}
        onUpload={async (file, dateBase) => {
          await uploadAndInsertMedia(file, "realtime", dateBase);
        }}
      />
      {/* 미디어 업로드 진행률 — 화면 정중앙 모달
         두 단계 표시:
         1) 사용자 → 서버 업로드 (loaded/total 로 정확한 %)
         2) 서버 → NAS FTP 전송 (서버 응답 대기, indeterminate 애니메이션 + 경과시간) */}
      {uploadProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-white border border-gray-300 rounded-xl shadow-2xl p-6">
            <div className="text-base font-semibold text-gray-800 mb-4 break-all">
              📤 {uploadProgress.name}
            </div>

            {/* 1단계: 업로드 (정확한 %) */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span>① 서버로 업로드</span>
                <span className="tabular-nums">
                  {(uploadProgress.loaded / 1024 / 1024).toFixed(1)} MB /{" "}
                  {(uploadProgress.total / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-[width] duration-200"
                    style={{
                      width: `${
                        uploadProgress.total > 0
                          ? Math.min(100, (uploadProgress.loaded / uploadProgress.total) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="text-xl font-bold text-blue-600 tabular-nums w-14 text-right">
                  {uploadProgress.total > 0
                    ? Math.floor((uploadProgress.loaded / uploadProgress.total) * 100)
                    : 0}
                  %
                </span>
              </div>
            </div>

            {/* 2단계: 서버 처리 (NAS FTP 전송) — 100% 도달 후 표시 */}
            {uploadProgress.loaded >= uploadProgress.total && uploadProgress.total > 0 && (
              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span>② 미디어 서버 전송 중</span>
                  <span className="tabular-nums">{processingSeconds}초 경과</span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden relative">
                  {/* indeterminate 애니메이션 — 좌→우 반복 */}
                  <div className="absolute top-0 h-full w-1/3 bg-indigo-500 rounded-full animate-[dc-indeterminate_1.4s_ease-in-out_infinite]" />
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                  파일을 미디어 서버(NAS) 로 전송하고 있습니다. 큰 파일일수록 오래 걸립니다.
                  완료될 때까지 창을 닫지 마세요.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── 툴바 ── */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-300 rounded-t-lg">
        {/* 실행취소/재실행 */}
        <TBtn onClick={() => editor.chain().focus().undo().run()} title="실행취소">
          ↩
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().redo().run()} title="재실행">
          ↪
        </TBtn>

        <Sep />

        {/* 글꼴 — 현재 커서 위치의 fontFamily 를 감지해 버튼 라벨로 반영.
            목록에 없는 폰트는 "직접 입력" 으로 타이핑 가능. */}
        {(() => {
          const currentFont: string = editor.getAttributes("textStyle").fontFamily || "";
          const currentLabel = fonts.find((f) => f.value === currentFont)?.label
            || (currentFont ? currentFont.split(",")[0].replace(/["']/g, "").trim() : "글꼴");
          return (
            <Dropdown
              label={<span className="text-xs w-20 truncate text-left">{currentLabel}</span>}
              title="글꼴"
            >
              <div className="w-56 max-h-72 overflow-y-auto">
                {fonts.map((f) => (
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
                    className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-blue-50 ${
                      currentFont === f.value ? "bg-blue-50 font-semibold" : ""
                    }`}
                    style={{ fontFamily: f.value || "inherit" }}
                  >
                    {f.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const name = window.prompt(
                      "사용할 글꼴 이름을 입력하세요. PC 에 설치된 폰트면 적용됩니다.\n예) 나눔스퀘어, Pretendard, Times New Roman",
                      currentFont
                    );
                    if (name === null) return;
                    const trimmed = name.trim();
                    if (trimmed) {
                      editor.chain().focus().setFontFamily(trimmed).run();
                    } else {
                      editor.chain().focus().unsetFontFamily().run();
                    }
                  }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-blue-600 border-t border-gray-200 hover:bg-blue-50"
                >
                  ✎ 직접 입력…
                </button>
              </div>
            </Dropdown>
          );
        })()}

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
        <TBtn onClick={addMediaFile} title="일반 미디어 업로드 — 원격 루트/{boardSlug}/{YYYYMMDD}/">
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
        <TBtn onClick={addMediaUrl} title="실시간 미디어 삽입 — 파일 업로드 또는 URL 입력 (한 다이얼로그에서 통합)">
          🎙️
        </TBtn>
        <TBtn onClick={addMediaRow} title="이미지·미디어 여러 개 나란히 — 다중 선택 후 한 줄에 자동 배치">
          🔳
        </TBtn>
        <input
          ref={rowInputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          hidden
          onChange={handleRowInputChange}
        />
        <TBtn
          onClick={addLink}
          active={editor.isActive("link")}
          title="링크 삽입"
        >
          🔗
        </TBtn>
        <TablePicker onInsert={addTable} title="표 삽입 — 행·열 크기 선택" />
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
