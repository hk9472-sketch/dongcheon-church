"use client";

import BulkEditor from "@/components/offering/BulkEditor";

export default function OfferingEditPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">연보 일괄수정</h1>
        <p className="text-xs text-gray-500 mt-1">
          기간을 지정해 모든 연보종류의 내역을 한 표에서 일자·금액·연보종류 등 자유롭게 수정.
          신규 행은 표 끝에 노란색으로 추가됩니다.
        </p>
      </div>
      <BulkEditor showTypeColumn />
    </div>
  );
}
