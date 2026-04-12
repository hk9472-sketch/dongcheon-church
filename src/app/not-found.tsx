import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h1 className="text-6xl font-bold text-gray-200 mb-4">404</h1>
      <h2 className="text-xl font-bold text-gray-700 mb-2">페이지를 찾을 수 없습니다</h2>
      <p className="text-sm text-gray-500 mb-6">
        요청하신 페이지가 존재하지 않거나 이동되었습니다.
      </p>
      <div className="flex gap-3">
        <Link
          href="/"
          className="px-5 py-2.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors"
        >
          메인으로
        </Link>
        <Link
          href="/board/DcNotice"
          className="px-5 py-2.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
        >
          공지사항
        </Link>
      </div>
    </div>
  );
}
