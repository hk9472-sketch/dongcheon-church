import { KeyboardEvent, FocusEvent, useEffect } from "react";

/**
 * 페이지 안의 모든 number/text input 에서 포커스 시 전체 텍스트 자동 선택.
 * 입력 폼이 큰 페이지(권찰보고서/전체출석보고 등)에서 input 마다 onFocus
 * 안 달고 한 줄로 처리. document focusin 으로 모든 input 캡처.
 *
 * 사용법:
 *   import { useSelectOnFocus } from "@/lib/useArrowNav";
 *   useSelectOnFocus();
 */
export function useSelectOnFocus() {
  useEffect(() => {
    const onFocusIn = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.tagName !== "INPUT") return;
      const inp = t as HTMLInputElement;
      if (inp.type === "number" || inp.type === "text") {
        // Chrome 등에서 mouseup 이 select 를 해제하므로 다음 tick 에 select.
        setTimeout(() => {
          try { inp.select(); } catch {}
        }, 0);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);
}

/**
 * 포커스 시 input 의 모든 텍스트 자동 선택 — 마우스 클릭/Tab/터치 어디서든 동작.
 * 사용자가 곧장 새 값 입력해 덮어쓰기 가능.
 *
 * setTimeout 0 — 일부 브라우저(특히 Chrome)는 mouseup 이 select 를 해제하므로
 * 다음 tick 에서 select() 호출.
 *
 * 사용법:
 *   <input onFocus={selectOnFocus} ... />
 */
export function selectOnFocus(e: FocusEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  setTimeout(() => {
    try { el.select(); } catch {}
  }, 0);
}

/**
 * 테이블 내 input 간 화살표키 이동 핸들러
 * data-row, data-col 속성으로 위치를 지정하면
 * ↑↓←→ 키로 인접 칸으로 이동합니다.
 * Enter 키는 아래 칸으로 이동합니다.
 *
 * type="text" 필드에서는 좌우 화살표가 커서 이동에 쓰이므로
 * 상하 화살표 + Enter만 셀 이동합니다.
 *
 * 사용법:
 *   <input data-row={r} data-col={c} onKeyDown={handleArrowNav} ... />
 */
export function handleArrowNav(e: KeyboardEvent<HTMLInputElement>) {
  const key = e.key;
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(key)) return;

  const target = e.currentTarget;
  const isText = target.type === "text";

  // 텍스트 입력에서는 좌우 화살표를 커서 이동에 사용
  if (isText && (key === "ArrowLeft" || key === "ArrowRight")) return;

  // ArrowUp/Down은 number input에서 값 증감을 유발하므로 항상 방지
  if (key === "ArrowUp" || key === "ArrowDown") {
    e.preventDefault();
  }

  const row = Number(target.dataset.row ?? 0);
  const col = Number(target.dataset.col ?? 0);

  let nextRow = row;
  let nextCol = col;

  switch (key) {
    case "ArrowUp":
      nextRow = row - 1;
      break;
    case "ArrowDown":
    case "Enter":
      nextRow = row + 1;
      break;
    case "ArrowLeft":
      nextCol = col - 1;
      break;
    case "ArrowRight":
      nextCol = col + 1;
      break;
  }

  // 같은 부모 컨테이너 내에서 해당 위치의 input 찾기
  const container = target.closest("table") || target.closest("form") || document;
  const next = container.querySelector<HTMLInputElement>(
    `input[data-row="${nextRow}"][data-col="${nextCol}"]`
  );

  if (next) {
    e.preventDefault();
    next.focus();
    next.select();
  }
}
