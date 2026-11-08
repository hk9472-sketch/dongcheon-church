/**
 * 행정실(회계) · 연보관리 · 월정관리 매뉴얼(도움말) 일괄 반영.
 *
 * 사용 (서버, ~/pkistdc 에서):
 *   npx tsx scripts/seed-help-manuals.ts            # 전체
 *   npx tsx scripts/seed-help-manuals.ts accounting # 영역 하나만 (accounting | offering | dues)
 *
 * help_pages 를 slug 기준 upsert — 같은 slug 의 기존 도움말은 이 내용으로 교체된다.
 * 매뉴얼 이미지는 public/help/<영역>/ 에 있고 git 으로 함께 배포된다.
 */
import prisma from "../src/lib/db";
import type { HelpSeed } from "./help/html";
import { PAGES as ACCOUNTING } from "./help/accounting";
import { PAGES as OFFERING } from "./help/offering";
import { PAGES as DUES } from "./help/dues";

const AREAS: Record<string, HelpSeed[]> = { accounting: ACCOUNTING, offering: OFFERING, dues: DUES };

/**
 * 소스의 줄바꿈 · 들여쓰기 제거.
 * sanitizeHtml 이 '연속 공백(2+)' 을 &nbsp; 로 바꾸므로, 태그 사이 들여쓰기가 남으면
 * 목록 줄 사이에 빈 줄이 생긴다. 태그 사이 공백은 없애고, 글 중간 줄바꿈은 공백 한 칸으로.
 */
function compact(html: string): string {
  return html.replace(/>\s*\n\s*</g, "><").replace(/[ \t]*\n[ \t]*/g, " ").trim();
}

async function main() {
  const only = process.argv[2];
  if (only && !AREAS[only]) {
    console.error(`알 수 없는 영역: ${only} (accounting | offering | dues)`);
    process.exit(1);
  }
  const pages = (only ? AREAS[only] : Object.values(AREAS).flat()).map((p) => ({ ...p, content: compact(p.content) }));
  let created = 0;
  let updated = 0;
  for (const page of pages) {
    const existing = await prisma.helpPage.findUnique({ where: { slug: page.slug }, select: { id: true } });
    await prisma.helpPage.upsert({
      where: { slug: page.slug },
      update: { title: page.title, content: page.content, sortOrder: page.sortOrder },
      create: page,
    });
    if (existing) updated++;
    else created++;
  }
  console.log(`매뉴얼 반영 완료 — 신규 ${created}개, 교체 ${updated}개 (총 ${pages.length}개)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
