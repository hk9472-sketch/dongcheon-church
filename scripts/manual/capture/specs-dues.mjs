// 월정관리(전도회·건축) 매뉴얼 캡처 — 가상 DB 서버(localhost:3100) 기준.
// 실행: node specs-dues.mjs [파일명일부]
// 출력: public/help/dues/*.png
// 주의: 저장·삭제·반영 버튼은 누르지 않는다 (입력 상태·모달만 캡처).
import { run } from "./shot.mjs";

const C = "aside.w-48 + div"; // 본문 영역
const J = "/accounting/dues/jeondo";
const B = "/accounting/dues/build";
const TB = `${C} div.bg-white.rounded-lg.p-3`; // 상단 조회/도구 막대 (첫 번째 = 상단)
const LAST = `${C} div.flex-wrap.gap-x-4`; // 최종입력 · 입력자 줄 (LastInputBar)

const wait = (p, ms = 400) => p.waitForTimeout(ms);
const loc = (page, s) => (typeof s === "function" ? s(page) : page.locator(s).first());
const top = async (page) => {
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await wait(page, 200);
};

/** top~bottom 요소를 감싸는 투명 상자(#__cb)를 만든다 → clip: "#__cb" */
async function region(page, topSel, bottomSel, { left = C, padTop = -6, padBottom = -4 } = {}) {
  await top(page);
  const t = await loc(page, topSel).boundingBox();
  const b = await loc(page, bottomSel).boundingBox();
  const l = await loc(page, left).boundingBox();
  await page.evaluate(
    ({ x, y, w, h }) => {
      document.getElementById("__cb")?.remove();
      const d = document.createElement("div");
      d.id = "__cb";
      Object.assign(d.style, { position: "absolute", left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, pointerEvents: "none" });
      document.body.appendChild(d);
    },
    { x: l.x, y: t.y - padTop, w: l.width, h: b.y + b.height - t.y + padTop + padBottom },
  );
}

// ── 입금(DepositTable) 신규(노란) 행 ──
const yellow = (page, i = -1) => (i < 0 ? page.locator("tr.bg-yellow-50").last() : page.locator("tr.bg-yellow-50").nth(i));
async function fillDepositRow(page, no, amount, desc) {
  const r = yellow(page);
  await r.locator("td:nth-child(2) input").fill(String(no));
  await r.locator("td:nth-child(2) input").press("Tab");
  await wait(page, 900);
  if (amount) await r.locator("td:nth-child(4) input").fill(String(amount));
  if (desc) await r.locator("td:nth-child(6) input").fill(desc);
}

// ── 일괄입금(DepositMatrix) 칸: 행 r(1부터), 월 m → td 위치 m+2 ──
const mcell = (r, m) => `tbody tr:nth-child(${r}) td:nth-child(${m + 2})`;
async function check(page, r, m) {
  await page.locator(`${mcell(r, m)} input[type=checkbox]`).click();
  await wait(page, 100);
}

// ── 회원별 현황(MemberReport) 칸: 행 r, 월 m → td 위치 m+3 ──
const rcell = (r, m) => `tbody tr:nth-child(${r}) td:nth-child(${m + 3})`;

