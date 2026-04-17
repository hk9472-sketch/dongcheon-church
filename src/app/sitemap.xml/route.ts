import prisma from "@/lib/db";

const SITE_URL = process.env.SITE_URL || "https://pkistdc.net";

// Next.js ISR: 1시간마다 재생성 (요청마다 DB 쿼리 방지)
export const revalidate = 3600;

export async function GET() {
  // 게시판 목록 - 비회원(level=99)이 열람 가능한 공개 게시판만 노출
  // - requireLogin=true: 로그인 필요 게시판 제외
  // - grantList < 99: 회원 전용 목록 권한 게시판 제외
  const boards = await prisma.board.findMany({
    where: {
      requireLogin: false,
      grantList: { gte: 99 },
      grantView: { gte: 99 },
    },
    select: { slug: true, updatedAt: true },
  });

  // 최근 게시글 (최대 1000개) - 비밀글과 비공개 게시판 글은 검색엔진에 노출 금지
  const posts = await prisma.post.findMany({
    where: {
      isSecret: false,
      board: {
        requireLogin: false,
        grantList: { gte: 99 },
        grantView: { gte: 99 },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      id: true,
      boardId: true,
      updatedAt: true,
      board: { select: { slug: true } },
    },
  });

  const now = new Date().toISOString();

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

  // 게시판 페이지
  for (const board of boards) {
    xml += `
  <url>
    <loc>${SITE_URL}/board/${board.slug}</loc>
    <lastmod>${board.updatedAt.toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
  }

  // 게시글 페이지
  for (const post of posts) {
    xml += `
  <url>
    <loc>${SITE_URL}/board/${post.board.slug}/${post.id}</loc>
    <lastmod>${post.updatedAt.toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
  }

  xml += `
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
