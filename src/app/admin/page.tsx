import prisma from "@/lib/db";
import Link from "next/link";
import CounterRecalcButton from "@/components/admin/CounterRecalcButton";
import HelpButton from "@/components/HelpButton";

export default async function AdminDashboard() {
  const [boardCount, userCount, postCount, commentCount] = await Promise.all([
    prisma.board.count(),
    prisma.user.count(),
    prisma.post.count(),
    prisma.comment.count(),
  ]);

  const recentBoards = await prisma.board.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, slug: true, title: true, boardType: true, totalPosts: true, skinName: true, createdAt: true },
  });

  const stats = [
    { label: "게시판", value: boardCount, icon: "📋", color: "blue" },
    { label: "회원", value: userCount, icon: "👥", color: "green" },
    { label: "게시글", value: postCount, icon: "📝", color: "purple" },
    { label: "댓글", value: commentCount, icon: "💬", color: "orange" },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-green-50 border-green-200 text-green-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">관리자 대시보드 <HelpButton slug="admin-dashboard" /></h1>
        <CounterRecalcButton />
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-lg border p-4 ${colorMap[stat.color]}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{stat.icon}</span>
              <span className="text-2xl font-bold">{stat.value}</span>
            </div>
            <p className="text-sm mt-1 opacity-80">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* 게시판 목록 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-bold text-gray-700">게시판 목록</h2>
          <Link href="/admin/boards/create" className="text-xs text-blue-600 hover:underline">
            + 새 게시판
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500 text-xs">
              <th className="py-2 px-4 text-left font-medium">ID (slug)</th>
              <th className="py-2 px-4 text-left font-medium">제목</th>
              <th className="py-2 px-4 text-center font-medium">유형</th>
              <th className="py-2 px-4 text-center font-medium">스킨</th>
              <th className="py-2 px-4 text-center font-medium">글 수</th>
              <th className="py-2 px-4 text-center font-medium">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {recentBoards.map((b) => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="py-2 px-4 font-mono text-xs text-gray-500">{b.slug}</td>
                <td className="py-2 px-4 text-gray-800">{b.title}</td>
                <td className="py-2 px-4 text-center">
                  <span className="inline-block px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
                    {b.boardType}
                  </span>
                </td>
                <td className="py-2 px-4 text-center text-xs text-gray-500">
                  {b.skinName || "기본"}
                </td>
                <td className="py-2 px-4 text-center text-gray-600">{b.totalPosts}</td>
                <td className="py-2 px-4 text-center">
                  <Link
                    href={`/admin/boards/${b.id}/edit`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    설정
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
