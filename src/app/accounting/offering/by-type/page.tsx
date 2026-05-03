"use client";

import { useState } from "react";
import BulkEditor from "@/components/offering/BulkEditor";

const OFFERING_TYPES = [
  "주일연보",
  "십일조연보",
  "감사연보",
  "특별연보",
  "오일연보",
  "절기연보",
] as const;
type OfferingType = (typeof OFFERING_TYPES)[number];

export default function OfferingByTypePage() {
  const [type, setType] = useState<OfferingType>("주일연보");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">연보종류별 입력/수정</h1>
        <p className="text-xs text-gray-500 mt-1">
          한 가지 연보종류만 골라 일자·관리번호·금액·비고 단위로 줄줄이 입력 또는 수정.
          기간으로 기존 내역을 불러와 일자도 수정 가능합니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {OFFERING_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded px-3 py-1.5 text-sm border ${
              type === t
                ? "bg-teal-600 text-white border-teal-700"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* fixedType 변경 시 컴포넌트 다시 마운트하기 위해 key */}
      <BulkEditor key={type} fixedType={type} showTypeColumn={false} />
    </div>
  );
}
