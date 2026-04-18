/**
 * 게시글 첨부파일 존재 여부 감사
 *
 * 사용법:
 *   npx tsx scripts/audit-attachments.ts              # 요약
 *   npx tsx scripts/audit-attachments.ts --csv > missing.csv  # CSV 로 출력
 */
import prisma from "../src/lib/db";
import { existsSync, statSync } from "fs";
import path from "path";

async function main() {
  const csvMode = process.argv.includes("--csv");

  const posts = await prisma.post.findMany({
    where: {
      OR: [
        { fileName1: { not: null } },
        { fileName2: { not: null } },
      ],
    },
    select: {
      id: true,
      boardId: true,
      subject: true,
      fileName1: true,
      fileName2: true,
      origName1: true,
      origName2: true,
      board: { select: { slug: true } },
    },
    orderBy: { id: "asc" },
  });

  if (csvMode) {
    console.log("postId,boardSlug,fileNo,dbFileName,exists,sizeBytes,subject");
  }

  let total = 0;
  let ok = 0;
  let missing = 0;
  const missingByBoard: Record<string, number> = {};

  for (const p of posts) {
    for (const n of [1, 2] as const) {
      const fn = n === 1 ? p.fileName1 : p.fileName2;
      if (!fn) continue;
      total++;
      const full = path.join(process.cwd(), fn);
      const exists = existsSync(full);
      const size = exists ? statSync(full).size : 0;
      if (exists) {
        ok++;
      } else {
        missing++;
        const b = p.board?.slug ?? "?";
        missingByBoard[b] = (missingByBoard[b] ?? 0) + 1;
      }
      if (csvMode) {
        console.log(
          [
            p.id,
            p.board?.slug ?? "",
            n,
            `"${fn.replace(/"/g, '""')}"`,
            exists ? "Y" : "N",
            size,
            `"${p.subject.replace(/"/g, '""').slice(0, 60)}"`,
          ].join(",")
        );
      }
    }
  }

  if (!csvMode) {
    console.log("\n=== 첨부파일 감사 요약 ===");
    console.log(`총 첨부 레코드: ${total}`);
    console.log(`디스크 존재   : ${ok}`);
    console.log(`디스크 없음   : ${missing} (${Math.round((missing / total) * 100)}%)`);
    if (missing > 0) {
      console.log("\n게시판별 누락:");
      const sorted = Object.entries(missingByBoard).sort((a, b) => b[1] - a[1]);
      for (const [slug, cnt] of sorted) {
        console.log(`  ${slug.padEnd(20)} ${cnt}건`);
      }
      console.log("\n상세 목록:  npx tsx scripts/audit-attachments.ts --csv > missing.csv");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
