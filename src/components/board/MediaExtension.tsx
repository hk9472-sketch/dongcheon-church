"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { useEffect, useRef, useState } from "react";

// ============================================================
// Media Extension (TipTap v3) — <video> · <audio> · <iframe>
//
//  · 노드 이름:  "media"
//  · 그룹:       inline + atom  → 단락 안에 위치, 옆에 텍스트 입력 가능
//  · 속성:       kind, src, width("60%"/"300px" 등), align(left/center/right), title
//  · NodeView:   25/50/75/100% 프리셋 + 좌/중/우 정렬 + 우측 드래그 핸들 + 삭제
//  · 키보드:     Enter/←/→ 시 미디어가 선택돼있으면 옆 텍스트로 캐럿 이동(삭제 X)
//  · parseHTML:  <video>·<audio>·<iframe> 자동 인식 (이관 게시글 호환)
// ============================================================

type Align = "left" | "center" | "right";
type Kind = "video" | "audio" | "iframe";

export interface MediaAttrs {
  src: string;
  kind: Kind;
  width?: string | null;
  align?: Align;
  title?: string | null;
}

const MediaNode = Node.create({
  name: "media",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: "" },
      kind: { default: "video" as Kind },
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("width") || el.style.width || null,
        renderHTML: (attrs: Record<string, unknown>) => (attrs.width ? { width: attrs.width as string } : {}),
      },
      align: {
        default: "center" as Align,
        parseHTML: (el: HTMLElement) => (el.getAttribute("data-align") as Align) || "center",
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-align": ((attrs.align as Align) || "center") }),
      },
      title: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("title") || null,
        renderHTML: (attrs: Record<string, unknown>) => (attrs.title ? { title: attrs.title as string } : {}),
      },
    };
  },

  parseHTML() {
    const grab = (el: HTMLElement, kind: Kind) => {
      const src = el.getAttribute("src") || el.querySelector("source")?.getAttribute("src") || "";
      return src ? { kind, src } : false;
    };
    return [
      { tag: "video", getAttrs: (el) => grab(el as HTMLElement, "video") },
      { tag: "audio", getAttrs: (el) => grab(el as HTMLElement, "audio") },
      { tag: "iframe", getAttrs: (el) => grab(el as HTMLElement, "iframe") },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const kind: Kind =
      HTMLAttributes.kind === "audio" ? "audio" : HTMLAttributes.kind === "iframe" ? "iframe" : "video";
    const src = (HTMLAttributes.src as string) || "";
    const w = (HTMLAttributes.width as string) || "";
    const a: Align = ((HTMLAttributes["data-align"] as Align) || "left") as Align;
    const title = HTMLAttributes.title as string | undefined;

    const styleParts: string[] = [];
    if (w) styleParts.push(`width:${w}`);
    if (kind === "iframe") styleParts.push("aspect-ratio:16/9", "border:0", "max-width:100%");
    else if (kind === "video") styleParts.push("max-width:100%", "height:auto", "background:#000");
    else styleParts.push("max-width:100%", "min-width:0");

    if (a === "left") styleParts.push("float:left", "margin:4px 14px 8px 0");
    else if (a === "right") styleParts.push("float:right", "margin:4px 0 8px 14px");
    else if (a === "center") styleParts.push("display:block", "margin:0.5em auto", "clear:both");

    const style = styleParts.join(";");

    if (kind === "iframe") {
      return [
        "iframe",
        mergeAttributes({
          src,
          style,
          frameborder: "0",
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          allowfullscreen: "",
          "data-align": a,
          ...(w ? { width: w } : {}),
          ...(title ? { title } : {}),
        }),
      ];
    }

    const baseAttrs: Record<string, string> = {
      src,
      controls: "",
      preload: "metadata",
      style,
      "data-align": a,
    };
    if (kind === "video") baseAttrs.playsinline = "";
    if (w) baseAttrs.width = w;
    if (title) baseAttrs.title = title;
    return [kind, mergeAttributes(baseAttrs)];
  },

  addKeyboardShortcuts() {
    const isMediaSelected = (sel: unknown): boolean =>
      sel instanceof NodeSelection && sel.node?.type?.name === this.name;
    return {
      Enter: () => {
        const { state, view } = this.editor;
        const { selection } = state;
        if (!isMediaSelected(selection)) return false;
        const pos = selection.to;
        const para = state.schema.nodes.paragraph?.create();
        if (!para) return false;
        const tr = state.tr.insert(pos, para);
        tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
        view.dispatch(tr.scrollIntoView());
        return true;
      },
      ArrowRight: () => {
        const { state, view } = this.editor;
        const { selection } = state;
        if (!isMediaSelected(selection)) return false;
        const $pos = state.doc.resolve(selection.to);
        view.dispatch(state.tr.setSelection(TextSelection.near($pos, 1)).scrollIntoView());
        return true;
      },
      ArrowLeft: () => {
        const { state, view } = this.editor;
        const { selection } = state;
        if (!isMediaSelected(selection)) return false;
        const $pos = state.doc.resolve(selection.from);
        view.dispatch(state.tr.setSelection(TextSelection.near($pos, -1)).scrollIntoView());
        return true;
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaNodeView);
  },
});

