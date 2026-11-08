// 매뉴얼 캡처 도구 — 가상 DB 서버(localhost:3100)를 Edge 로 열어 화면을 찍고 번호 표시를 얹는다.
//
// spec = {
//   file: "accounting/entry-1.png",          // public/help/ 아래 저장 경로
//   path: "/accounting/entry",
//   width: 1280, height: 900,                // 뷰포트 (기본 1280x900)
//   prepare: async (page) => {},             // 입력·클릭 등 사전 동작 (선택)
//   marks: [{ sel: "label:has-text('통장')", n: 1, pad: 4, el: "parent" }],   // 번호 상자
//   clip: "main" | "#id" | null,             // 이 요소만 잘라 찍기 (null = 뷰포트, "full" = 전체 페이지)
// }
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../public/help");
const BASE = process.env.CAP_BASE || "http://localhost:3100";
const EDGE = process.env.CAP_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  for (let i = 0; i < 40; i++) {
    const busy = await page.locator("text=/불러오는 중|로딩|Loading/").count().catch(() => 0);
    if (!busy) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(300);
}

async function drawMarks(page, marks) {
  const boxes = [];
  for (const m of marks || []) {
    let loc = typeof m.sel === "function" ? m.sel(page) : page.locator(m.sel).first();
    if (m.el === "parent") loc = loc.locator("xpath=..");
    const b = await loc.boundingBox().catch(() => null);
    if (!b) { console.log("  ! mark not found:", m.n, String(m.sel)); continue; }
    boxes.push({ ...b, n: String(m.n ?? ""), pad: m.pad ?? 4, color: m.color || "#e11d48", side: m.side || "tl" });
  }
  await page.evaluate((boxes) => {
    document.querySelectorAll(".__mk").forEach((e) => e.remove());
    const sx = window.scrollX, sy = window.scrollY;
    for (const b of boxes) {
      const r = document.createElement("div");
      r.className = "__mk";
      Object.assign(r.style, {
        position: "absolute", left: `${b.x + sx - b.pad}px`, top: `${b.y + sy - b.pad}px`,
        width: `${b.width + b.pad * 2}px`, height: `${b.height + b.pad * 2}px`,
        border: `3px solid ${b.color}`, borderRadius: "8px", zIndex: 99998, pointerEvents: "none",
        boxShadow: "0 0 0 2px rgba(255,255,255,.8)",
      });
      document.body.appendChild(r);
      if (b.n) {
        const c = document.createElement("div");
        c.className = "__mk";
        c.textContent = b.n;
        const left = b.side === "tr" ? b.x + sx + b.width + b.pad - 12 : b.x + sx - b.pad - 12;
        Object.assign(c.style, {
          position: "absolute", left: `${left}px`, top: `${b.y + sy - b.pad - 12}px`,
          minWidth: "24px", height: "24px", padding: "0 4px", borderRadius: "12px", background: b.color, color: "#fff",
          font: "bold 14px/24px sans-serif", textAlign: "center", zIndex: 99999, pointerEvents: "none",
          boxShadow: "0 1px 3px rgba(0,0,0,.4)",
        });
        document.body.appendChild(c);
      }
    }
  }, boxes);
}

export async function run(specs) {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await ctx.addCookies([{ name: "dc_session", value: "manual-demo-session", domain: "localhost", path: "/" }, ...(process.env.NOREAUTH ? [] : [{ name: "dc_reauth", value: "1", domain: "localhost", path: "/" }])]);
  const only = process.argv[2];
  for (const s of specs) {
    if (only && !s.file.includes(only)) continue;
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await page.setViewportSize({ width: s.width || 1280, height: s.height || 900 });
    try {
      await page.goto(BASE + s.path, { waitUntil: "domcontentloaded", timeout: 60000 });
      await settle(page);
      if (s.prepare) { await s.prepare(page); await settle(page); }
      if (!s.allowModal && (await page.locator('a:has-text("새 창에서 크게 보기")').count()) > 0) console.log("  ! 도움말 팝업이 열린 상태:", s.file);
      await drawMarks(page, s.marks);
      const out = path.join(OUT, s.file);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      if (s.clip === "full") await page.screenshot({ path: out, fullPage: true });
      else if (s.clip) {
        const pad = s.clipPad ?? 16;
        const b = await page.locator(s.clip).first().boundingBox();
        await page.screenshot({ path: out, fullPage: true, clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: Math.min(b.height + pad * 2, s.maxHeight || 1400) } });
      } else await page.screenshot({ path: out });
      console.log("ok", s.file);
    } catch (e) {
      console.log("ERR", s.file, e.message.split("\n")[0]);
    }
    await page.close();
  }
  await browser.close();
}
