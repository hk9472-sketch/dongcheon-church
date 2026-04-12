/**
 * 성경 텍스트 임포트 스크립트
 * D:\Bible\BibleText\kr1.txt ~ kr66.txt (EUC-KR) → DB
 *
 * 사용법: npx tsx scripts/import-bible.ts
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as iconv from "iconv-lite";

const prisma = new PrismaClient();

const BIBLE_DIR = "D:\\Bible\\BibleText";

// 66권 정보: [id, name, shortName, testament]
const BOOKS: [number, string, string, string][] = [
  // 구약 39권
  [1, "창세기", "창", "OT"],
  [2, "출애굽기", "출", "OT"],
  [3, "레위기", "레", "OT"],
  [4, "민수기", "민", "OT"],
  [5, "신명기", "신", "OT"],
  [6, "여호수아", "수", "OT"],
  [7, "사사기", "삿", "OT"],
  [8, "룻기", "룻", "OT"],
  [9, "사무엘상", "삼상", "OT"],
  [10, "사무엘하", "삼하", "OT"],
  [11, "열왕기상", "왕상", "OT"],
  [12, "열왕기하", "왕하", "OT"],
  [13, "역대상", "대상", "OT"],
  [14, "역대하", "대하", "OT"],
  [15, "에스라", "스", "OT"],
  [16, "느헤미야", "느", "OT"],
  [17, "에스더", "에", "OT"],
  [18, "욥기", "욥", "OT"],
  [19, "시편", "시", "OT"],
  [20, "잠언", "잠", "OT"],
  [21, "전도서", "전", "OT"],
  [22, "아가", "아", "OT"],
  [23, "이사야", "사", "OT"],
  [24, "예레미야", "렘", "OT"],
  [25, "예레미야애가", "애", "OT"],
  [26, "에스겔", "겔", "OT"],
  [27, "다니엘", "단", "OT"],
  [28, "호세아", "호", "OT"],
  [29, "요엘", "욜", "OT"],
  [30, "아모스", "암", "OT"],
  [31, "오바댜", "옵", "OT"],
  [32, "요나", "욘", "OT"],
  [33, "미가", "미", "OT"],
  [34, "나훔", "나", "OT"],
  [35, "하박국", "합", "OT"],
  [36, "스바냐", "습", "OT"],
  [37, "학개", "학", "OT"],
  [38, "스가랴", "슥", "OT"],
  [39, "말라기", "말", "OT"],
  // 신약 27권
  [40, "마태복음", "마", "NT"],
  [41, "마가복음", "막", "NT"],
  [42, "누가복음", "눅", "NT"],
  [43, "요한복음", "요", "NT"],
  [44, "사도행전", "행", "NT"],
  [45, "로마서", "롬", "NT"],
  [46, "고린도전서", "고전", "NT"],
  [47, "고린도후서", "고후", "NT"],
  [48, "갈라디아서", "갈", "NT"],
  [49, "에베소서", "엡", "NT"],
  [50, "빌립보서", "빌", "NT"],
  [51, "골로새서", "골", "NT"],
  [52, "데살로니가전서", "살전", "NT"],
  [53, "데살로니가후서", "살후", "NT"],
  [54, "디모데전서", "딤전", "NT"],
  [55, "디모데후서", "딤후", "NT"],
  [56, "디도서", "딛", "NT"],
  [57, "빌레몬서", "몬", "NT"],
  [58, "히브리서", "히", "NT"],
  [59, "야고보서", "약", "NT"],
  [60, "베드로전서", "벧전", "NT"],
  [61, "베드로후서", "벧후", "NT"],
  [62, "요한1서", "요일", "NT"],
  [63, "요한2서", "요이", "NT"],
  [64, "요한3서", "요삼", "NT"],
  [65, "유다서", "유", "NT"],
  [66, "요한계시록", "계", "NT"],
];

interface ParsedVerse {
  chapter: number;
  verse: number;
  content: string;
}

function parseFile(filePath: string): ParsedVerse[] {
  const buffer = fs.readFileSync(filePath);
  const text = iconv.decode(buffer, "euc-kr");
  const lines = text.split("\n");
  const verses: ParsedVerse[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 형식: CC:VV 본문
    const match = trimmed.match(/^(\d+):(\d+)\s+(.+)$/);
    if (match) {
      verses.push({
        chapter: parseInt(match[1], 10),
        verse: parseInt(match[2], 10),
        content: match[3].trim(),
      });
    }
  }

  return verses;
}

async function main() {
  console.log("성경 데이터 임포트 시작...\n");

  // 기존 데이터 삭제
  await prisma.bibleVerse.deleteMany();
  await prisma.bibleBook.deleteMany();
  console.log("기존 데이터 삭제 완료\n");

  let totalVerses = 0;

  for (const [id, name, shortName, testament] of BOOKS) {
    const filePath = path.join(BIBLE_DIR, `kr${id}.txt`);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠ 파일 없음: ${filePath}`);
      continue;
    }

    const verses = parseFile(filePath);
    const maxChapter = Math.max(...verses.map((v) => v.chapter));

    // 책 생성
    await prisma.bibleBook.create({
      data: {
        id,
        name,
        shortName,
        testament,
        totalChapters: maxChapter,
        sortOrder: id,
      },
    });

    // 절 일괄 생성 (batch)
    const BATCH_SIZE = 500;
    for (let i = 0; i < verses.length; i += BATCH_SIZE) {
      const batch = verses.slice(i, i + BATCH_SIZE);
      await prisma.bibleVerse.createMany({
        data: batch.map((v) => ({
          bookId: id,
          chapter: v.chapter,
          verse: v.verse,
          content: v.content,
        })),
      });
    }

    totalVerses += verses.length;
    console.log(
      `✓ ${name} (${shortName}) - ${maxChapter}장 ${verses.length}절`
    );
  }

  console.log(`\n임포트 완료: 66권, 총 ${totalVerses}절`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("임포트 실패:", e);
  prisma.$disconnect();
  process.exit(1);
});
