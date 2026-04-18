"use client";

import { mergeAttributes } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { useEffect, useRef, useState } from "react";

// ============================================================
// Resizable Image Extension (TipTap v3) — 워드 스타일
//
// 핵심 변경 (2026-04-19):
//  1) inline: true → 이미지가 단락 안에 들어가고 옆에 텍스트 입력 가능
//  2) align(left/right) → CSS float 적용 → 텍스트가 이미지 옆으로 흐름
//  3) align(center)    → display:block + clear:both
//  4) 다중 리사이즈 핸들: 우측(e) · 하단(s) · 우하 모서리(se) — 모두 폭 조정
//     · 우측핸들은 정확히 옆을 잡아당기고, 하단/모서리는 비례로 조정
//  5) 이미지 선택 상태에서 Enter → 삭제 대신 아래에 새 단락 삽입
//  6) ←/→ 방향키 → 캐럿이 이미지 옆 텍스트로 이동 (워드 동작)
// ============================================================

type Align = "left" | "center" | "right";
type Dir = "e" | "s" | "se";

const ResizableImage = Image.extend({
  name: "image",
  inline: true,
  group: "inline",
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
    const w = HTMLAttributes.width;
    const a = (HTMLAttributes["data-align"] as Align) || "left";
    const styleParts: string[] = [];
    if (w) styleParts.push(`width:${w}`, "height:auto");
    if (a === "left") styleParts.push("float:left", "margin:4px 14px 8px 0");
    else if (a === "right") styleParts.push("float:right", "margin:4px 0 8px 14px");
    else if (a === "center") styleParts.push("display:block", "margin-left:auto", "margin-right:auto", "clear:both");
    const style = styleParts.join(";");

    return ["img", mergeAttributes(HTMLAttributes, style ? { style } : {})];
  },

  addKeyboardShortcuts() {
    const isImageSelected = (sel: unknown): boolean =>
      sel instanceof NodeSelection && sel.node?.type?.name === this.name;

    return {
      // 이미지 선택 상태에서 Enter → 삭제하지 말고 아래에 단락 삽입 후 캐럿 이동
      Enter: () => {
        const { state, view } = this.editor;
        const { selection } = state;
        if (!isImageSelected(selection)) return false;

        const pos = selection.to;
        const para = state.schema.nodes.paragraph?.create();
        if (!para) return false;
        const tr = state.tr.insert(pos, para);
        tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
        view.dispatch(tr.scrollIntoView());
        return true;
      },
      // 이미지 선택 상태에서 →/← → 옆 텍스트로 캐럿 이동 (삭제 없이)
      ArrowRight: () => {
        const { state, view } = this.editor;
        const { selection } = state;
        if (!isImageSelected(selection)) return false;
        const $pos = state.doc.resolve(selection.to);
        const next = TextSelection.near($pos, 1);
        view.dispatch(state.tr.setSelection(next).scrollIntoView());
        return true;
      },
      ArrowLeft: () => {
        const { state, view } = this.editor;
        const { selection } = state;
        if (!isImageSelected(selection)) return false;
        const $pos = state.doc.resolve(selection.from);
        const prev = TextSelection.near($pos, -1);
        view.dispatch(state.tr.setSelection(prev).scrollIntoView());
        return true;
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView);
  },
});

function ResizableImageNodeView({ node, updateAttributes, selected, editor }: ReactNodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [drag, setDrag] = useState<{ dir: Dir; startX: number; startY: number; startW: number } | null>(null);

  const src = (node.attrs.src as string) || "";
  const alt = (node.attrs.alt as string) || "";
  const title = (node.attrs.title as string) || "";
  const widthAttr = (node.attrs.width as string | null) || null;
  const align = ((node.attrs.align as Align) || "left") as Align;

  const show = selected && editor.isEditable;

  // 래퍼 스타일 — float / block
  const wrapStyle: React.CSSProperties =
    align === "center"
      ? { display: "block", margin: "8px auto", clear: "both", position: "relative", lineHeight: 0 }
      : align === "right"
      ? { float: "right", margin: "4px 0 8px 14px", position: "relative", lineHeight: 0, maxWidth: "100%" }
      : { float: "left", margin: "4px 14px 8px 0", position: "relative", lineHeight: 0, maxWidth: "100%" };

  // 이미지 스타일
  const imgStyle: React.CSSProperties = {
    display: "block",
    width: widthAttr || "auto",
    height: "auto",
    maxWidth: "100%",
    outline: show ? "2px solid #3b82f6" : "none",
    outlineOffset: 1,
    cursor: editor.isEditable ? "pointer" : "default",
  };

  // 드래그 리사이즈 — 시작 시 기준 폭 px 저장, 이동량으로 % 계산
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const containerEl = (wrap.closest(".ProseMirror") as HTMLElement) || wrap.parentElement;
      const containerW = containerEl?.getBoundingClientRect().width || 1;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      let newW: number;
      if (drag.dir === "e") newW = drag.startW + dx;
      else if (drag.dir === "s") newW = drag.startW + dy * (drag.startW / Math.max(1, drag.startW)); // 비례
      else newW = drag.startW + Math.max(dx, dy); // se: 더 큰 변화량 적용

      newW = Math.max(40, newW);
      const pct = Math.min(100, Math.max(5, Math.round((newW / containerW) * 100)));
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

  const startDrag = (dir: Dir) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    setDrag({ dir, startX: e.clientX, startY: e.clientY, startW: rect.width });
  };

  return (
    <NodeViewWrapper as="span" ref={wrapRef} className="resizable-image-wrap" style={wrapStyle}>
      {/* 컨트롤 바 (선택 시) */}
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
          }}
        >
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
          <button type="button" onClick={() => updateAttributes({ align: "left" })} title="왼쪽 정렬 (텍스트 오른쪽 흐름)" style={btnStyle(align === "left")}>
            ⬅
          </button>
          <button type="button" onClick={() => updateAttributes({ align: "center" })} title="가운데 정렬 (블록)" style={btnStyle(align === "center")}>
            ↔
          </button>
          <button type="button" onClick={() => updateAttributes({ align: "right" })} title="오른쪽 정렬 (텍스트 왼쪽 흐름)" style={btnStyle(align === "right")}>
            ➡
          </button>
          <span style={{ opacity: 0.5, padding: "0 2px" }}>|</span>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteSelection().run()}
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
        style={imgStyle}
      />

      {/* 리사이즈 핸들 — 우측(e) · 하단(s) · 우하(se) */}
      {show && (
        <>
          {/* 우측 가운데 핸들 */}
          <span
            contentEditable={false}
            onMouseDown={startDrag("e")}
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
          {/* 하단 가운데 핸들 */}
          <span
            contentEditable={false}
            onMouseDown={startDrag("s")}
            title="세로 폭 조절 (비율 유지)"
            style={{
              position: "absolute",
              left: "50%",
              bottom: -5,
              transform: "translateX(-50%)",
              width: 30,
              height: 10,
              background: "#3b82f6",
              border: "2px solid #fff",
              borderRadius: 3,
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              cursor: "ns-resize",
              zIndex: 10,
            }}
          />
          {/* 우하 모서리 핸들 */}
          <span
            contentEditable={false}
            onMouseDown={startDrag("se")}
            title="모서리 드래그"
            style={{
              position: "absolute",
              right: -6,
              bottom: -6,
              width: 14,
              height: 14,
              background: "#3b82f6",
              border: "2px solid #fff",
              borderRadius: 3,
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              cursor: "nwse-resize",
              zIndex: 11,
            }}
          />
        </>
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
