"use client";

import { Node, mergeAttributes } from "@tiptap/core";

// ============================================================
// Media Extension (TipTap v3) — <video> · <audio>
//
//  · 노드 이름: "media"
//  · 속성: kind="video"|"audio", src, width(선택), title
//  · 렌더: <video controls> / <audio controls> 단일 태그 (source 자식 없음)
//  · parseHTML: 본문 안의 <video>/<audio> 태그를 자동 인식 → 이전 게시글
//                의 mp3/mp4 임베드도 그대로 살아남음
// ============================================================

export interface MediaAttrs {
  src: string;
  kind: "video" | "audio";
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
          return src ? { src, kind: "video", width: e.getAttribute("width"), title: e.getAttribute("title") } : false;
        },
      },
      {
        tag: "audio",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          const src = e.getAttribute("src") || e.querySelector("source")?.getAttribute("src") || "";
          return src ? { src, kind: "audio", width: e.getAttribute("width"), title: e.getAttribute("title") } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const kind = (HTMLAttributes.kind as string) === "audio" ? "audio" : "video";
    const attrs: Record<string, string> = {
      src: (HTMLAttributes.src as string) || "",
      controls: "",
      preload: "metadata",
    };
    if (HTMLAttributes.title) attrs.title = HTMLAttributes.title as string;
    if (HTMLAttributes.width) attrs.width = HTMLAttributes.width as string;
    if (kind === "video") {
      // 폭 100%/높이 자동 — 모바일 호환
      attrs.style = "max-width:100%;height:auto;display:block;margin:0.5em 0;background:#000";
      attrs.playsinline = "";
    } else {
      attrs.style = "width:100%;display:block;margin:0.5em 0";
    }
    return [kind, mergeAttributes(attrs)];
  },

  addCommands() {
    return {
      insertMedia:
        (attrs: MediaAttrs) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ chain }: { chain: any }) => {
          return chain().insertContent({ type: this.name, attrs }).run();
        },
    } as never;
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    media: {
      insertMedia: (attrs: MediaAttrs) => ReturnType;
    };
  }
}

export default MediaNode;

// 유틸: URL 로부터 종류 자동 판정
export function detectMediaKind(url: string): "video" | "audio" | "iframe" | null {
  const lower = url.toLowerCase().split("?")[0];
  if (/\.(mp4|webm|ogv|mov|m4v)$/.test(lower)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(lower)) return "audio";
  // YouTube / Vimeo 등은 iframe 임베드
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
      // /embed/<id>
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
