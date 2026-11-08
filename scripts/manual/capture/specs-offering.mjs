// 연보관리 매뉴얼 캡처 spec — 가상 DB 서버(localhost:3100) 기준.
//   전체:   node specs-offering.mjs
//   일부:   node specs-offering.mjs settlement   (파일명 일부)
// 주의: 저장(확정) 버튼은 누르지 않는다. 입력 화면은 '입력한 상태'까지만 찍는다.
//       일별결산 '전표 반영' 은 모달이 열린 상태까지만.
import { run } from "./shot.mjs";

const C = "aside.w-48 + div"; // 본문 영역
const MODAL = "div.fixed.inset-0 > div.bg-white"; // 모달 본체
const D = "2026-11-08"; // 가상 데이터 기준일 (주일)

const wait = (page, ms = 800) => page.waitForTimeout(ms);
async function idle(page, ms = 600) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

// 사이드바: 행정실·월정관리 접고 연보관리만 펼친 상태로 (페이지 길이 축소 + 메뉴 캡처용)
async function ensureSide(page) {
  const ctx = page.context();
  if (ctx.__sideInit) return;
  ctx.__sideInit = true;
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("accountingSidebarCollapsed", JSON.stringify({ ledger: true, offering: false, dues: true }));
    } catch {}
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await idle(page, 900);
}

async function fillDate(page, sel, v) {
  const loc = page.locator(sel).first();
  await loc.fill(v);
  await loc.blur().catch(() => {});
  await idle(page, 500);
}

// 회원 검색 드롭다운에서 선택
async function pickMember(page, inputSel, query, name) {
  await page.locator(inputSel).first().fill(query);
  await wait(page, 1000);
  await page.locator(`button:has-text('${name}')`).first().click();
  await idle(page, 1200);
}

