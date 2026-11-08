import { notFound } from "next/navigation";
import type { Metadata } from "next";
import prisma from "@/lib/db";
import { sanitizeHtml } from "@/lib/sanitize";

// 도움말(매뉴얼) 전체 화면 보기 — 도움말 팝업의 "새 창에서 크게 보기" 링크 대상.
// 도움말 조회 API(/api/admin/help?slug=) 와 같이 공개. 내용은 help_pages 그대로.

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

async function load(slug: string) {
  if (!/^[a-z0-9-]{1,100}$/i.test(slug)) return null;
  return prisma.helpPage.findUnique({ where: { slug } });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await load(slug);
  return { title: page ? `${page.title} — 매뉴얼` : "매뉴얼" };
}

export default async function ManualPage({ params }: Props) {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) notFound();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6 pb-3 border-b border-gray-200">
        <p className="text-xs text-gray-400 mb-1">사용 매뉴얼</p>
        <h1 className="text-2xl font-bold text-gray-800">{page.title}</h1>
      </div>
      <div
        className="prose help-content max-w-none bg-white rounded-xl border border-gray-200 p-6 print:border-0 print:p-0"
        style={{ fontSize: "1.05rem" }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.content) }}
      />
    </div>
  );
}
