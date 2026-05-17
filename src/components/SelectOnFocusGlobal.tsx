"use client";

import { useSelectOnFocus } from "@/lib/useArrowNav";

/**
 * 모든 페이지의 number/text input 에서 포커스 시 전체 텍스트 자동 선택.
 * layout.tsx 에 한 번 마운트하면 사이트 전체 적용.
 *
 * 효과:
 *  - 화살표/Tab/마우스 클릭/터치 어느 방법으로 진입해도 값이 선택됨
 *  - 곧장 새 값 입력하면 덮어쓰기 — 매번 지우는 수고 제거
 *
 * 영향 없는 input: textarea, checkbox, file, date, password 등
 *
 * 렌더링되는 UI 요소는 없습니다.
 */
export default function SelectOnFocusGlobal() {
  useSelectOnFocus();
  return null;
}
