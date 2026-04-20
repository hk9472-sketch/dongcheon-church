"use client";

import { Node, mergeAttributes } from "@tiptap/core";

// ============================================================
// MediaRow — 이미지·미디어를 가로로 나란히 배치하는 블록 노드
//
// 이유: float align=left 를 반복 지정하면 줄바꿈·clear 처리가 번거로워 작성자 피로도가
// 크다. 표를 생성해 셀 안에 넣는 것도 의미론적으로 맞지 않음(시각적 데이터가 아님).
// 대안으로 flex 컨테이너 한 덩어리(<div class="media-row">) 안에 image/media 자식 여러 개를
// 묶는 전용 노드를 둔다. 개별 자식은 기존 ResizableImage / MediaNode 그대로 동작 → 크기
// 조절·정렬·삭제는 기존대로.
//
//  · group: "block"
//  · content: "(image | media)+"  → 이미지/미디어 둘 다 수용, 최소 1개
//  · parseHTML: <div class="media-row">
//  · renderHTML: <div class="media-row">
// ============================================================

const MediaRow = Node.create({
  name: "mediaRow",
  group: "block",
  content: "(image | media)+",
  isolating: true,
  defining: true,

  parseHTML() {
    return [
      {
        tag: "div.media-row",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "media-row" }),
      0,
    ];
  },
});

export default MediaRow;
