import prisma from "@/lib/db";

const SITE_URL = process.env.SITE_URL || "https://pkistdc.net";

export async function GET() {
  // 게시판 목록
  const boards = await prisma.board.findMany({
    select: { slug: true, updatedAt: true },
  });

  // 최근 게시글 (최대 1000개)
  const posts = await prisma.post.findMany({
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
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
