import prisma from "@/lib/db";
import MemberListClient from "@/components/admin/MemberListClient";

interface PageProps {
  searchParams: Promise<{ page?: string; keyword?: string; level?: string; sort?: string; order?: string }>;
}

export default async function AdminMembersPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const page = Math.max(1, parseInt(query.page || "1", 10) || 1);
  const perPage = 20;
  const keyword = query.keyword || "";
  const levelFilter = query.level || "";
  const sortField = query.sort || "createdAt";
  const sortOrder = query.order === "asc" ? "asc" : "desc";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = [];

  if (keyword) {
    conditions.push({
      OR: [
        { userId: { contains: keyword } },
        { name: { contains: keyword } },
        { email: { contains: keyword } },
      ],
    });
  }

  if (levelFilter) {
    const lv = parseInt(levelFilter, 10);
    if (!isNaN(lv)) {
      conditions.push({ level: lv });
    }
  }

  const where = conditions.length > 0 ? { AND: conditions } : {};

  // 정렬 필드 매핑
  const validSorts: Record<string, string> = {
    id: "id",
    userId: "userId",
    name: "name",
    level: "level",
    createdAt: "createdAt",
  };
  const orderByField = validSorts[sortField] || "createdAt";

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { [orderByField]: sortOrder },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        userId: true,
        name: true,
        email: true,
        level: true,
        isAdmin: true,
        phone: true,
        createdAt: true,
        _count: { select: { posts: true, comments: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // 서버 컴포넌트에서 Date 객체를 직렬화하여 클라이언트에 전달
  const serializedUsers = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <MemberListClient
      users={serializedUsers}
      total={total}
      page={page}
      totalPages={totalPages}
      keyword={keyword}
      levelFilter={levelFilter}
      sortField={sortField}
      sortOrder={sortOrder as "asc" | "desc"}
    />
  );
}
