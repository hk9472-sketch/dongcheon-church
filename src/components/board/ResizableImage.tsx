"use client";

import { mergeAttributes } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

// ============================================================
// Resizable Image Extension (TipTap v3)
//
// 기능:
//  - 이미지 클릭 → 선택, 우하단 파란 핸들로 드래그 리사이즈 (가로 % 기반)
//  - 상단에 프리셋(25/50/75/100%) + 정렬(왼/중/우) + 제거 버튼
//  - 저장: width 를 "NN%" 형태로 img 태그에 유지 (sanitize 에서 width/style 허용)
// ============================================================

type Align = "left" | "center" | "right";

const ResizableImage = Image.extend({
  name: "image",
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("width") || el.style.width || null,
        renderHTML: (attrs: Record<string, unknown>) => {
          if (!attrs.width) return {};
          return { width: attrs.width as string };
        },
      },
      align: {
        default: "left" as Align,
        parseHTML: (el: HTMLElement) => (el.getAttribute("data-align") as Align) || "left",
        renderHTML: (attrs: Record<string, unknown>) => {
          const a = (attrs.align as Align) || "left";
          return { "data-align": a };
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    // width 가 있으면 style 에도 반영 (sanitize 통과 시에도 유지)
    const w = HTMLAttributes.width;
    const a = (HTMLAttributes["data-align"] as Align) || "left";
    const styleParts: string[] = [];
    if (w) styleParts.push(`width:${w};height:auto`);
    if (a === "center") styleParts.push("display:block;margin-left:auto;margin-right:auto");
    else if (a === "right") styleParts.push("display:block;margin-left:auto;margin-right:0");
    else if (a === "left") styleParts.push("display:block;margin-left:0;margin-right:auto");
    const style = styleParts.join(";");

    return [
      "img",
      mergeAttributes(HTMLAttributes, style ? { style } : {}),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView);
  },
});

function ResizableImageNodeView({ node, updateAttributes, selected, editor }: ReactNodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [dragging, setDragging] = useState(false);

  const src = (node.attrs.src as string) || "";
  const alt = (node.attrs.alt as string) || "";
  const title = (node.attrs.title as string) || "";
  const width = (node.attrs.width as string | null) || null;
  const align = ((node.attrs.align as Align) || "left") as Align;

  // 선택 시 리사이즈 핸들 · 컨트롤 노출
  const show = selected && editor.isEditable;

  // 정렬 CSS
  const alignStyle: React.CSSProperties =
    align === "center"
      ? { display: "block", marginLeft: "auto", marginRight: "auto" }
      : align === "right"
      ? { display: "block", marginLeft: "auto", marginRight: 0 }
      : { display: "block", marginLeft: 0, marginRight: "auto" };

  // width 는 "NN%" 또는 "NNpx" 저장 (기본 % 로)
  const imgStyle: React.CSSProperties = {
    ...alignStyle,
    width: width || "auto",
    height: "auto",
    maxWidth: "100%",
  };

  // 드래그 리사이즈 (우하단 핸들)
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      const img = imgRef.current;
      const wrap = wrapRef.current;
      if (!img || !wrap) return;
      const containerRect = wrap.parentElement?.getBoundingClientRect();
      if (!containerRect) return;
      // 컨테이너 대비 비율 계산
      const leftX = img.getBoundingClientRect().left;
      const w = Math.max(40, e.clientX - leftX); // px
      const pct = Math.min(100, Math.max(5, Math.round((w / containerRect.width) * 100)));
      updateAttributes({ width: `${pct}%` });
    };
    const onUp = () => setDragging(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, updateAttributes]);

  return (
    <NodeViewWrapper
      as="span"
      ref={wrapRef}
      className="resizable-image-wrap"
      style={{
        position: "relative",
        display: "inline-block",
        width: "100%",
        lineHeight: 0,
      }}
    >
      {/* 컨트롤 바 (선택 시) */}
      {show && (
        <div
          contentEditable={false}
          style={{
            position: "absolute",
            top: -34,
            left: align === "center" ? "50%" : align === "right" ? "auto" : 0,
            right: align === "right" ? 0 : "auto",
            transform: align === "center" ? "translateX(-50%)" : undefined,
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
          }}
        >
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => updateAttributes({ width: `${p}%` })}
              title={`${p}% 크기`}
              style={btnStyle(width === `${p}%`)}
            >
              {p}%
            </button>
          ))}
          <span style={{ opacity: 0.5, padding: "0 2px" }}>|</span>
          <button type="button" onClick={() => updateAttributes({ align: "left" })} title="왼쪽 정렬" style={btnStyle(align === "left")}>
            ⬅
          </button>
          <button type="button" onClick={() => updateAttributes({ align: "center" })} title="가운데 정렬" style={btnStyle(align === "center")}>
            ↔
          </button>
          <button type="button" onClick={() => updateAttributes({ align: "right" })} title="오른쪽 정렬" style={btnStyle(align === "right")}>
            ➡
          </button>
          <span style={{ opacity: 0.5, padding: "0 2px" }}>|</span>
          <button
            type="button"
            onClick={() => {
              editor.chain().focus().deleteSelection().run();
            }}
            title="이미지 삭제"
            style={{ ...btnStyle(false), color: "#fca5a5" }}
          >
            🗑
          </button>
        </div>
      )}

      {/* 이미지 */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        title={title}
        data-align={align}
        draggable={false}
        style={{
          ...imgStyle,
          outline: show ? "2px solid #3b82f6" : "none",
          outlineOffset: 1,
          cursor: editor.isEditable ? "pointer" : "default",
        }}
      />

      {/* 우하단 리사이즈 핸들 */}
      {show && (
        <span
          contentEditable={false}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          title="드래그해서 크기 조절"
          style={{
            position: "absolute",
            // img 의 실제 오른쪽·아래에 맞추기 위해 align 별 오프셋
            right: align === "right" ? 0 : align === "center" ? "50%" : "auto",
            left: align === "left" ? (width ? undefined : "auto") : undefined,
            bottom: 0,
            transform: align === "center" ? "translateX(50%)" : undefined,
            width: 14,
            height: 14,
            background: "#3b82f6",
            border: "2px solid #fff",
            borderRadius: 3,
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            cursor: "nwse-resize",
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

export default ResizableImage;
