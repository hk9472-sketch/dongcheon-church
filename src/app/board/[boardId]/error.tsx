"use client";

import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h2 className="text-xl font-bold text-gray-700 mb-2">오류가 발생했습니다</h2>
      <p className="text-sm text-gray-500 mb-6">
        {error.message || "페이지를 불러오는 중 문제가 발생했습니다."}
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-5 py-2.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="px-5 py-2.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
        >
          메인으로
        </Link>
      </div>
    </div>
  );
}
