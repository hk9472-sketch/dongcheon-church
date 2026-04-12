/**
 * 성경 MP3 파일 복사 스크립트
 * D:\Bible\*.mp3 → public/bibles/{bookId}_{chapter}.mp3
 *
 * 사용법: npx tsx scripts/copy-bible-audio.ts
 */

import * as fs from "fs";
import * as path from "path";

const SOURCE_DIR = "D:\\Bible";
const DEST_DIR = path.join(__dirname, "..", "data", "bibles");

function main() {
  // 대상 폴더 생성
  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".mp3"));
  console.log(`MP3 파일 ${files.length}개 발견\n`);

  let copied = 0;

  for (const file of files) {
    // 파일명 패턴: 01.창_001.mp3 → bookNum=1, chapter=1
    const match = file.match(/^(\d+)\..+_(\d+)\.mp3$/);
    if (!match) {
      console.log(`⚠ 건너뜀 (패턴 불일치): ${file}`);
      continue;
    }

    const bookId = parseInt(match[1], 10);
    const chapter = parseInt(match[2], 10);
    const destName = `${bookId}_${chapter}.mp3`;
    const srcPath = path.join(SOURCE_DIR, file);
    const destPath = path.join(DEST_DIR, destName);

    fs.copyFileSync(srcPath, destPath);
    copied++;
  }

  console.log(`\n복사 완료: ${copied}개 파일 → ${DEST_DIR}`);
}

main();
