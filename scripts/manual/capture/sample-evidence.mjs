// 매뉴얼 캡처용 가상 증빙 파일 만들기 — 영수증 이미지(PNG) · 세금계산서 PDF
// (실제 거래처·금액이 아닌 가상 데이터)
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(path.join(REPO, "package.json"));
const sharp = require("sharp");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** 영수증 모양 PNG */
export async function receiptPng({ shop, date, items, total }) {
  const W = 420;
  const lineH = 30;
  const H = 230 + items.length * lineH;
  const rows = items
    .map(
      ([name, amt], i) =>
        `<text x="30" y="${170 + i * lineH}" font-size="18">${esc(name)}</text>` +
        `<text x="390" y="${170 + i * lineH}" font-size="18" text-anchor="end">${amt.toLocaleString("ko-KR")}</text>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="#fffef8"/>
    <g font-family="Malgun Gothic, Apple SD Gothic Neo, NanumGothic, sans-serif" fill="#222">
      <text x="${W / 2}" y="50" font-size="26" font-weight="bold" text-anchor="middle">영 수 증</text>
      <text x="30" y="95" font-size="17">${esc(shop)}</text>
      <text x="30" y="122" font-size="15" fill="#555">${esc(date)}</text>
      <line x1="25" y1="138" x2="${W - 25}" y2="138" stroke="#999" stroke-dasharray="4 3"/>
      ${rows}
      <line x1="25" y1="${150 + items.length * lineH}" x2="${W - 25}" y2="${150 + items.length * lineH}" stroke="#999" stroke-dasharray="4 3"/>
      <text x="30" y="${185 + items.length * lineH}" font-size="20" font-weight="bold">합계</text>
      <text x="390" y="${185 + items.length * lineH}" font-size="20" font-weight="bold" text-anchor="end">${total.toLocaleString("ko-KR")}원</text>
      <text x="${W / 2}" y="${H - 15}" font-size="12" fill="#888" text-anchor="middle">(매뉴얼용 가상 영수증)</text>
    </g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** 최소 PDF (영문 한 줄) — 증빙 PDF 예시 */
export function samplePdf(title) {
  const text = title.replace(/[()\\]/g, "");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null, // contents
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 24 Tf 60 760 Td (TAX INVOICE - SAMPLE) Tj 0 -40 Td /F1 14 Tf (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
