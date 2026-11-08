// public/help/<영역>/*.png 를 팔레트 PNG 로 줄인다 (화면 캡처는 색이 적어 화질 차이 거의 없음)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(path.join(REPO, "package.json"));
const sharp = require("sharp");
const ROOT = path.join(REPO, "public/help");
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["accounting", "offering", "dues"];
let before = 0, after = 0;
for (const d of dirs) {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".png"))) {
    const p = path.join(dir, f);
    const src = fs.readFileSync(p);
    // 이미 팔레트 PNG(최적화됨)면 건너뜀 — 반복 압축으로 화질이 떨어지지 않게
    const meta = await sharp(src).metadata();
    if (meta.paletteBitDepth || meta.isPalette) { before += src.length; after += src.length; continue; }
    const out = await sharp(src).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toBuffer();
    before += src.length;
    if (out.length < src.length) { fs.writeFileSync(p, out); after += out.length; } else after += src.length;
  }
}
console.log(`PNG 최적화: ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`);
