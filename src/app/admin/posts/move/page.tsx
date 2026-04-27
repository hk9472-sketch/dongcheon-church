import prisma from "@/lib/db";
import PostMoveForm from "@/components/admin/PostMoveForm";

export default async function PostMovePage() {
  const boards = await prisma.board.findMany({
    select: { id: true, slug: true, title: true },
    orderBy: { title: "asc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">게시글 이동</h1>
        <p className="mt-1 text-sm text-gray-500">
          게시글 ID 를 입력해 정보를 확인하고 다른 게시판으로 이동시킵니다.
          답글이 있는 글은 트리 전체가 함께 이동합니다.
          이동 후엔 대시보드 우상단의{" "}
          <span className="font-medium text-gray-700">[카운터 재계산]</span>{" "}
          으로 게시판별 글 수를 동기화하세요.
        </p>
      </div>
      <PostMoveForm boards={boards} />
    </div>
  );
}
