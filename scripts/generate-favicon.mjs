import sharp from "sharp";
import fs from "fs";
import path from "path";

async function generateFavicon() {
  const size = 256;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="32" fill="#1e40af"/>
    <text x="128" y="100" text-anchor="middle" dominant-baseline="central"
          font-family="Malgun Gothic,맑은 고딕,NanumGothic,sans-serif"
          font-size="72" font-weight="bold" fill="#ffffff">동천</text>
    <text x="128" y="185" text-anchor="middle" dominant-baseline="central"
          font-family="Malgun Gothic,맑은 고딕,NanumGothic,sans-serif"
          font-size="72" font-weight="bold" fill="#ffffff">교회</text>
  </svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();

  // 여러 사이즈 생성
  for (const s of [16, 32, 48, 64, 128, 180, 192, 256]) {
    const resized = await sharp(pngBuffer).resize(s, s).png().toBuffer();
    fs.writeFileSync(path.join("public", `icon-${s}.png`), resized);
    console.log(`Generated public/icon-${s}.png`);
  }

  // favicon.ico 대체 (32x32 PNG)
  const ico = await sharp(pngBuffer).resize(32, 32).png().toBuffer();
  fs.writeFileSync(path.join("src", "app", "favicon.ico"), ico);
  console.log("Generated src/app/favicon.ico");

  // Apple touch icon
  const apple = await sharp(pngBuffer).resize(180, 180).png().toBuffer();
  fs.writeFileSync(path.join("public", "apple-touch-icon.png"), apple);
  console.log("Generated public/apple-touch-icon.png");

  console.log("\nDone!");
}

generateFavicon().catch(console.error);
