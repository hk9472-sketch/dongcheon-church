"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

// ============================================================
// Media Extension (TipTap v3) — <video> · <audio> · <iframe>
//
//  · 노드 이름: "media"
//  · 속성: kind="video"|"audio"|"iframe", src, width(예: "60%"), title
//  · NodeView: 선택 시 25/50/75/100% 프리셋 + 우측 드래그 핸들 + 삭제
//  · parseHTML: 본문 안의 <video>/<audio>/<iframe> 자동 인식
// ============================================================

export interface MediaAttrs {
  src: string;
  kind: "video" | "audio" | "iframe";
  width?: string | null;
  title?: string | null;
}

const MediaNode = Node.create({
  name: "media",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: "" },
      kind: { default: "video" },
      width: { default: null },
      title: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "video",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          const src = e.getAttribute("src") || e.querySelector("source")?.getAttribute("src") || "";
          return src
            ? { src, kind: "video", width: e.getAttribute("width") || e.style.width || null, title: e.getAttribute("title") }
            : false;
        },
      },
      {
        tag: "audio",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          const src = e.getAttribute("src") || e.querySelector("source")?.getAttribute("src") || "";
          return src
            ? { src, kind: "audio", width: e.getAttribute("width") || e.style.width || null, title: e.getAttribute("title") }
            : false;
        },
      },
      {
        tag: "iframe",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          const src = e.getAttribute("src") || "";
          return src
            ? { src, kind: "iframe", width: e.getAttribute("width") || e.style.width || null, title: e.getAttribute("title") }
            : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const kind = (HTMLAttributes.kind as string) === "audio"
      ? "audio"
      : (HTMLAttributes.kind as string) === "iframe"
      ? "iframe"
      : "video";
    const src = (HTMLAttributes.src as string) || "";
    const w = (HTMLAttributes.width as string) || "";
    const title = HTMLAttributes.title as string | undefined;

    if (kind === "iframe") {
      const widthCss = w || "100%";
      const style = `width:${widthCss};aspect-ratio:16/9;border:0;display:block;margin:0.5em 0`;
      return [
        "iframe",
        mergeAttributes({
          src,
          style,
          frameborder: "0",
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          allowfullscreen: "",
          ...(title ? { title } : {}),
          ...(w ? { width: w } : {}),
        }),
      ];
    }

    const baseAttrs: Record<string, string> = {
      src,
      controls: "",
      preload: "metadata",
    };
    if (title) baseAttrs.title = title;

    if (kind === "video") {
      const widthCss = w || "100%";
      baseAttrs.style = `width:${widthCss};max-width:100%;height:auto;display:block;margin:0.5em 0;background:#000`;
      baseAttrs.playsinline = "";
      if (w) baseAttrs.width = w;
    } else {
      // audio
      const widthCss = w || "100%";
      baseAttrs.style = `width:${widthCss};max-width:100%;display:block;margin:0.5em 0`;
      if (w) baseAttrs.width = w;
    }
    return [kind, mergeAttributes(baseAttrs)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaNodeView);
  },
});

function MediaNodeView({ node, updateAttributes, selected, editor, deleteNode }: ReactNodeViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ startX: number; startW: number } | null>(null);

  const kind = (node.attrs.kind as "video" | "audio" | "iframe") || "video";
  const src = (node.attrs.src as string) || "";
  const widthAttr = (node.attrs.width as string | null) || null;
  const title = (node.attrs.title as string | undefined) || undefined;
  const show = selected && editor.isEditable;

  // 드래그 리사이즈 (우측 핸들) — % 기반
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

  const wrapWidth = widthAttr || (kind === "audio" ? "100%" : kind === "iframe" ? "100%" : "100%");

  const wrapStyle: React.CSSProperties = {
    position: "relative",
    width: wrapWidth,
    maxWidth: "100%",
    margin: "8px 0",
    lineHeight: 0,
    outline: show ? "2px solid #3b82f6" : "none",
    outlineOffset: 2,
    display: "block",
  };

  return (
    <NodeViewWrapper as="div" ref={wrapRef} className="resizable-media-wrap" style={wrapStyle}>
      {/* 컨트롤 바 */}
      {show && (
        <div
          contentEditable={false}
          style={{
            position: "absolute",
            top: -34,
            left: 0,
            display: "flex",
            gap: 4,
            padding: "3px 6px",
            background: "#1f2937",
            borderRadius: 6,
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            fontSize: 11,
            color: "#fff",
            zIndex: 10,
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
              onClick={() => updateAttributes({ width: `${p}%` })}
              title={`${p}% 크기`}
              style={btnStyle(widthAttr === `${p}%`)}
            >
              {p}%
            </button>
          ))}
          <span style={{ opacity: 0.5, padding: "0 2px" }}>|</span>
          <button
            type="button"
            onClick={() => deleteNode()}
            title="삭제"
            style={{ ...btnStyle(false), color: "#fca5a5" }}
          >
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
          style={{ display: "block", width: "100%", height: "auto", background: "#000" }}
        />
      )}
      {kind === "audio" && (
        <audio
          src={src}
          controls
          preload="metadata"
          title={title}
          style={{ display: "block", width: "100%" }}
        />
      )}
      {kind === "iframe" && (
        <iframe
          src={src}
          title={title}
          style={{ display: "block", width: "100%", aspectRatio: "16 / 9", border: 0 }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}

      {/* 우측 가운데 리사이즈 핸들 */}
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
export function detectMediaKind(url: string): "video" | "audio" | "iframe" | null {
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