await run([
  // ================= 업무 흐름 (dues-guide) =================
  {
    file: "dues/guide-menu.png", path: `${J}/dues`,
    prepare: (p) => region(p, "aside button:has-text('월정관리')", "aside >> text=\"건축 회원별 현황\"", { left: "aside.w-48" }),
    marks: [
      { sel: "aside >> text=\"전도회월정\"", n: 1, side: "tr", pad: 0 },
      { sel: "aside >> text=\"전도회입금\"", n: 2, side: "tr", pad: 0 },
      { sel: "aside >> text=\"전도회입금(일괄)\"", n: 3, side: "tr", pad: 0 },
      { sel: "aside >> text=\"전도회 기간별 현황\"", n: 4, side: "tr", pad: 0 },
      { sel: "aside >> text=\"전도회 회원별 현황\"", n: 5, side: "tr", pad: 0 },
      { sel: "aside >> text=\"건축월정\"", n: 6, side: "tr", pad: 0 },
    ],
    clip: "#__cb", clipPad: 14,
  },
  {
    file: "dues/guide-1-dues.png", path: `${J}/dues`,
    prepare: (p) => region(p, `${C} h1`, "tbody tr:nth-child(3)"),
    marks: [
      { sel: `${TB} input[type=number]`, n: 1, el: "parent" },
      { sel: "button:has-text('전년회원 불러오기')", n: 2 },
      { sel: "button:has-text('일괄 저장')", n: 4 },
      { sel: "tbody tr:nth-child(1) td:nth-child(3) input", n: 3 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/guide-2-matrix.png", path: `${J}/deposit-matrix`,
    prepare: async (p) => {
      for (const r of [1, 2, 5, 6]) await check(p, r, 11);
      await region(p, `${C} h1`, "tbody tr:nth-child(6)");
    },
    marks: [
      { sel: `${TB} input[type=date]`, n: 1, el: "parent" },
      { sel: mcell(1, 11), n: 2, pad: 2 },
      { sel: mcell(2, 11), n: "", pad: 2 },
      { sel: mcell(5, 11), n: "", pad: 2 },
      { sel: mcell(6, 11), n: "", pad: 2 },
      { sel: "button:has-text('선택 저장')", n: 3 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/guide-3-deposit.png", path: `${J}/deposit`, height: 1200,
    prepare: async (p) => {
      await fillDepositRow(p, 3, 20000);
      await region(p, `${C} thead`, `${C} div.sticky`);
    },
    marks: [
      { sel: (p) => yellow(p), n: 1, pad: 2 },
      { sel: (p) => yellow(p).locator("td:nth-child(8) button").first(), n: 2 },
      { sel: `${C} div.sticky button:has-text('일괄 저장')`, n: 3 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/guide-4-member.png", path: `${J}/by-member`,
    prepare: (p) => region(p, `${C} h1`, "tbody tr:nth-child(5)"),
    marks: [
      { sel: rcell(3, 10), n: 1, pad: 2 },
      { sel: rcell(4, 8), n: 2, pad: 2 },
      { sel: rcell(4, 9), n: "", pad: 2 },
      { sel: rcell(4, 10), n: "", pad: 2 },
      { sel: "tbody tr:nth-child(4) td:nth-child(16)", n: 3, pad: 2 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/guide-5-reflect.png", path: `${J}/deposit`,
    prepare: async (p) => {
      await p.locator(`${TB} input[type=date]`).nth(0).fill("2026-10-01");
      await p.locator(`${TB} input[type=date]`).nth(1).fill("2026-10-31");
      await wait(p, 800);
      await region(p, `${C} h1`, "tbody tr:nth-child(3)");
    },
    marks: [
      { sel: `${TB} input[type=date] >> nth=0`, n: 1, el: "parent" },
      { sel: `${TB} input[type=date] >> nth=1`, n: "", el: "parent" },
      { sel: "button:has-text('회계 반영')", n: 2 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/guide-6-modal.png", path: `${J}/deposit`,
    prepare: async (p) => {
      await p.locator(`${TB} input[type=date]`).nth(0).fill("2026-10-01");
      await p.locator(`${TB} input[type=date]`).nth(1).fill("2026-10-31");
      await wait(p, 800);
      await p.locator("button:has-text('회계 반영')").click();
      await top(p);
    },
    marks: [
      { sel: ".fixed button:text-is('개별')", n: 1 },
      { sel: ".fixed button:text-is('일괄')", n: 2 },
    ],
    clip: ".fixed div.max-w-md", clipPad: 30,
  },
  {
    file: "dues/guide-7-mapping.png", path: "/accounting/settings/account-mapping",
    prepare: (p) => region(p, `${C} h1`, "tr:has-text('건축 월정입금')"),
    marks: [
      { sel: "tr:has-text('전도회 월정입금')", n: 1, pad: 2 },
      { sel: "tr:has-text('건축 월정입금')", n: 2, pad: 2 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/guide-8-vouchers.png", path: "/accounting/vouchers",
    prepare: async (p) => {
      await p.locator(`${C} input[type=date]`).nth(0).fill("2026-09-01");
      await p.locator(`${C} input[type=date]`).nth(1).fill("2026-10-31");
      await p.locator(`${C} select`).nth(0).selectOption({ label: "전도회계" });
      await p.locator(`${C} button:text-is('조회')`).click();
      await wait(p, 1200);
      await region(p, `${C} h1`, `${C} table`);
    },
    marks: [
      { sel: `${C} select >> nth=0`, n: 1, el: "parent" },
      { sel: `${C} tbody tr:has-text('전도회비') >> nth=0`, n: 2, pad: 2 },
    ],
    clip: "#__cb", maxHeight: 900,
  },

  // ================= 월정 (dues-dues) =================
  {
    file: "dues/dues-1.png", path: `${J}/dues`,
    marks: [
      { sel: `${TB} input[type=number]`, n: 1, el: "parent" },
      { sel: "button:text-is('조회')", n: 2 },
      { sel: "button:has-text('전년회원 불러오기')", n: 3 },
      { sel: "button:has-text('일괄 저장')", n: 4 },
      { sel: "button:has-text('회원 추가')", n: 5 },
      { sel: "tbody tr:nth-child(1) td:nth-child(1)", n: 6, pad: 2 },
      { sel: "tbody tr:nth-child(1) td:nth-child(2) input", n: 7 },
      { sel: "tbody tr:nth-child(1) td:nth-child(3) input", n: 8 },
      { sel: "tbody tr:nth-child(1) td:nth-child(4)", n: 9, pad: 2 },
      { sel: "tbody tr:nth-child(1) td:nth-child(5) div", n: 10 },
      { sel: "tr.bg-yellow-50", n: 11, pad: 2 },
      { sel: "tfoot tr", n: 12, pad: 2 },
    ],
    clip: C, maxHeight: 1150,
  },
  {
    file: "dues/dues-2-new.png", path: `${J}/dues`,
    prepare: async (p) => {
      const r = p.locator("tr.bg-yellow-50").last();
      await r.locator("td:nth-child(2) input").fill("새회원");
      await r.locator("td:nth-child(3) input").fill("20000");
      await region(p, "tbody tr:nth-child(15)", "tfoot tr");
    },
    marks: [
      { sel: "tr.bg-yellow-50 td:nth-child(1) input", n: 1 },
      { sel: "tr.bg-yellow-50 td:nth-child(2) input", n: 2 },
      { sel: "tr.bg-yellow-50 td:nth-child(3) input", n: 3 },
      { sel: "tr.bg-yellow-50 button:has-text('등록')", n: 4 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/dues-3-edit.png", path: `${J}/dues`,
    prepare: async (p) => {
      await p.locator("tbody tr:nth-child(8) td:nth-child(3) input").fill("15000");
      await region(p, TB, "tbody tr:nth-child(9)");
    },
    marks: [
      { sel: "tbody tr:nth-child(8) td:nth-child(3) input", n: 1 },
      { sel: "tbody tr:nth-child(8) td:nth-child(5) button:has-text('저장')", n: 2 },
      { sel: "button:has-text('일괄 저장')", n: 3 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/dues-4-copy.png", path: `${J}/dues`,
    prepare: async (p) => {
      await p.locator("button:has-text('전년회원 불러오기')").click();
      await top(p);
    },
    marks: [
      { sel: ".fixed button:text-is('빈 항목만')", n: 1 },
      { sel: ".fixed button:text-is('덮어쓰기')", n: 2 },
      { sel: ".fixed button:text-is('취소')", n: 3 },
    ],
    clip: ".fixed div.max-w-md", clipPad: 30,
  },
  {
    file: "dues/dues-5-build.png", path: `${B}/dues`,
    prepare: (p) => region(p, `${C} h1`, "tbody tr:nth-child(6)", { padTop: 8 }),
    marks: [{ sel: `${C} h1`, n: 1 }],
    clip: "#__cb",
  },

  // ================= 입금 (dues-deposit) =================
  {
    file: "dues/deposit-1.png", path: `${J}/deposit`,
    marks: [
      { sel: `${TB} input[type=date] >> nth=0`, n: 1, el: "parent" },
      { sel: `${TB} input[type=date] >> nth=1`, n: "", el: "parent" },
      { sel: "button:text-is('조회')", n: 2 },
      { sel: "button:has-text('회계 반영')", n: 3 },
      { sel: `${TB} button:has-text('줄 추가')`, n: 4 },
      { sel: "tbody tr:nth-child(1) td:nth-child(1) input", n: 5 },
      { sel: "tbody tr:nth-child(1) td:nth-child(2) input", n: 6 },
      { sel: "tbody tr:nth-child(1) td:nth-child(3) div", n: 7 },
      { sel: "tbody tr:nth-child(1) td:nth-child(4) input", n: 8 },
      { sel: "tbody tr:nth-child(1) td:nth-child(5) select", n: 9 },
      { sel: "tbody tr:nth-child(1) td:nth-child(6) input", n: 10 },
      { sel: "tbody tr:nth-child(1) td:nth-child(7)", n: 11, pad: 2 },
      { sel: "tbody tr:nth-child(1) td:nth-child(8) div", n: 12 },
      { sel: "tr.bg-yellow-50", n: 13, pad: 2 },
      { sel: "tfoot tr", n: 14, pad: 2 },
      { sel: `${C} div.sticky button:has-text('일괄 저장')`, n: 15 },
    ],
    clip: C, maxHeight: 820,
  },
  {
    file: "dues/deposit-2-number.png", path: `${J}/deposit`, height: 1200,
    prepare: async (p) => {
      await fillDepositRow(p, 3, 20000, "11월분");
      await region(p, "tbody tr:nth-child(9)", `${C} div.sticky`);
    },
    marks: [
      { sel: (p) => yellow(p).locator("td:nth-child(2) input"), n: 1 },
      { sel: (p) => yellow(p).locator("td:nth-child(3) input"), n: 2 },
      { sel: (p) => yellow(p).locator("td:nth-child(4) input"), n: 3 },
      { sel: (p) => yellow(p).locator("td:nth-child(5) select"), n: 4 },
      { sel: (p) => yellow(p).locator("td:nth-child(6) input"), n: 5 },
      { sel: (p) => yellow(p).locator("td:nth-child(8) button").first(), n: 6 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/deposit-3-picker.png", path: `${J}/deposit`,
    prepare: async (p) => {
      await yellow(p).locator("td:nth-child(3) button").click();
      await wait(p, 300);
      await p.locator(".fixed input[placeholder='이름 또는 번호 검색']").fill("윤");
      await top(p);
    },
    marks: [
      { sel: ".fixed input[placeholder='이름 또는 번호 검색']", n: 1 },
      { sel: ".fixed tbody tr >> nth=1", n: 2, pad: 1 },
    ],
    clip: ".fixed div.max-w-md", clipPad: 30,
  },
  {
    file: "dues/deposit-4-candidates.png", path: `${J}/deposit`,
    prepare: async (p) => {
      const r = yellow(p);
      await r.locator("td:nth-child(3) input").fill("윤");
      await r.locator("td:nth-child(3) input").press("Tab");
      await wait(p, 400);
      await top(p);
    },
    marks: [{ sel: ".fixed li >> nth=0", n: 1, pad: 1 }],
    clip: ".fixed div.max-w-sm", clipPad: 30,
  },
  {
    file: "dues/deposit-5-multi.png", path: `${J}/deposit`, height: 1300,
    prepare: async (p) => {
      await fillDepositRow(p, 3, 20000);
      await p.locator(`${C} div.sticky button:has-text('줄 추가')`).click();
      await wait(p, 200);
      await fillDepositRow(p, 8, 10000);
      await p.locator(`${C} div.sticky button:has-text('줄 추가')`).click();
      await wait(p, 200);
      await fillDepositRow(p, 13, 20000);
      await region(p, "tbody tr:nth-child(10)", `${C} div.sticky`);
    },
    marks: [
      { sel: (p) => yellow(p, 0), n: 1, pad: 2 },
      { sel: (p) => yellow(p, 1), n: "", pad: 2 },
      { sel: (p) => yellow(p, 2), n: "", pad: 2 },
      { sel: `${C} div.sticky button:has-text('줄 추가')`, n: 2 },
      { sel: `${C} div.sticky button:has-text('일괄 저장')`, n: 3 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/deposit-6-reflect.png", path: `${J}/deposit`,
    prepare: async (p) => {
      await p.locator(`${TB} input[type=date]`).nth(0).fill("2026-10-01");
      await p.locator(`${TB} input[type=date]`).nth(1).fill("2026-10-31");
      await wait(p, 800);
      await p.locator("button:has-text('회계 반영')").click();
      await top(p);
    },
    marks: [
      { sel: ".fixed div.max-w-md div.py-3 >> nth=0", n: 1, pad: 2 },
      { sel: ".fixed button:text-is('개별')", n: 2 },
      { sel: ".fixed button:text-is('일괄')", n: 3 },
      { sel: ".fixed button:text-is('취소')", n: 4 },
    ],
    clip: ".fixed div.max-w-md", clipPad: 30,
  },
  {
    file: "dues/deposit-7-edit.png", path: `${J}/deposit`,
    prepare: async (p) => {
      await p.locator("tbody tr:nth-child(1) td:nth-child(4) input").fill("20000");
      await region(p, TB, "tbody tr:nth-child(4)");
    },
    marks: [
      { sel: "tbody tr:nth-child(1) td:nth-child(4) input", n: 1 },
      { sel: "tbody tr:nth-child(1) td:nth-child(8) button:text-is('저장')", n: 2 },
      { sel: "tbody tr:nth-child(1) td:nth-child(8) button:text-is('삭제')", n: 3, side: "tr" },
    ],
    clip: "#__cb",
  },

  // ================= 입금(일괄) (dues-deposit-matrix) =================
  {
    file: "dues/matrix-1.png", path: `${J}/deposit-matrix`,
    marks: [
      { sel: `${TB} input[type=date]`, n: 1, el: "parent" },
      { sel: `${TB} input[placeholder='이름 또는 번호']`, n: 2, el: "parent" },
      { sel: `${TB} div.ml-2`, n: 3 },
      { sel: "button:has-text('선택 저장')", n: 4 },
      { sel: LAST, n: 5 },
      { sel: "thead th:nth-child(3) div.flex", n: 6, pad: 2 },
      { sel: "tbody tr:nth-child(1) td:nth-child(2)", n: 7, pad: 1 },
      { sel: mcell(1, 1), n: 8, pad: 1 },
      { sel: mcell(1, 11), n: 9, pad: 1 },
      { sel: "tbody tr:nth-child(1) td:nth-child(15) div", n: 10, pad: 2 },
    ],
    clip: C, maxHeight: 975,
  },
  {
    file: "dues/matrix-2-check.png", path: `${J}/deposit-matrix`,
    prepare: async (p) => {
      await check(p, 1, 11);
      await check(p, 2, 11);
      for (const m of [8, 9, 10]) await check(p, 4, m);
      await region(p, `${C} h1`, "tbody tr:nth-child(6)");
    },
    marks: [
      { sel: mcell(1, 11), n: 1, pad: 1 },
      { sel: mcell(2, 11), n: "", pad: 1 },
      { sel: mcell(4, 8), n: 2, pad: 1 },
      { sel: mcell(4, 9), n: "", pad: 1 },
      { sel: mcell(4, 10), n: "", pad: 1 },
      { sel: "tbody tr:nth-child(4) td:nth-child(15)", n: 3, pad: 1 },
      { sel: `${TB} div.ml-2`, n: 4 },
      { sel: "button:has-text('선택 저장')", n: 5 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/matrix-3-search.png", path: `${J}/deposit-matrix`,
    prepare: async (p) => {
      await p.locator(`${TB} input[placeholder='이름 또는 번호']`).fill("윤");
      await wait(p, 300);
      for (const m of [8, 9, 10]) await check(p, 3, m);
      await region(p, `${C} h1`, `${C} table`);
    },
    marks: [
      { sel: `${TB} input[placeholder='이름 또는 번호']`, n: 1, el: "parent" },
      { sel: mcell(3, 8), n: 2, pad: 1 },
      { sel: mcell(3, 9), n: "", pad: 1 },
      { sel: mcell(3, 10), n: "", pad: 1 },
      { sel: "button:has-text('선택 저장')", n: 3 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/matrix-4-build.png", path: `${B}/deposit-matrix`,
    prepare: (p) => region(p, `${C} h1`, "tbody tr:nth-child(5)", { padTop: 8 }),
    marks: [{ sel: `${C} h1`, n: 1 }],
    clip: "#__cb",
  },

  // ================= 기간별 현황 (dues-by-period) =================
  {
    file: "dues/period-1.png", path: `${J}/by-period`,
    marks: [
      { sel: `${TB} input[type=date] >> nth=0`, n: 1, el: "parent" },
      { sel: `${TB} input[type=date] >> nth=1`, n: "", el: "parent" },
      { sel: "button:text-is('조회')", n: 2 },
      { sel: `${TB} div.ml-auto`, n: 3 },
      { sel: LAST, n: 4 },
      { sel: "thead th:nth-child(1)", n: 5, pad: 1 },
      { sel: "thead th:nth-child(3)", n: 6, pad: 1 },
      { sel: "tbody tr:nth-child(1) td:nth-child(7)", n: 7, pad: 1 },
    ],
    clip: C, maxHeight: 900,
  },
  {
    file: "dues/period-2-oct.png", path: `${J}/by-period`,
    prepare: async (p) => {
      await p.locator(`${TB} input[type=date]`).nth(0).fill("2026-10-01");
      await p.locator(`${TB} input[type=date]`).nth(1).fill("2026-10-31");
      await wait(p, 1000);
      await p.locator("thead th:nth-child(1)").click();
      await wait(p, 300);
      await region(p, `${C} h1`, "tfoot tr");
    },
    marks: [
      { sel: `${TB} input[type=date] >> nth=0`, n: 1, el: "parent" },
      { sel: `${TB} input[type=date] >> nth=1`, n: "", el: "parent" },
      { sel: `${TB} div.ml-auto`, n: 2 },
      { sel: "thead th:nth-child(1)", n: 3, pad: 1 },
      { sel: "tfoot tr", n: 4, pad: 2 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/period-3-build.png", path: `${B}/by-period`,
    prepare: async (p) => {
      await p.locator(`${TB} input[type=date]`).nth(0).fill("2026-10-01");
      await p.locator(`${TB} input[type=date]`).nth(1).fill("2026-10-31");
      await wait(p, 1000);
      await p.locator("thead th:nth-child(5)").click();
      await wait(p, 200);
      await p.locator("thead th:nth-child(5)").click();
      await wait(p, 300);
      await region(p, `${C} h1`, "tbody tr:nth-child(8)", { padTop: 8 });
    },
    marks: [
      { sel: `${C} h1`, n: 1 },
      { sel: "thead th:nth-child(5)", n: 2, pad: 1 },
    ],
    clip: "#__cb",
  },

  // ================= 회원별 현황 (dues-by-member) =================
  {
    file: "dues/member-1.png", path: `${J}/by-member`,
    marks: [
      { sel: `${TB} input[type=number]`, n: 1, el: "parent" },
      { sel: `${TB} input[placeholder='이름·번호']`, n: 2, el: "parent" },
      { sel: `${TB} label:has-text('숨기기')`, n: 3 },
      { sel: "button:text-is('조회')", n: 4 },
      { sel: `${TB} div.ml-auto`, n: 5 },
      { sel: LAST, n: 6 },
      { sel: "tbody tr:nth-child(1) td:nth-child(3)", n: 7, pad: 1 },
      { sel: rcell(1, 1), n: 8, pad: 1 },
      { sel: rcell(3, 10), n: 9, pad: 1 },
      { sel: "tbody tr:nth-child(1) td:nth-child(16)", n: 10, pad: 1 },
      { sel: "tfoot tr", n: 11, pad: 2 },
    ],
    clip: C, maxHeight: 1115,
  },
  {
    file: "dues/member-2-unpaid.png", path: `${J}/by-member`,
    prepare: async (p) => {
      await p.locator(`${TB} input[placeholder='이름·번호']`).fill("윤");
      await wait(p, 300);
      await region(p, `${C} h1`, `${C} table`);
    },
    marks: [
      { sel: `${TB} input[placeholder='이름·번호']`, n: 1, el: "parent" },
      { sel: rcell(1, 10), n: 2, pad: 1 },
      { sel: rcell(3, 8), n: 3, pad: 1 },
      { sel: rcell(3, 9), n: "", pad: 1 },
      { sel: rcell(3, 10), n: "", pad: 1 },
      { sel: "tbody tr:nth-child(3) td:nth-child(16)", n: 4, pad: 1 },
    ],
    clip: "#__cb",
  },
  {
    file: "dues/member-3-build.png", path: `${B}/by-member`,
    prepare: (p) => region(p, `${C} h1`, "tbody tr:nth-child(4)", { padTop: 8 }),
    marks: [
      { sel: `${C} h1`, n: 1 },
      { sel: `${TB} div.ml-auto`, n: 2 },
    ],
    clip: "#__cb",
  },
]);
