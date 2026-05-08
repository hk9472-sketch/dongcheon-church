"use client";

import { useState } from "react";

interface Props {
  text?: string | null;
}

const DEFAULT_GUIDE =
  "예배당처럼 아끼고 서로 조심하셨으면 합니다.\n주로 우리 교인들이 사용하겠지만 혹 손님들이 오시더라도 깨끗한 우리의 모습을 보였으면 좋겠고, 서로의 신앙에 유익이 되도록 했으면 좋겠습니다.";

/**
 * 게시판 안내 문구 박스 — 우하단에 ⓘ 툴팁(수정 방법 안내) 포함.
 * list / post / gallery / write 페이지에서 공통 사용.
 */
export default function BoardGuideBox({ text }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <div className="px-4 py-2.5 pr-10 bg-blue-50/60 border border-blue-100 rounded text-xs text-gray-500 italic leading-relaxed whitespace-pre-line">
        {text || DEFAULT_GUIDE}
      </div>

      {/* ⓘ 툴팁 박스 — 우하단, 약간 진한 색 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="absolute bottom-1 right-1.5 inline-flex items-center justify-center w-5 h-5 rounded bg-blue-200/80 hover:bg-blue-300 text-blue-800 text-[11px] font-bold transition-colors shadow-sm"
        aria-label="안내 문구 수정 방법"
        title="수정 방법 보기"
      >
        ⓘ
      </button>

      {open && (
        <div className="absolute z-10 bottom-7 right-1 w-72 rounded-md border border-blue-200 bg-white shadow-lg p-3 text-[11px] text-gray-700 leading-relaxed">
          <p className="font-semibold text-blue-700 mb-1">안내 문구 수정 방법</p>
          <ol className="list-decimal list-inside space-y-0.5 text-gray-600">
            <li>관리자로 로그인</li>
            <li>상단 <strong>관리</strong> 버튼 클릭</li>
            <li><strong>게시판 관리</strong> 메뉴 진입</li>
            <li>해당 게시판의 <strong>편집</strong> 버튼</li>
            <li><strong>안내 문구</strong> 필드를 수정 후 저장</li>
          </ol>
          <p className="mt-2 text-gray-400">관리자만 수정할 수 있습니다.</p>
        </div>
      )}
    </div>
  );
}
