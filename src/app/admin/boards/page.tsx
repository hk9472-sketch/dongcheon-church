import prisma from "@/lib/db";
import Link from "next/link";
import GrantGuestWriteButton from "@/components/admin/GrantGuestWriteButton";

export default async function AdminBoardsPage() {
  const boards = await prisma.board.findMany({
    orderBy: { createdAt: "asc" },
    include: { group: { select: { name: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-800">게시판 관리</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <GrantGuestWriteButton />
          <Link
            href="/admin/boards/create"
            className="px-4 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-800 transition-colors"
          >
            + 게시판 생성
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs">
              <th className="py-2.5 px-4 text-left font-medium">ID</th>
              <th className="py-2.5 px-4 text-left font-medium">게시판명</th>
              <th className="py-2.5 px-4 text-center font-medium">유형</th>
              <th className="py-2.5 px-4 text-center font-medium">스킨</th>
              <th className="py-2.5 px-4 text-center font-medium">그룹</th>
              <th className="py-2.5 px-4 text-center font-medium">글 수</th>
              <th className="py-2.5 px-4 text-center font-medium">생성일</th>
              <th className="py-2.5 px-4 text-center font-medium">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {boards.map((b) => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="py-2.5 px-4 font-mono text-xs text-gray-500">{b.slug}</td>
                <td className="py-2.5 px-4">
                  <Link href={`/board/${b.slug}`} className="text-gray-800 hover:text-blue-600">
                    {b.title}
                  </Link>
                </td>
                <td className="py-2.5 px-4 text-center">
                  <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
                    {b.boardType}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-center text-xs text-gray-500">
                  {b.skinName || "기본"}
                </td>
                <td className="py-2.5 px-4 text-center text-xs text-gray-500">
                  {b.group.name}
                </td>
                <td className="py-2.5 px-4 text-center text-gray-600">{b.totalPosts}</td>
                <td className="py-2.5 px-4 text-center text-xs text-gray-500">
                  {b.createdAt.toLocaleDateString("ko-KR")}
                </td>
                <td className="py-2.5 px-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Link
                      href={`/admin/boards/${b.id}/edit`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      설정
                    </Link>
                    <span className="text-gray-300">|</span>
                    <Link
                      href={`/board/${b.slug}`}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      보기
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {boards.length === 0 && (
          <div className="py-12 text-center text-gray-400 text-sm">
            등록된 게시판이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