const specs = [
  // ═══════════════ 업무 흐름 (메뉴) ═══════════════
  {
    file: "offering/guide-menu.png",
    path: "/accounting/offering/entry",
    clip: "aside.w-48 > div",
    clipPad: 18,
    marks: [
      { sel: "aside a[href='/accounting/offering/members']", n: 1, pad: 2, side: "tr" },
      { sel: "aside a[href='/accounting/offering/member-numbers']", n: "", pad: 2, side: "tr" },
      { sel: "aside a[href='/accounting/offering/donor-info']", n: "", pad: 2, side: "tr" },
      { sel: "aside a[href='/accounting/offering/entry']", n: 2, pad: 2, side: "tr" },
      { sel: "aside a[href='/accounting/offering/multi-entry']", n: "", pad: 2, side: "tr" },
      { sel: "aside a[href='/accounting/offering/by-type']", n: "", pad: 2, side: "tr" },
      { sel: "aside a[href='/accounting/offering/edit']", n: 3, pad: 2, side: "tr" },
      { sel: "aside a[href='/accounting/offering/settlement']", n: 4, pad: 2, side: "tr" },
      { sel: "aside a[href='/accounting/offering/list']", n: 5, pad: 2, side: "tr" },
      { sel: "aside a[href='/accounting/offering/thanks']", n: "", pad: 2, side: "tr" },
      { sel: "aside a[href='/accounting/offering/summary']", n: "", pad: 2, side: "tr" },
      { sel: "aside a[href='/accounting/offering/receipt']", n: 6, pad: 2, side: "tr" },
      { sel: "aside a[href='/accounting/offering/certificate']", n: "", pad: 2, side: "tr" },
    ],
  },

  // ═══════════════ 관리번호 ═══════════════
  {
    file: "offering/members-1.png",
    path: "/accounting/offering/members",
    clip: C,
    maxHeight: 760,
    marks: [
      { sel: "form input[placeholder='이름']", n: 1 },
      { sel: "form select", n: 2 },
      { sel: "form button[type=submit]", n: 3 },
      { sel: "button:has-text('+ 신규등록')", n: 4 },
      { sel: "th:has-text('공동번호')", n: 5 },
      { sel: "th:has-text('가족구성원')", n: 6 },
      { sel: "th:text-is('상태')", n: 7 },
      { sel: "th:has-text('입력자')", n: 8 },
      { sel: "tbody tr >> nth=0 >> button:has-text('삭제')", n: 9 },
    ],
  },
  {
    file: "offering/members-2.png",
    path: "/accounting/offering/members",
    clip: C,
    maxHeight: 700,
    prepare: async (page) => {
      await page.selectOption("form select", "1구역");
      await idle(page, 900);
    },
    marks: [
      { sel: "form select", n: 1 },
      { sel: "tbody tr:has-text('서옥순') >> td >> nth=3", n: 2 },
      { sel: "tbody tr:has-text('서옥순') >> td >> nth=4", n: 3 },
      { sel: "div:text-matches('^총 \\\\d+명$')", n: 4 },
    ],
  },
  {
    file: "offering/members-3.png",
    path: "/accounting/offering/members",
    clip: MODAL,
    clipPad: 24,
    prepare: async (page) => {
      await page.click("button:has-text('+ 신규등록')");
      await wait(page, 400);
      await page.fill(`${MODAL} input[placeholder='이름을 입력하세요']`, "정새가");
      await page.fill(`${MODAL} input[placeholder='구역명']`, "3구역");
      await page.locator(`${MODAL} input[placeholder='구역명']`).blur();
      await wait(page, 300);
    },
    marks: [
      { sel: `${MODAL} input[placeholder='자동']`, n: 1 },
      { sel: `${MODAL} input[placeholder='이름을 입력하세요']`, n: 2 },
      { sel: `${MODAL} input[placeholder='구역명']`, n: 3 },
      { sel: `${MODAL} input[placeholder='번호 입력']`, n: 4 },
      { sel: `${MODAL} button.rounded-full.h-6`, n: 5 },
      { sel: `${MODAL} button:text-is('저장')`, n: 6 },
    ],
  },
  {
    file: "offering/members-4.png",
    path: "/accounting/offering/members",
    clip: MODAL,
    clipPad: 24,
    prepare: async (page) => {
      await page.click("tbody tr:has(td:text-is('임서연'))");
      await wait(page, 500);
    },
    marks: [
      { sel: `${MODAL} input[readonly]`, n: 1 },
      { sel: `${MODAL} input[placeholder='번호 입력']`, n: 2, el: "parent" },
      { sel: `${MODAL} button.rounded-full.h-6`, n: 3, el: "parent" },
      { sel: `${MODAL} button:text-is('삭제')`, n: 4 },
      { sel: `${MODAL} button:text-is('저장')`, n: 5 },
    ],
  },

  // ═══════════════ 관리번호 변경 ═══════════════
  {
    file: "offering/member-numbers-1.png",
    path: "/accounting/offering/member-numbers",
    clip: C,
    maxHeight: 700,
    marks: [
      { sel: "input[type=date]", n: 1 },
      { sel: "input[placeholder='이름·번호·구역']", n: 2 },
      { sel: "button:text-is('조회')", n: 3 },
      { sel: "button:has-text('변경된 항목 없음')", n: 4 },
      { sel: "th:has-text('내부 ID')", n: 5 },
      { sel: "th:has-text('현재 번호')", n: 6 },
      { sel: "tbody tr >> nth=0 >> input", n: 7 },
      { sel: "th:has-text('입력자')", n: 8 },
    ],
  },
  {
    file: "offering/member-numbers-2.png",
    path: "/accounting/offering/member-numbers",
    clip: C,
    maxHeight: 440,
    prepare: async (page) => {
      await page.fill("tbody tr >> nth=0 >> input", "201");
      await page.fill("tbody tr >> nth=1 >> input", "202");
      await wait(page, 300);
    },
    marks: [
      { sel: "tbody tr >> nth=0 >> input", n: 1 },
      { sel: "tbody tr >> nth=1 >> input", n: "" },
      { sel: "tbody tr >> nth=0 >> button:has-text('취소')", n: 2 },
      { sel: "button:has-text('건 일괄 저장')", n: 3 },
    ],
  },
  {
    file: "offering/member-numbers-3.png",
    path: "/accounting/offering/member-numbers",
    clip: C,
    maxHeight: 520,
    prepare: async (page) => {
      await page.fill("input[placeholder='이름·번호·구역']", "3구역");
      await wait(page, 400);
    },
    marks: [{ sel: "input[placeholder='이름·번호·구역']", n: 1 }],
  },

  // ═══════════════ 관리상세 ═══════════════
  {
    file: "offering/donor-info-1.png",
    path: "/accounting/offering/donor-info",
    clip: C,
    maxHeight: 760,
    marks: [
      { sel: "input[placeholder='성명 또는 구역 검색']", n: 1 },
      { sel: "button:text-is('검색')", n: 2 },
      { sel: "th:has-text('주민등록번호')", n: 3 },
      { sel: "th:text-is('주소')", n: 4 },
      { sel: "th:has-text('입력자')", n: 5 },
      { sel: "tbody tr >> nth=0 >> button:has-text('수정')", n: 6 },
    ],
  },
  {
    file: "offering/donor-info-2.png",
    path: "/accounting/offering/donor-info",
    clip: C,
    maxHeight: 620,
    prepare: async (page) => {
      await page.fill("input[placeholder='성명 또는 구역 검색']", "1구역");
      await page.click("button:text-is('검색')");
      await idle(page, 900);
    },
    marks: [
      { sel: "input[placeholder='성명 또는 구역 검색']", n: 1 },
      { sel: "tbody tr >> nth=0 >> td >> nth=3", n: 2 },
      { sel: "td span:text-is('미등록')", n: 3 },
    ],
  },
  {
    file: "offering/donor-info-3.png",
    path: "/accounting/offering/donor-info",
    clip: MODAL,
    clipPad: 24,
    prepare: async (page) => {
      await page.click("tbody tr:has-text('임서연') >> button:has-text('수정')");
      await idle(page, 700);
      await page.fill(`${MODAL} input[placeholder='000000-0000000']`, "000000-0000000");
      await page.fill(`${MODAL} input >> nth=1`, "부산광역시 ○○구 가상로 00");
      await page.fill(`${MODAL} input[placeholder='010-0000-0000']`, "010-0000-0000");
      await page.fill(`${MODAL} input[type=email]`, "example@example.com");
      await wait(page, 300);
    },
    marks: [
      { sel: `${MODAL} input[placeholder='000000-0000000']`, n: 1 },
      { sel: `${MODAL} input >> nth=1`, n: 2 },
      { sel: `${MODAL} input[placeholder='010-0000-0000']`, n: 3 },
      { sel: `${MODAL} input[type=email]`, n: 4 },
      { sel: `${MODAL} button:text-is('저장')`, n: 5 },
    ],
  },

  // ═══════════════ 연보입력 ═══════════════
  {
    file: "offering/entry-1.png",
    path: "/accounting/offering/entry",
    clip: C,
    maxHeight: 900,
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", D);
    },
    marks: [
      { sel: "input[type=date]", n: 1 },
      { sel: "button:has-text('무기명 묶음 추가')", n: 2 },
      { sel: "input[data-col=memberid]", n: 3 },
      { sel: "button[title='검색']", n: 4 },
      { sel: "button:has-text('+ 행 추가')", n: 5 },
      { sel: "button:text-is('저장')", n: 6 },
      { sel: "h2:has-text('입력내역')", n: 7 },
    ],
  },
  {
    file: "offering/entry-2.png",
    path: "/accounting/offering/entry",
    clip: "div.border-t-4.border-teal-500",
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", D);
      await page.fill("input[data-col=memberid]", "1");
      await page.press("input[data-col=memberid]", "Enter");
      await wait(page, 1200);
      await page.fill("[data-row='0'][data-col='amount']", "10000");
      await page.press("[data-row='0'][data-col='amount']", "Tab");
      await page.fill("[data-row='1'][data-col='amount']", "100000");
      await page.press("[data-row='1'][data-col='amount']", "Tab");
      await page.fill("[data-row='2'][data-col='amount']", "30000");
      await page.press("[data-row='2'][data-col='amount']", "Tab");
      await page.fill("[data-row='2'][data-col='desc']", "생일 감사");
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await wait(page, 400);
    },
    marks: [
      { sel: "input[data-col=memberid]", n: 1 },
      { sel: "tbody td span:text-is('서옥순')", n: 2 },
      { sel: "tbody select >> nth=0", n: 3 },
      { sel: "[data-row='0'][data-col='amount']", n: 4 },
      { sel: "[data-row='2'][data-col='desc']", n: 5 },
      { sel: "tfoot td.text-blue-700", n: 6 },
      { sel: "button:text-is('저장')", n: 7 },
    ],
  },
  {
    file: "offering/entry-3.png",
    path: "/accounting/offering/entry",
    clip: MODAL,
    clipPad: 24,
    prepare: async (page) => {
      await page.click("button[title='검색']");
      await wait(page, 300);
      await page.fill("input[placeholder='이름으로 검색']", "서");
      await wait(page, 1200);
    },
    marks: [
      { sel: "input[placeholder='이름으로 검색']", n: 1 },
      { sel: `${MODAL} button:has-text('서옥순')`, n: 2 },
      { sel: `${MODAL} button:text-is('닫기')`, n: 3 },
    ],
  },
  {
    file: "offering/entry-4.png",
    path: "/accounting/offering/entry",
    clip: "div.border-t-4.border-teal-500",
    prepare: async (page) => {
      await page.click("button:has-text('무기명 묶음 추가')");
      await wait(page, 400);
      await page.fill("[data-row='0'][data-col='amount']", "50000");
      await page.press("[data-row='0'][data-col='amount']", "Tab");
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await wait(page, 300);
    },
    marks: [
      { sel: "button:has-text('무기명 묶음 추가')", n: 1 },
      { sel: "tbody td span:text-is('(무기명)')", n: 2 },
      { sel: "[data-row='0'][data-col='amount']", n: 3 },
    ],
  },
  {
    file: "offering/entry-5.png",
    path: "/accounting/offering/entry",
    clip: MODAL,
    clipPad: 24,
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", D);
      await page.click("table >> nth=1 >> tbody tr >> nth=0 >> td >> nth=4");
      await wait(page, 500);
    },
    marks: [
      { sel: `${MODAL} input[type=date]`, n: 1 },
      { sel: `${MODAL} input[placeholder='0 또는 비워두면 익명']`, n: 2 },
      { sel: `${MODAL} select`, n: 3 },
      { sel: `${MODAL} input.font-mono`, n: 4 },
      { sel: `${MODAL} input >> nth=3`, n: 5 },
      { sel: `${MODAL} span:has-text('입력자')`, n: 6 },
      { sel: `${MODAL} button:text-is('저장')`, n: 7 },
    ],
  },
  {
    file: "offering/entry-6.png",
    path: "/accounting/offering/entry",
    clip: "div.overflow-hidden:has(h2:has-text('입력내역'))",
    maxHeight: 560,
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", D);
    },
    marks: [
      { sel: "table >> nth=1 >> tbody tr >> nth=0 >> td >> nth=0", n: 1 },
      { sel: "table >> nth=1 >> th:text-is('번호')", n: 2 },
      { sel: "table >> nth=1 >> th:text-is('금액')", n: 3 },
      { sel: "table >> nth=1 >> th:has-text('입력자')", n: 4 },
      { sel: "table >> nth=1 >> tbody tr >> nth=0 >> button:has-text('삭제')", n: 5 },
      { sel: "span:has-text('총액')", n: 6 },
    ],
  },

  // ═══════════════ 연보통합입력 ═══════════════
  {
    file: "offering/multi-1.png",
    path: "/accounting/offering/multi-entry",
    clip: C,
    maxHeight: 640,
    marks: [
      { sel: "input[type=date]", n: 1 },
      { sel: "button:has-text('이 날짜 불러오기')", n: 2 },
      { sel: "button:text-is('전체 저장')", n: 3 },
      { sel: "label:has-text('입력순서') >> xpath=..", n: 4 },
      { sel: "button:text-is('초기화')", n: 5 },
      { sel: "button:has-text('+ 줄 추가') >> nth=0", n: 6 },
      { sel: "thead tr", n: 7 },
      { sel: "div.sticky.bottom-2", n: 8 },
    ],
  },
  {
    file: "offering/multi-2.png",
    path: "/accounting/offering/multi-entry",
    clip: C,
    maxHeight: 560,
    prepare: async (page) => {
      const cell = (r, c) => `tbody tr >> nth=${r} >> td >> nth=${c} >> input, tbody tr >> nth=${r} >> td >> nth=${c} >> textarea`;
      void cell;
      const inp = (r, i) => page.locator("tbody tr").nth(r).locator("input").nth(i);
      const ta = (r) => page.locator("tbody tr").nth(r).locator("textarea");
      await inp(0, 0).fill("1");
      await inp(0, 1).fill("10000");
      await inp(0, 2).fill("100000");
      await inp(0, 3).fill("30000");
      await ta(0).fill("생일 감사");
      await ta(0).press("Enter");
      await wait(page, 400);
      await inp(0, 0).fill("3");
      await inp(0, 1).fill("5000");
      await inp(0, 5).fill("20000");
      await inp(0, 5).press("Enter");
      await wait(page, 1000); // 임시저장(draft) 반영 대기
    },
    marks: [
      { sel: "tbody tr >> nth=0 >> input >> nth=0", n: 1 },
      { sel: "tbody tr >> nth=1", n: 2, pad: 2 },
      { sel: "tbody tr >> nth=2 >> textarea", n: 3 },
      { sel: "tbody tr >> nth=1 >> button:text-is('저장')", n: 4 },
      { sel: "tfoot tr", n: 5, pad: 2 },
      { sel: "button:text-is('전체 저장')", n: 6 },
    ],
  },
  {
    file: "offering/multi-5.png",
    path: "/accounting/offering/multi-entry",
    clip: C,
    maxHeight: 330,
    prepare: async (page) => {
      await page.evaluate((d) => {
        const amounts = { 주일연보: "10000", 십일조연보: "", 감사연보: "", 특별연보: "", 오일연보: "", 절기연보: "" };
        localStorage.setItem(
          "multiEntry.draft.v1",
          JSON.stringify({ at: Date.now(), date: d, rows: [{ memberNo: "1", amounts, savedIds: {}, description: "", status: "dirty", rowKey: "demo-row-1" }] }),
        );
      }, D);
      await page.goto("http://localhost:3100/accounting/offering/multi-entry", { waitUntil: "domcontentloaded" });
      await idle(page, 1200);
    },
    marks: [
      { sel: "button:text-is('복구')", n: 1 },
      { sel: "button:text-is('버리기')", n: 2 },
    ],
  },
  {
    file: "offering/multi-3.png",
    path: "/accounting/offering/multi-entry",
    clip: C,
    maxHeight: 820,
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", D);
      await page.click("button:has-text('이 날짜 불러오기')");
      await idle(page, 1500);
    },
    marks: [
      { sel: "button:has-text('이 날짜 불러오기')", n: 1 },
      { sel: "div.border-blue-200", n: 2 },
      { sel: "tbody tr >> nth=1", n: 3, pad: 2 },
      { sel: "tbody tr >> nth=1 >> td >> nth=8", n: 4 },
      { sel: "tbody tr >> nth=1 >> button:text-is('저장')", n: 5 },
    ],
  },
  {
    file: "offering/multi-4.png",
    path: "/accounting/offering/multi-entry",
    clip: C,
    maxHeight: 560,
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", D);
      await page.click("button:has-text('이 날짜 불러오기')");
      await idle(page, 1500);
      // 기명 첫 줄(무기명 다음)을 찾아 금액 수정
      const rows = page.locator("tbody tr");
      const n = await rows.count();
      let target = 1;
      for (let i = 1; i < n; i++) {
        const v = await rows.nth(i).locator("input").nth(0).inputValue();
        if (v && v !== "0") { target = i; break; }
      }
      globalThis.__mkRow = target;
      await rows.nth(target).locator("input").nth(1).fill("15000");
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await wait(page, 400);
    },
    marks: [
      { sel: (page) => page.locator("tbody tr").nth(globalThis.__mkRow ?? 2), n: 1, pad: 2 },
      { sel: (page) => page.locator("tbody tr").nth(globalThis.__mkRow ?? 2).locator("input").nth(1), n: 2 },
      { sel: (page) => page.locator("tbody tr").nth(globalThis.__mkRow ?? 2).locator("button:text-is('저장')"), n: 3 },
      { sel: (page) => page.locator("tbody tr").nth(globalThis.__mkRow ?? 2).locator("button[title*='DB']"), n: 4 },
    ],
  },

  // ═══════════════ 연보별입력 ═══════════════
  {
    file: "offering/by-type-1.png",
    path: "/accounting/offering/by-type",
    clip: C,
    maxHeight: 820,
    prepare: async (page) => {
      await fillDate(page, "input[type=date] >> nth=0", D);
      await fillDate(page, "input[type=date] >> nth=1", D);
      await idle(page, 1000);
    },
    marks: [
      { sel: "button:text-is('십일조연보') >> xpath=..", n: 1, pad: 3 },
      { sel: "input[type=date] >> nth=0", n: 2, el: "parent" },
      { sel: "select >> nth=0", n: 3, el: "parent" },
      { sel: "input[type=date] >> nth=2", n: 4, el: "parent" },
      { sel: "button:text-is('조회')", n: 5 },
      { sel: "label:has-text('입력순서') >> xpath=..", n: 6 },
      { sel: "button:has-text('+ 줄 추가')", n: 7 },
      { sel: "button:has-text('변경분 일괄저장')", n: 8 },
    ],
  },
  {
    file: "offering/by-type-2.png",
    path: "/accounting/offering/by-type",
    clip: C,
    maxHeight: 820,
    prepare: async (page) => {
      await page.click("button:text-is('감사연보')");
      await idle(page, 1200);
    },
    marks: [
      { sel: "button:text-is('감사연보')", n: 1 },
      { sel: "tbody textarea >> nth=0", n: 2 },
      { sel: "tbody tr >> nth=0 >> button[title='저장']", n: 3 },
      { sel: "tbody tr >> nth=0 >> button[title='삭제']", n: 4 },
      { sel: "th:has-text('입력자')", n: 5 },
    ],
  },
  {
    file: "offering/by-type-3.png",
    path: "/accounting/offering/by-type",
    clip: C,
    maxHeight: 560,
    prepare: async (page) => {
      await page.click("button:text-is('특별연보')");
      await idle(page, 900);
      await fillDate(page, "input[type=date] >> nth=0", D);
      await fillDate(page, "input[type=date] >> nth=1", D);
      await idle(page, 900);
      const rows = page.locator("tbody tr");
      // 기존 줄 금액 수정 → 주황
      await rows.nth(0).locator("input[inputmode=numeric]").nth(1).fill("250000");
      // 새 줄(노랑) 입력
      const last = rows.last();
      await last.locator("input[inputmode=numeric]").nth(0).fill("3");
      await last.locator("input[inputmode=numeric]").nth(0).press("Tab");
      await wait(page, 900);
      await last.locator("input[inputmode=numeric]").nth(1).fill("50000");
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await wait(page, 500);
    },
    marks: [
      { sel: "input[type=date] >> nth=2", n: 1, el: "parent" },
      { sel: "tbody tr >> nth=0", n: 2, pad: 2 },
      { sel: "tbody tr >> nth=-1 >> input[type=date]", n: 3 },
      { sel: "tbody tr >> nth=-1 >> td >> nth=2", n: 4 },
      { sel: "tbody tr >> nth=-1 >> input[inputmode=numeric] >> nth=1", n: 5 },
      { sel: "tbody tr >> nth=-1 >> button[title='저장']", n: 6 },
      { sel: "button:has-text('변경분 일괄저장')", n: 7 },
    ],
  },

  // ═══════════════ 연보일괄수정 ═══════════════
  {
    file: "offering/edit-1.png",
    path: "/accounting/offering/edit",
    clip: C,
    maxHeight: 820,
    prepare: async (page) => {
      await fillDate(page, "input[type=date] >> nth=0", D);
      await fillDate(page, "input[type=date] >> nth=1", D);
      await idle(page, 1000);
    },
    marks: [
      { sel: "input[type=date] >> nth=0", n: 1, el: "parent" },
      { sel: "input[type=date] >> nth=1", n: "", el: "parent" },
      { sel: "select >> nth=0", n: 2, el: "parent" },
      { sel: "input[type=date] >> nth=2", n: 3, el: "parent" },
      { sel: "button:text-is('조회')", n: 4 },
      { sel: "label:has-text('입력순서') >> xpath=..", n: 5 },
      { sel: "tbody select >> nth=0", n: 6 },
      { sel: "button:has-text('변경분 일괄저장')", n: 7 },
    ],
  },
  {
    file: "offering/edit-2.png",
    path: "/accounting/offering/edit",
    clip: C,
    maxHeight: 620,
    prepare: async (page) => {
      await fillDate(page, "input[type=date] >> nth=0", "2026-10-01");
      await fillDate(page, "input[type=date] >> nth=1", D);
      await page.selectOption("select >> nth=0", "특별연보");
      await idle(page, 1200);
      const rows = page.locator("tbody tr");
      await rows.nth(0).locator("input[inputmode=numeric]").nth(1).fill("60000");
      await rows.nth(1).locator("select").selectOption("감사연보");
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await wait(page, 500);
    },
    marks: [
      { sel: "select >> nth=0", n: 1 },
      { sel: "tbody tr >> nth=0 >> input[inputmode=numeric] >> nth=1", n: 2 },
      { sel: "tbody tr >> nth=1 >> select", n: 3 },
      { sel: "tbody tr >> nth=0 >> button[title='저장']", n: 4 },
      { sel: "button:has-text('변경분 일괄저장')", n: 5 },
    ],
  },
  {
    file: "offering/edit-3.png",
    path: "/accounting/offering/edit",
    clip: C,
    maxHeight: 300,
    prepare: async (page) => {
      await page.evaluate((d) => {
        localStorage.setItem(
          "offeringBulkDraft:v1:all:T",
          JSON.stringify({ at: Date.now(), rows: [{ id: 0, date: d, memberId: "3", memberName: "신선우", offeringType: "주일연보", amount: "5000", description: "", status: "dirty" }] }),
        );
      }, D);
      await page.goto("http://localhost:3100/accounting/offering/edit", { waitUntil: "domcontentloaded" });
      await idle(page, 1200);
    },
    marks: [
      { sel: "button:text-is('입력 복구')", n: 1 },
      { sel: "button:text-is('버리기')", n: 2 },
    ],
  },

  // ═══════════════ 일별결산 ═══════════════
  {
    file: "offering/settlement-1.png",
    path: "/accounting/offering/settlement",
    clip: C,
    maxHeight: 820,
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", D);
      await idle(page, 1200);
    },
    marks: [
      { sel: "input[type=date]", n: 1 },
      { sel: "button:has-text('연보 다시 불러오기')", n: 2 },
      { sel: "div.border-green-200", n: 3 },
      { sel: "span:has-text('최종입력') >> xpath=..", n: 4 },
      { sel: "section >> nth=0 >> header", n: 5 },
      { sel: "section >> nth=0 >> input >> nth=0", n: 6 },
      { sel: "section >> nth=0 >> input >> nth=1", n: 7 },
      { sel: "a:text-is('인쇄')", n: 8 },
      { sel: "button:text-is('전표 반영')", n: 9 },
    ],
  },
  {
    file: "offering/settlement-2.png",
    path: "/accounting/offering/settlement",
    clip: "section >> nth=1",
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", D);
      await idle(page, 1200);
    },
    marks: [
      { sel: "section >> nth=1 >> tbody tr >> nth=0 >> input", n: 1 },
      { sel: "section >> nth=1 >> tbody tr >> nth=1 >> input >> nth=0", n: 2 },
      { sel: "section >> nth=1 >> tbody tr >> nth=1 >> input >> nth=1", n: 3 },
      { sel: "section >> nth=1 >> tbody tr >> nth=-1", n: 4, pad: 2 },
    ],
  },
  {
    file: "offering/settlement-3.png",
    path: "/accounting/offering/settlement",
    clip: "section >> nth=2",
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", "2026-11-01");
      await idle(page, 1200);
    },
    marks: [
      { sel: "section >> nth=2 >> div.flex.justify-between >> nth=0", n: 1, pad: 2 },
      { sel: "section >> nth=2 >> div.flex.justify-between >> nth=1", n: 2, pad: 2 },
      { sel: "section >> nth=2 >> div.flex.justify-between >> nth=2", n: 3, pad: 2 },
      { sel: "button:has-text('주일연보에 반영')", n: 4 },
    ],
  },
  {
    file: "offering/settlement-3b.png",
    path: "/accounting/offering/settlement",
    clip: "section >> nth=0",
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", "2026-11-01");
      await idle(page, 1200);
      await page.click("button:has-text('주일연보에 반영')");
      await wait(page, 500);
    },
    marks: [{ sel: "section >> nth=0 >> tr:has-text('주일연보')", n: 1, pad: 2 }],
  },
  {
    file: "offering/settlement-4.png",
    path: "/accounting/offering/settlement",
    clip: "section >> nth=3",
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", "2026-11-01");
      await idle(page, 1200);
      await page.click("button:text-is('분배 계산')");
      await idle(page, 1000);
    },
    marks: [
      { sel: "button:text-is('분배 계산')", n: 1 },
      { sel: "section >> nth=3 >> header span.text-xs", n: 2 },
      { sel: "section >> nth=3 >> tbody tr >> nth=1 >> input >> nth=0", n: 3 },
      { sel: "section >> nth=3 >> tbody tr >> nth=1 >> input >> nth=1", n: 4 },
      { sel: "section >> nth=3 >> tbody tr >> nth=0 >> input >> nth=0", n: 5 },
      { sel: "section >> nth=3 >> tbody tr:has-text('합계')", n: 6, pad: 2 },
    ],
  },
  {
    file: "offering/settlement-4b.png",
    path: "/accounting/offering/settlement",
    clip: "section >> nth=3",
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", "2026-11-01");
      await idle(page, 1200);
      await page.click("button:text-is('분배 계산')");
      await idle(page, 1000);
      const t = page.locator("section >> nth=3 >> tbody tr >> nth=0 >> input >> nth=1");
      await t.fill("3200000");
      await t.blur();
      await wait(page, 600);
    },
    marks: [
      { sel: "section >> nth=3 >> tbody tr >> nth=0 >> input >> nth=1", n: 1 },
      { sel: "section >> nth=3 >> tbody tr >> nth=0 >> input >> nth=0", n: 2 },
      { sel: "section >> nth=3 >> tbody tr:has-text('합계')", n: 3, pad: 2 },
    ],
  },
  {
    file: "offering/settlement-5.png",
    path: "/accounting/offering/settlement",
    clip: "div.sticky.bottom-2",
    clipPad: 12,
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", D);
      await idle(page, 1200);
    },
    marks: [
      { sel: "div.sticky.bottom-2 >> span.text-xs", n: 1 },
      { sel: "div.sticky.bottom-2 >> button:text-is('저장')", n: 2 },
    ],
  },
  {
    file: "offering/settlement-6.png",
    path: "/accounting/offering/settlement",
    clip: MODAL,
    clipPad: 24,
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", "2026-11-01");
      await idle(page, 1200);
      await page.click("button:text-is('전표 반영')");
      await wait(page, 500);
      await page.locator(`${MODAL} label:has-text('주일학교') input[type=checkbox]`).uncheck();
      await wait(page, 300);
    },
    marks: [
      { sel: `${MODAL} div.border-amber-200`, n: 1 },
      { sel: `${MODAL} div.border-gray-300:has-text('십일조회계')`, n: 2, pad: 2 },
      { sel: `${MODAL} div.border-gray-300:has-text('일반회계')`, n: 3, pad: 2 },
      { sel: `${MODAL} tr.line-through`, n: 4, pad: 2 },
      { sel: `${MODAL} button:text-is('전표 반영')`, n: 5 },
    ],
  },
  {
    file: "offering/settlement-7.png",
    path: "/accounting/offering/settlement",
    clip: MODAL,
    clipPad: 24,
    prepare: async (page) => {
      await fillDate(page, "input[type=date]", "2026-07-05");
      await idle(page, 1200);
      await page.click("button:text-is('전표 반영')");
      await wait(page, 500);
      await page.check(`${MODAL} input[value='맥추감사']`);
      await wait(page, 300);
    },
    marks: [
      { sel: `${MODAL} input[value='부활감사'] >> xpath=../..`, n: 1, pad: 3 },
      { sel: `${MODAL} tr:has-text('절기 (맥추감사)')`, n: 2, pad: 2 },
    ],
  },
  {
    file: "offering/settlement-8.png",
    path: `/accounting/offering/settlement/print?date=${D}`,
    clip: "div.max-w-3xl",
    clipPad: 8,
    maxHeight: 1100,
    marks: [{ sel: "button:text-is('인쇄')", n: 1 }],
  },

  // ═══════════════ 연보내역 ═══════════════
  {
    file: "offering/list-1.png",
    path: "/accounting/offering/list",
    clip: C,
    maxHeight: 420,
    prepare: async (page) => {
      await page.fill("input[placeholder='이름으로 검색']", "서");
      await wait(page, 1200);
    },
    marks: [
      { sel: "button:text-is('개인별') >> xpath=..", n: 1, pad: 3 },
      { sel: "input[placeholder='이름으로 검색']", n: 2 },
      { sel: "div.absolute.z-10 button >> nth=0", n: 3 },
    ],
  },
  {
    file: "offering/list-2.png",
    path: "/accounting/offering/list",
    clip: C,
    maxHeight: 860,
    prepare: async (page) => {
      await pickMember(page, "input[placeholder='이름으로 검색']", "서옥", "서옥순");
      await fillDate(page, "input[type=date] >> nth=0", "2026-09-01");
      await fillDate(page, "input[type=date] >> nth=1", D);
      await idle(page, 1200);
    },
    marks: [
      { sel: "div.relative input[type=text]", n: 1 },
      { sel: "input[type=date] >> nth=0", n: 2, el: "parent" },
      { sel: "input[type=date] >> nth=1", n: "", el: "parent" },
      { sel: "button:text-is('조회')", n: 3 },
      { sel: "label:has-text('입력순서별') >> xpath=..", n: 4 },
      { sel: "th:has-text('입력자')", n: 5 },
      { sel: "tfoot tr", n: 6, pad: 2 },
    ],
  },
  {
    file: "offering/list-3.png",
    path: "/accounting/offering/list",
    clip: C,
    maxHeight: 1000,
    prepare: async (page) => {
      await page.click("button:text-is('일자별')");
      await wait(page, 300);
      await fillDate(page, "input[type=date]", D);
      await idle(page, 1200);
    },
    marks: [
      { sel: "button:text-is('일자별')", n: 1 },
      { sel: "input[type=date]", n: 2 },
      { sel: "div.bg-teal-50.border-b >> nth=0", n: 3, pad: 2 },
      { sel: "label:has-text('입력순서별') >> xpath=..", n: 4 },
    ],
  },
  {
    file: "offering/list-3b.png",
    path: "/accounting/offering/list",
    clip: "div.bg-teal-50.border-b:has-text('감사연보') >> xpath=..",
    clipPad: 8,
    prepare: async (page) => {
      await page.click("button:text-is('일자별')");
      await wait(page, 300);
      await fillDate(page, "input[type=date]", D);
      await idle(page, 1200);
    },
    marks: [
      { sel: "div.bg-teal-50.border-b:has-text('감사연보')", n: 1, pad: 2 },
      { sel: "div.bg-teal-50.border-b:has-text('감사연보') >> xpath=.. >> td.whitespace-pre-line:has-text('감사')", n: 2 },
      { sel: "div.bg-teal-50.border-b:has-text('감사연보') >> xpath=.. >> th:has-text('입력자')", n: 3 },
    ],
  },
  {
    file: "offering/list-4.png",
    path: "/accounting/offering/list",
    clip: C,
    maxHeight: 900,
    prepare: async (page) => {
      await page.click("button:text-is('기간별')");
      await wait(page, 300);
      await fillDate(page, "input[type=date] >> nth=0", "2026-10-01");
      await fillDate(page, "input[type=date] >> nth=1", D);
      await page.selectOption("select", "특별연보");
      await idle(page, 1200);
    },
    marks: [
      { sel: "button:text-is('기간별')", n: 1 },
      { sel: "input[type=date] >> nth=0", n: 2, el: "parent" },
      { sel: "input[type=date] >> nth=1", n: "", el: "parent" },
      { sel: "select", n: 3 },
      { sel: "tfoot tr", n: 4, pad: 2 },
      { sel: "div:text-matches('^총 \\\\d+건$')", n: 5 },
    ],
  },

  // ═══════════════ 감사연보현황 ═══════════════
  {
    file: "offering/thanks-1.png",
    path: "/accounting/offering/thanks",
    clip: "div.border.border-gray-200.p-4",
    prepare: async (page) => {
      await fillDate(page, "input[type=date] >> nth=0", "2026-11-01");
      await fillDate(page, "input[type=date] >> nth=1", D);
      await fillDate(page, "input[type=date] >> nth=2", D);
    },
    marks: [
      { sel: "input[type=date] >> nth=0", n: 1, el: "parent" },
      { sel: "input[type=date] >> nth=1", n: "", el: "parent" },
      { sel: "button:text-is('조회')", n: 2 },
      { sel: "button:text-is('인쇄(화면)')", n: 3 },
      { sel: "input[type=date] >> nth=2", n: 4, el: "parent" },
      { sel: "button:has-text('광고용')", n: 5 },
      { sel: "button:has-text('등재용')", n: 6 },
      { sel: "button:has-text('배부용')", n: 7 },
      { sel: "select", n: 8, el: "parent" },
      { sel: "button:has-text('게시판에 등재')", n: 9 },
    ],
  },
  {
    file: "offering/thanks-2.png",
    path: "/accounting/offering/thanks",
    clip: "div.overflow-hidden:has(table)",
    maxHeight: 1000,
    prepare: async (page) => {
      await fillDate(page, "input[type=date] >> nth=0", "2026-11-01");
      await fillDate(page, "input[type=date] >> nth=1", D);
      await page.click("button:text-is('조회')");
      await idle(page, 1200);
    },
    marks: [
      { sel: "label:has-text('입력순서별') >> xpath=..", n: 1 },
      { sel: "th:text-is('No')", n: 2 },
      { sel: "th:has-text('감사연보내역')", n: 3 },
      { sel: "th:has-text('입력자')", n: 4 },
      { sel: "tfoot tr", n: 5, pad: 2 },
    ],
  },
  {
    file: "offering/thanks-print-ad.png",
    path: `/accounting/offering/thanks/print?mode=ad&date=${D}`,
    clip: C,
    maxHeight: 700,
    marks: [
      { sel: "h1:has-text('인쇄 미리보기')", n: 1 },
      { sel: "div.grid:has(input[type=range])", n: 2, pad: 3 },
      { sel: "button:has-text('여백 초기화')", n: 3 },
      { sel: "button:has-text('인쇄')", n: 4 },
      { sel: "div.relative.bg-white.shadow-lg", n: 5, pad: 2 },
    ],
  },
  { file: "offering/thanks-print-list.png", path: `/accounting/offering/thanks/print?mode=list&date=${D}`, clip: "div.relative.bg-white.shadow-lg", clipPad: 10, maxHeight: 420 },
  { file: "offering/thanks-print-handout.png", path: `/accounting/offering/thanks/print?mode=handout&date=${D}`, clip: "div.relative.bg-white.shadow-lg", clipPad: 10, maxHeight: 380 },

  // ═══════════════ 연보집계 ═══════════════
  {
    file: "offering/summary-1.png",
    path: "/accounting/offering/summary",
    clip: C,
    maxHeight: 860,
    prepare: async (page) => {
      await fillDate(page, "input[type=date] >> nth=0", "2026-11-01");
      await fillDate(page, "input[type=date] >> nth=1", D);
      await idle(page, 1200);
    },
    marks: [
      { sel: "button:text-is('개인별') >> xpath=..", n: 1, pad: 3 },
      { sel: "input[type=date] >> nth=0", n: 2, el: "parent" },
      { sel: "input[type=date] >> nth=1", n: "", el: "parent" },
      { sel: "button:text-is('조회')", n: 3 },
      { sel: "span:has-text('최종입력') >> xpath=..", n: 4 },
      { sel: "th:text-is('합계')", n: 5 },
    ],
  },
  {
    file: "offering/summary-2.png",
    path: "/accounting/offering/summary",
    clip: C,
    maxHeight: 700,
    prepare: async (page) => {
      await page.click("button:text-is('일자별')");
      await idle(page, 600);
      await fillDate(page, "input[type=date] >> nth=0", "2026-10-01");
      await fillDate(page, "input[type=date] >> nth=1", D);
      await idle(page, 1200);
    },
    marks: [
      { sel: "button:text-is('일자별')", n: 1 },
      { sel: "tbody tr >> nth=0", n: 2, pad: 2 },
      { sel: "tfoot tr", n: 3, pad: 2 },
    ],
  },
  {
    file: "offering/summary-3.png",
    path: "/accounting/offering/summary",
    clip: C,
    maxHeight: 900,
    prepare: async (page) => {
      await page.click("button:text-is('월별')");
      await idle(page, 1500);
    },
    marks: [
      { sel: "button:text-is('월별')", n: 1 },
      { sel: "select", n: 2 },
      { sel: "tbody tr >> nth=0", n: 3, pad: 2 },
      { sel: "tfoot tr", n: 4, pad: 2 },
    ],
  },
  {
    file: "offering/summary-4.png",
    path: "/accounting/offering/summary",
    clip: C,
    maxHeight: 800,
    prepare: async (page) => {
      await page.click("button:text-is('기간별')");
      await idle(page, 600);
      await fillDate(page, "input[type=date] >> nth=0", "2026-01-01");
      await fillDate(page, "input[type=date] >> nth=1", D);
      await idle(page, 1500);
    },
    marks: [
      { sel: "button:text-is('기간별')", n: 1 },
      { sel: "input[type=date] >> nth=0", n: 2, el: "parent" },
      { sel: "input[type=date] >> nth=1", n: "", el: "parent" },
      { sel: "tr:has-text('총합계')", n: 3, pad: 2 },
    ],
  },

  // ═══════════════ 기부금영수증 ═══════════════
  {
    file: "offering/receipt-1.png",
    path: "/accounting/offering/receipt",
    clip: "div.border-t-4.border-teal-500",
    prepare: async (page) => {
      await pickMember(page, "input[placeholder='이름 또는 번호로 검색']", "서옥", "서옥순");
      await idle(page, 1200);
    },
    marks: [
      { sel: "select", n: 1 },
      { sel: "div.relative input[type=text]", n: 2 },
      { sel: "button:text-is('인쇄')", n: 3 },
      { sel: "label:has-text('가족 구성원') >> xpath=../..", n: 4, pad: 3 },
      { sel: "button:text-is('전체선택') >> xpath=..", n: 5 },
      { sel: "input[type=date]", n: 6 },
      { sel: "input[placeholder*='담임목사']", n: 7 },
    ],
  },
  {
    file: "offering/receipt-2.png",
    path: "/accounting/offering/receipt",
    clip: "#receipt-print",
    maxHeight: 1300,
    prepare: async (page) => {
      await pickMember(page, "input[placeholder='이름 또는 번호로 검색']", "서옥", "서옥순");
      await idle(page, 1200);
    },
    marks: [
      { sel: "#receipt-print table >> nth=0", n: 1 },
      { sel: "#receipt-print section >> nth=0", n: 2, pad: 3 },
      { sel: "#receipt-print section >> nth=1", n: 3, pad: 3 },
      { sel: "#receipt-print section >> nth=3 >> tbody tr >> nth=0", n: 4, pad: 2 },
      { sel: "#receipt-print section >> nth=3 >> tbody tr >> nth=-1", n: 5, pad: 2 },
      { sel: "#receipt-print span:text-is('신청인') >> xpath=..", n: 6 },
      { sel: "#receipt-print span:text-is('기부금 수령인') >> xpath=..", n: 7 },
    ],
  },
  {
    file: "offering/receipt-3.png",
    path: "/accounting/offering/receipt",
    clip: C,
    maxHeight: 640,
    prepare: async (page) => {
      await pickMember(page, "input[placeholder='이름 또는 번호로 검색']", "서옥", "서옥순");
      await idle(page, 1000);
      await page.click("button:text-is('전체선택')");
      await idle(page, 1500);
    },
    marks: [
      { sel: "button:text-is('전체선택')", n: 1 },
      { sel: "label:has-text('임서연')", n: 2 },
      { sel: "#receipt-print div.bg-teal-50", n: 3 },
      { sel: "#receipt-print section >> nth=0 >> td >> nth=1", n: 4 },
    ],
  },
  {
    file: "offering/receipt-5.png",
    path: "/accounting/offering/receipt",
    clip: C,
    maxHeight: 1500,
    prepare: async (page) => {
      await pickMember(page, "input[placeholder='이름 또는 번호로 검색']", "서옥", "서옥순");
      await idle(page, 1000);
      await page.click("button:text-is('본인만')");
      await idle(page, 1500);
    },
    marks: [
      { sel: "button:text-is('본인만')", n: 1 },
      { sel: "#receipt-print section >> nth=3 >> tbody tr >> nth=-1", n: 2, pad: 2 },
    ],
  },
  {
    file: "offering/receipt-4.png",
    path: "/accounting/offering/receipt",
    clip: "#receipt-print p.text-amber-700",
    clipPad: 40,
    prepare: async (page) => {
      await pickMember(page, "input[placeholder='이름 또는 번호로 검색']", "신선", "신선우");
      await idle(page, 1200);
    },
    marks: [{ sel: "#receipt-print p.text-amber-700", n: 1 }],
  },

  // ═══════════════ 소속증명서 ═══════════════
  {
    file: "offering/certificate-1.png",
    path: "/accounting/offering/certificate",
    clip: "div.border-t-4.border-teal-500",
    prepare: async (page) => {
      await pickMember(page, "input[placeholder='이름 또는 번호로 검색']", "서옥", "서옥순");
    },
    marks: [
      { sel: "input[type=date]", n: 1 },
      { sel: "div.relative input[type=text]", n: 2 },
      { sel: "button:text-is('인쇄')", n: 3 },
      { sel: "textarea", n: 4 },
    ],
  },
  {
    file: "offering/certificate-2.png",
    path: "/accounting/offering/certificate",
    clip: "#cert-print",
    maxHeight: 1200,
    prepare: async (page) => {
      await pickMember(page, "input[placeholder='이름 또는 번호로 검색']", "서옥", "서옥순");
    },
    marks: [
      { sel: "#cert-print div.cert-serial", n: 1 },
      { sel: "#cert-print div.cert-fields", n: 2, pad: 6 },
      { sel: "#cert-print p.cert-body", n: 3 },
      { sel: "#cert-print div.text-center", n: 4, pad: 6 },
    ],
  },
  {
    file: "offering/certificate-3.png",
    path: "/accounting/offering/certificate",
    clip: "p.text-amber-700",
    clipPad: 40,
    prepare: async (page) => {
      await pickMember(page, "input[placeholder='이름 또는 번호로 검색']", "신선", "신선우");
    },
    marks: [{ sel: "p.text-amber-700", n: 1 }],
  },
];

// 모든 spec 앞에 사이드바 초기화, 끝나면 맨 위로 스크롤
//  (shot.mjs 의 clip 은 viewport 기준 좌표라 스크롤된 상태면 어긋남)
//  일별결산은 sticky 저장바가 본문을 가리지 않도록 세로를 넉넉히(2600).
await run(
  specs.map((s) => ({
    ...s,
    height: s.height || (s.path.startsWith("/accounting/offering/settlement") && !s.path.includes("print") ? 2600 : undefined),
    prepare: async (page) => {
      await ensureSide(page);
      if (s.prepare) await s.prepare(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
    },
  })),
);
