// 메인 페이지 위젯 레이아웃 — DB siteSetting(key="widget_layout") 에 JSON 으로 저장.
//
// 구조: 행(row) × 3열(col). 각 셀(cell) 은 위젯 키 배열.
//   - 셀에 키가 1개면 단일 위젯 (기존 모양)
//   - 셀에 키가 2개 이상이면 탭 형식 (첫 번째가 기본 활성)
//
// 특수 키:
//   __NOTICE__           — 공지사항(가장 최근 1건 본문)
//   __RECENT_POSTS__     — 새글/수정글
//   __RECENT_COMMENTS__  — 새댓글
// 그 외는 모두 Board.slug.

export type WidgetKey = string;

/** 한 셀 = 위젯 키 배열 (탭으로 묶임) */
export type WidgetCell = WidgetKey[];

/** 한 행 = 3개 셀 */
export type WidgetRow = [WidgetCell, WidgetCell, WidgetCell];

export type WidgetLayout = WidgetRow[];

export const SPECIAL_KEYS = ["__NOTICE__", "__RECENT_POSTS__", "__RECENT_COMMENTS__"] as const;
export type SpecialKey = (typeof SPECIAL_KEYS)[number];

export function isSpecial(key: WidgetKey): key is SpecialKey {
  return (SPECIAL_KEYS as readonly string[]).includes(key);
}

/** 기본 레이아웃 (기존 GRID_LAYOUT 과 동일) */
export const DEFAULT_LAYOUT: WidgetLayout = [
  [["DcOffice"], ["__NOTICE__"], ["DcElement"]],
  [["DcPredictor"], ["DcPds"], ["DcQuestion"]],
  [["DcBibleStudyX"], ["DcStudy"], ["__RECENT_POSTS__"]],
  [["DcCouncil"], ["PkGallery"], ["__RECENT_COMMENTS__"]],
];

/** 특수 위젯 기본 표시명 (DB widget_titles 오버라이드가 없을 때 사용) */
export const SPECIAL_LABELS: Record<SpecialKey, string> = {
  __NOTICE__: "금주의 말씀",
  __RECENT_POSTS__: "새글/수정글",
  __RECENT_COMMENTS__: "새댓글",
};

/**
 * 게시판 위젯의 기본 표시명 오버라이드 (DB Board.title 대신 사용하는 코드 기본값).
 * widget_titles(DB) 오버라이드가 있으면 그게 더 우선. 둘 다 없으면 Board.title.
 */
export const BOARD_TITLE_OVERRIDE: Record<string, string> = {
  DcElement: "주교/중간반",
  DcPds: "자료실",
  DcCouncil: "권찰회",
  DcBibleStudyX: "연경실",
};

/** 위젯 제목 오버라이드 siteSetting 키 — { 위젯키: 표시명 } JSON */
export const WIDGET_TITLES_KEY = "widget_titles";

export type WidgetTitles = Record<string, string>;

/** widget_titles JSON 문자열 → { 위젯키: 표시명 } 맵. 실패하면 빈 객체. */
export function parseTitles(json: string | null | undefined): WidgetTitles {
  if (!json) return {};
  try {
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: WidgetTitles = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

/** JSON 문자열 → 정규화된 레이아웃. 실패하면 기본값. */
export function parseLayout(json: string | null | undefined): WidgetLayout {
  if (!json) return DEFAULT_LAYOUT;
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return DEFAULT_LAYOUT;
    const rows: WidgetLayout = [];
    for (const r of raw) {
      if (!Array.isArray(r) || r.length !== 3) continue;
      const cells: WidgetCell[] = [];
      for (const c of r) {
        if (Array.isArray(c)) {
          cells.push(c.filter((k): k is string => typeof k === "string"));
        } else {
          cells.push([]);
        }
      }
      rows.push([cells[0] || [], cells[1] || [], cells[2] || []]);
    }
    return rows.length > 0 ? rows : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function serializeLayout(layout: WidgetLayout): string {
  return JSON.stringify(layout);
}

/** 레이아웃에서 사용되는 모든 키 (중복 제거) */
export function collectKeys(layout: WidgetLayout): WidgetKey[] {
  const set = new Set<string>();
  for (const row of layout) {
    for (const cell of row) {
      for (const k of cell) set.add(k);
    }
  }
  return Array.from(set);
}