// 외부 HTTP 미디어를 신홈(HTTPS) 에디터에서도 인라인 재생되도록 프록시 경유.
// sanitize 가 출력 단계에서 똑같이 처리하지만, 에디터 NodeView 는 sanitize 안 거쳐서
// 별도 적용 필요. 메타데이터 로드 실패로 video 가 비율 못 잡고 납작하게 뻗는 문제 해결.
function rewriteSrcForProxy(srcUrl: string): string {
  if (!srcUrl) return "";
  if (srcUrl.startsWith("/") || srcUrl.startsWith("https://") || srcUrl.startsWith("//")) {
    return srcUrl;
  }
  if (srcUrl.startsWith("http://")) {
    return `/api/board/media-proxy?src=${encodeURIComponent(srcUrl)}`;
  }
  return srcUrl;
}

function MediaNodeView({ node, updateAttributes, selected, editor, deleteNode, getPos }: ReactNodeViewProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [drag, setDrag] = useState<{ startX: number; startW: number } | null>(null);
  const [hover, setHover] = useState(false);

  const kind = (node.attrs.kind as Kind) || "video";
  const rawSrc = (node.attrs.src as string) || "";
  const src = rewriteSrcForProxy(rawSrc);
  const widthAttr = (node.attrs.width as string | null) || null;
  const align = ((node.attrs.align as Align) || "center") as Align;
  const title = (node.attrs.title as string | undefined) || undefined;
  // 선택 OR 호버 시 툴바·핸들 표시 — 호버로 발견성 향상
  const show = (selected || hover) && editor.isEditable;

  // 노드를 명시적으로 선택 — 클릭 영역(컨트롤바 제외)에서 호출해 video 재생 가로채기 방지
  const selectSelf = () => {
    try {
      const pos = typeof getPos === "function" ? getPos() : null;
      if (pos == null) return;
      editor.commands.setNodeSelection(pos);
    } catch {
      /* ignore */
    }
  };

  const effectiveWidth = widthAttr || (kind === "audio" ? "400px" : "60%");

  // 래퍼 — float 가 적용되려면 너비를 명시해야 텍스트가 옆 공간으로 흐른다.
  const wrapBase: React.CSSProperties = {
    position: "relative",
    width: effectiveWidth,
    maxWidth: "100%",
    lineHeight: 0,
    verticalAlign: "top",
  };
  const wrapStyle: React.CSSProperties =
    align === "center"
      ? { ...wrapBase, display: "block", margin: "8px auto", clear: "both" }
      : align === "right"
      ? { ...wrapBase, float: "right", margin: "4px 0 8px 14px" }
      : { ...wrapBase, float: "left", margin: "4px 14px 8px 0" };

  // 드래그 리사이즈 — 우측 핸들, % 기반
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const containerEl = (wrap.closest(".ProseMirror") as HTMLElement) || wrap.parentElement;
      const containerW = containerEl?.getBoundingClientRect().width || 1;
      const dx = e.clientX - drag.startX;
      const newW = Math.max(80, drag.startW + dx);
      const pct = Math.min(100, Math.max(10, Math.round((newW / containerW) * 100)));
      updateAttributes({ width: `${pct}%` });
    };
    const onUp = () => setDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, updateAttributes]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setDrag({ startX: e.clientX, startW: rect.width });
  };

  const setPercent = (pct: number) => updateAttributes({ width: `${pct}%` });

  return (
    <NodeViewWrapper
      as="span"
      ref={wrapRef}
      className="resizable-media-wrap"
      style={wrapStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* 선택 핸들 — 좌상단의 "⊙" 점을 눌러 명시적 선택 + 드래그-이동 시작점.
         video/audio 가 클릭을 가로채는 상황 대비. */}
      {show && (
        <button
          type="button"
          draggable
          contentEditable={false}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            selectSelf();
          }}
          title="선택 · 드래그로 이동"
          style={{
            position: "absolute",
            top: -14,
            left: -14,
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: selected ? "#2563eb" : "#475569",
            color: "#fff",
            border: "2px solid #fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
            cursor: "grab",
            fontSize: 14,
            zIndex: 12,
            padding: 0,
            lineHeight: "22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ⊙
        </button>
      )}
      {/* 컨트롤 바 */}
      {show && (
        <div
          contentEditable={false}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            top: -34,
            left: align === "center" ? "50%" : align === "right" ? "auto" : 16,
            right: align === "right" ? 0 : "auto",
            transform: align === "center" ? "translateX(-50%)" : undefined,
            display: "flex",
            gap: 4,
            padding: "3px 6px",
            background: "#1f2937",
            borderRadius: 6,
            boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
            fontSize: 11,
            color: "#fff",
            zIndex: 11,
            whiteSpace: "nowrap",
            lineHeight: 1,
          }}
        >
          <span style={{ opacity: 0.7, padding: "2px 4px 2px 0" }}>
            {kind === "video" ? "동영상" : kind === "audio" ? "음성" : "임베드"}
          </span>
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { selectSelf(); setPercent(p); }}
              title={`${p}% 크기`}
              style={btnStyle(widthAttr === `${p}%`)}
            >
              {p}%
            </button>
          ))}
          <span style={{ opacity: 0.5, padding: "0 2px" }}>|</span>
          <button type="button" onClick={() => { selectSelf(); updateAttributes({ align: "left" }); }} title="왼쪽 배치 — 텍스트가 오른쪽으로 흐름" style={btnStyle(align === "left")}>
            왼쪽
          </button>
          <button type="button" onClick={() => { selectSelf(); updateAttributes({ align: "center" }); }} title="가운데 배치" style={btnStyle(align === "center")}>
            가운데
          </button>
          <button type="button" onClick={() => { selectSelf(); updateAttributes({ align: "right" }); }} title="오른쪽 배치 — 텍스트가 왼쪽으로 흐름" style={btnStyle(align === "right")}>
            오른쪽
          </button>
          <span style={{ opacity: 0.5, padding: "0 2px" }}>|</span>
          <button type="button" onClick={() => deleteNode()} title="삭제" style={{ ...btnStyle(false), color: "#fca5a5" }}>
            🗑
          </button>
        </div>
      )}

      {/* 본 미디어 */}
      {kind === "video" && (
        <video
          src={src}
          controls
          preload="metadata"
          playsInline
          title={title}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            // 메타 로드 전/실패 시에도 16:9 박스 유지 (납작하게 뻗는 문제 방지)
            aspectRatio: "16 / 9",
            objectFit: "contain",
            background: "#000",
            outline: show ? "2px solid #3b82f6" : "none",
            outlineOffset: 1,
          }}
        />
      )}
      {kind === "audio" && (
        <audio
          src={src}
          controls
          preload="metadata"
          title={title}
          style={{
            display: "block",
            width: "100%",
            minWidth: 0,
            outline: show ? "2px solid #3b82f6" : "none",
            outlineOffset: 1,
            borderRadius: 4,
          }}
        />
      )}
      {kind === "iframe" && (
        <iframe
          src={src}
          title={title}
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "16 / 9",
            border: 0,
            outline: show ? "2px solid #3b82f6" : "none",
            outlineOffset: 1,
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}

      {/* 우측 드래그 핸들 */}
      {show && (
        <span
          contentEditable={false}
          onMouseDown={startDrag}
          title="가로 폭 조절"
          style={{
            position: "absolute",
            right: -5,
            top: "50%",
            transform: "translateY(-50%)",
            width: 10,
            height: 30,
            background: "#3b82f6",
            border: "2px solid #fff",
            borderRadius: 3,
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            cursor: "ew-resize",
            zIndex: 10,
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "#3b82f6" : "transparent",
    color: "#fff",
    border: "none",
    padding: "2px 6px",
    borderRadius: 3,
    cursor: "pointer",
    fontSize: 11,
    lineHeight: 1,
    fontFamily: "inherit",
  };
}

export default MediaNode;

// 유틸: URL 로부터 종류 자동 판정
export function detectMediaKind(url: string): Kind | null {
  const lower = url.toLowerCase().split("?")[0];
  if (/\.(mp4|webm|ogv|mov|m4v)$/.test(lower)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(lower)) return "audio";
  try {
    const u = new URL(url);
    if (/youtube\.com|youtu\.be|vimeo\.com|tv\.kakao\.com|tv\.naver\.com/.test(u.hostname)) return "iframe";
  } catch {
    // not a URL
  }
  return null;
}

// YouTube URL → embed URL
export function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (/youtube\.com$/.test(u.hostname) || u.hostname === "www.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
      const m = u.pathname.match(/\/embed\/([^/]+)/);
      if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    }
    if (u.hostname.endsWith("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}
