// 행정실(회계) 매뉴얼 캡처 스펙 — node specs-accounting.mjs [파일명일부]
//   비밀번호 확인 화면만: NOREAUTH=1 node specs-accounting.mjs reauth
import { run } from "./shot.mjs";

const C = "aside.w-48 + div";
const S = (n) => `${C} select >> nth=${n}`;
const wait = (ms) => (p) => p.waitForTimeout(ms);

async function pickUnit(page, label, nth = 0) {
  await page.locator(`${C} select`).nth(nth).selectOption({ label });
  await page.waitForTimeout(1500);
}
async function clickExact(page, text) {
  await page.locator(C).getByRole("button", { name: text, exact: true }).first().click();
  await page.waitForTimeout(400);
}
async function entryFill(page, { unit, tab, fund, desc, rows = [] }) {
  if (unit) await pickUnit(page, unit, 0);
  if (tab) await clickExact(page, tab);
  if (fund) await page.locator(`${C} select`).nth(1).selectOption({ label: fund });
  if (desc) await page.fill(`${C} input[placeholder="전표 전체에 대한 적요"]`, desc);
  for (let i = 0; i < rows.length; i++) {
    const [acc, amt, d, cp] = rows[i];
    await page.locator(`${C} tbody select`).nth(i).selectOption({ label: acc });
    await page.locator(`${C} input[placeholder="0 (환급은 -)"]`).nth(i).fill(String(amt));
    if (d) await page.locator(`${C} input[placeholder="항목 적요"]`).nth(i).fill(d);
    if (cp) await page.locator(`${C} tbody input[placeholder="거래처"], ${C} tbody input[placeholder="납부자"]`).nth(i).fill(cp);
  }
  await page.evaluate(() => (document.activeElement)?.blur?.()); // 포커스 해제 (제목 클릭 금지 — 매뉴얼 버튼이 있음)
  await page.waitForTimeout(300);
}
const TCARD = `${C} div.bg-white:has(> h2:text("통장 간 이체 등록"))`;
async function transferFill(page, { unit, from, to, amount, desc }) {
  if (unit) await pickUnit(page, unit, 0);
  await page.locator(`${TCARD} select`).nth(0).selectOption({ label: from });
  await page.locator(`${TCARD} select`).nth(1).selectOption({ label: to });
  await page.locator(`${TCARD} input[placeholder="금액"]`).fill(String(amount));
  await page.locator(`${TCARD} input[placeholder="적요"]`).fill(desc);
}
async function setDates(page, from, to) {
  const d = page.locator(`${C} input[type=date]`);
  await d.nth(0).fill(from);
  await d.nth(1).fill(to);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.waitForTimeout(300);
}

const ENTRY_FORM_CLIP = `${C}`;

const specs = [
  // ───────── 공통 매뉴얼 (accounting-guide) ─────────
  {
    file: "accounting/g-menu.png", path: "/accounting/entry", clip: "aside.w-48", maxHeight: 740,
    marks: [
      { sel: 'aside.w-48 a:text-is("전표입력")', n: 1, side: "tr" },
      { sel: 'aside.w-48 a:text-is("통장현황·이체")', n: 2, side: "tr" },
      { sel: 'aside.w-48 a:text-is("회계 간 대체")', n: 3, side: "tr" },
      { sel: 'aside.w-48 a:text-is("통장관리")', n: 4, side: "tr" },
      { sel: 'aside.w-48 a:text-is("연도별 이월금")', n: 5, side: "tr" },
    ],
  },
  {
    file: "accounting/g-reauth.png", path: "/accounting/entry", noReauth: true, width: 1000, height: 460, clip: null,
  },
  {
    file: "accounting/g-funds-settings.png", path: "/accounting/settings/funds", clip: `${C} div.lg\\:col-span-3`,
    marks: [
      { sel: `${C} tr:has-text("일반회계 보통예금")`, n: 1, pad: 2 },
      { sel: `${C} tr:has-text("일반회계 현금")`, n: 2, pad: 2 },
      { sel: `${C} tr:has-text("십일조 현금")`, n: 3, pad: 2 },
    ],
  },
  {
    file: "accounting/g-entry-bank.png", path: "/accounting/entry", clip: C, maxHeight: 560,
    prepare: (p) => entryFill(p, {
      unit: "일반회계", tab: "지출", fund: "일반회계 보통예금 (기본)", desc: "11월 공과금 자동이체",
      rows: [["2069 - 전기세", 254000, "11월 전기요금", "한국전력"], ["2070 - 수도세", 62000, "11월 수도요금", "상수도사업본부"], ["2072 - 통신비", 68000, "인터넷·전화", "통신사"]],
    }),
    marks: [
      { sel: `${C} button:text-is("지출")`, n: 1 },
      { sel: S(0), n: 2 },
      { sel: S(1), n: 3 },
      { sel: `${C} tbody tr >> nth=0`, n: 4, pad: 2 },
      { sel: `${C} button:text-is("저장")`, n: 5 },
    ],
  },
  {
    file: "accounting/g-entry-cash.png", path: "/accounting/entry", clip: C, maxHeight: 520,
    prepare: (p) => entryFill(p, {
      unit: "일반회계", tab: "지출", fund: "일반회계 현금", desc: "현금 지출 (영수증 2건)",
      rows: [["2082 - 소모품비", 35000, "화장지·세제", "마트"], ["2084 - 주차장이용료", 8000, "심방 주차", "공영주차장"]],
    }),
    marks: [
      { sel: S(1), n: 1 },
      { sel: `${C} tbody tr >> nth=0`, n: 2, pad: 2 },
    ],
  },
  {
    file: "accounting/g-entry-cash-income.png", path: "/accounting/entry", clip: C, maxHeight: 480,
    prepare: (p) => entryFill(p, {
      unit: "일반회계", tab: "수입", fund: "일반회계 현금", desc: "현금으로 받은 찬조금",
      rows: [["1035 - 잡수입", 50000, "찬조금", "홍길동"]],
    }),
    marks: [
      { sel: `${C} button:text-is("수입")`, n: 1 },
      { sel: S(1), n: 2 },
    ],
  },
  {
    file: "accounting/g-transfer-withdraw.png", path: "/accounting/funds", clip: TCARD,
    prepare: (p) => transferFill(p, { unit: "일반회계", from: "일반회계 보통예금", to: "일반회계 현금", amount: 100000, desc: "현금 인출 (소액 지출용)" }),
    marks: [
      { sel: `${TCARD} select >> nth=0`, n: 1 },
      { sel: `${TCARD} select >> nth=1`, n: 2 },
      { sel: `${TCARD} input[placeholder="금액"]`, n: 3 },
      { sel: `${TCARD} button:has-text("이체 등록")`, n: 4 },
    ],
  },
  {
    file: "accounting/g-transfer-deposit.png", path: "/accounting/funds", clip: TCARD,
    prepare: (p) => transferFill(p, { unit: "일반회계", from: "일반회계 현금", to: "일반회계 보통예금", amount: 150000, desc: "남은 현금 통장 입금" }),
    marks: [
      { sel: `${TCARD} select >> nth=0`, n: 1 },
      { sel: `${TCARD} select >> nth=1`, n: 2 },
    ],
  },
  {
    file: "accounting/g-funds-status.png", path: "/accounting/funds", clip: C, maxHeight: 1000,
    prepare: (p) => pickUnit(p, "일반회계"),
    marks: [
      { sel: `${C} tr:has-text("일반회계 현금") >> nth=0`, n: 1, pad: 2 },
      { sel: `${C} th:text-is("이체(+/−)")`, n: 2 },
      { sel: `${C} th:text-is("장부잔액")`, n: 3 },
      { sel: `${C} div:text-matches("^2026년 이체 내역")`, n: 4 },
    ],
  },
  {
    file: "accounting/g-transfer-fixed.png", path: "/accounting/funds", clip: C, maxHeight: 820,
    prepare: (p) => transferFill(p, { unit: "십일조회계", from: "십일조 보통예금", to: "십일조 정기예금", amount: 3000000, desc: "정기예금 추가 예치" }),
    marks: [
      { sel: `${C} tr:has-text("십일조 정기예금") >> nth=0`, n: 1, pad: 2 },
      { sel: TCARD, n: 2, pad: 2 },
      { sel: `${C} tr:has-text("정기예금 추가 예치")`, n: 3, pad: 2 },
    ],
  },
  {
    file: "accounting/g-unit-transfer-form.png", path: "/accounting/unit-transfers", clip: `${C} div.bg-white >> nth=0`,
    prepare: async (p) => {
      const card = p.locator(`${C} div.bg-white`).first();
      await card.locator("select").nth(0).selectOption({ label: "십일조 보통예금" });
      await card.locator("select").nth(1).selectOption({ label: "일반회계 보통예금" });
      await card.locator('input[placeholder="금액"]').fill("2000000");
      await card.locator('input[placeholder="적요"]').fill("성탄 행사 경비 부족분");
    },
    marks: [
      { sel: `${C} label:has-text("대여") >> nth=0`, n: 1 },
      { sel: `${C} div.bg-white >> nth=0 >> select >> nth=0`, n: 2 },
      { sel: `${C} div.bg-white >> nth=0 >> select >> nth=1`, n: 3 },
      { sel: `${C} input[placeholder="금액"]`, n: 4 },
      { sel: `${C} button:text-is("등록")`, n: 5 },
    ],
  },
  {
    file: "accounting/g-unit-transfer-list.png", path: "/accounting/unit-transfers", clip: C, maxHeight: 640,
    marks: [
      { sel: `${C} div:has(> div:text-matches("미상환 잔액")) >> nth=-1`, n: 1, pad: 2 },
      { sel: `${C} tr:has-text("1차 상환")`, n: 2, pad: 2 },
      { sel: `${C} tr:has-text("여름집회 경비")`, n: 3, pad: 2 },
    ],
  },
  {
    file: "accounting/g-unit-transfer-vouchers.png", path: "/accounting/vouchers", clip: C, maxHeight: 560,
    prepare: async (p) => { await setDates(p, "2026-08-20", "2026-08-20"); await clickExact(p, "조회"); await p.waitForTimeout(1200); },
    marks: [
      { sel: `${C} tr:has-text("타회계대체출금")`, n: 1, pad: 2 },
      { sel: `${C} tr:has-text("타회계대체입금")`, n: 2, pad: 2 },
    ],
  },
  {
    file: "accounting/g-check.png", path: "/accounting/funds", clip: `${C} table >> nth=0`, clipPad: 8,
    prepare: async (p) => {
      await pickUnit(p, "일반회계");
      const row = p.locator(`${C} tr:has-text("일반회계 현금")`).first();
      await row.locator("button:has-text('실제 잔액 입력')").click();
      await row.locator('input[placeholder$="실제 잔액"]').fill("666000");
      await row.locator('input[placeholder="메모"]').fill("금고 확인");
    },
    marks: [
      { sel: `${C} tr:has-text("일반회계 보통예금") >> td >> nth=6`, n: 1, pad: 2 },
      { sel: `${C} tr:has-text("일반회계 현금") >> td >> nth=6`, n: 2, pad: 2 },
    ],
  },

  // ───────── 전표입력 (accounting-entry) ─────────
  {
    file: "accounting/entry-overview.png", path: "/accounting/entry", clip: C, maxHeight: 640,
    prepare: (p) => pickUnit(p, "일반회계"),
    marks: [
      { sel: `${C} button:text-is("수입")`, n: 1, el: "parent" },
      { sel: `${C} input[type=date]`, n: 2 },
      { sel: S(0), n: 3 },
      { sel: S(1), n: 4 },
      { sel: `${C} input[placeholder="전표 전체에 대한 적요"]`, n: 5 },
      { sel: `${C} input[placeholder="저장 시 자동 발급"]`, n: 6 },
      { sel: `${C} table >> nth=0`, n: 7, pad: 2 },
      { sel: `${C} button:has-text("행 추가")`, n: 8 },
      { sel: `${C} button:text-is("저장")`, n: 9 },
      { sel: `${C} button:has-text("양식 다운로드")`, n: 10, el: "parent", side: "tr" },
    ],
  },
  {
    file: "accounting/entry-income.png", path: "/accounting/entry", clip: C, maxHeight: 520,
    prepare: (p) => entryFill(p, {
      unit: "일반회계", tab: "수입", desc: "11/8 주일 별도 감사",
      rows: [["1005 - 감사연보", 100000, "결혼 감사", "홍길동"], ["1006 - 특별연보", 300000, "선교 특별", "김영희"]],
    }),
    marks: [
      { sel: `${C} th:text-is("납부자")`, n: 1 },
      { sel: `${C} td:text-is("합계")`, n: 2, el: "parent", pad: 2 },
    ],
  },
  {
    file: "accounting/entry-refund.png", path: "/accounting/entry", clip: C, maxHeight: 520,
    prepare: (p) => entryFill(p, {
      unit: "일반회계", tab: "지출", desc: "사택 공과금 실비 정산",
      rows: [["2069 - 전기세", -42000, "사택 전기 실비 환급", "사택"], ["2070 - 수도세", -15000, "사택 수도 실비 환급", "사택"]],
    }),
    marks: [
      { sel: `${C} input[placeholder="0 (환급은 -)"] >> nth=0`, n: 1 },
      { sel: `${C} td:text-is("합계")`, n: 2, el: "parent", pad: 2 },
    ],
  },
  {
    file: "accounting/entry-today.png", path: "/accounting/entry", clip: C, maxHeight: 820,
    prepare: async (p) => {
      await pickUnit(p, "일반회계");
      await p.locator(`${C} button:has-text("20261108-001")`).first().click();
      await p.waitForTimeout(800);
    },
    marks: [
      { sel: `${C} button:has-text("20261108-001")`, n: 1, pad: 2 },
      { sel: `${C} button:text-is("수정")`, n: 2 },
      { sel: `${C} button:text-is("삭제")`, n: 3 },
      { sel: `${C} button:text-is("취소")`, n: 4 },
    ],
  },

  // ───────── 증빙자료 · 전표 출력 ─────────
  {
    file: "accounting/evidence-new.png", path: "/accounting/entry", clip: C, maxHeight: 700,
    prepare: async (p) => {
      await entryFill(p, {
        unit: "일반회계", tab: "지출", fund: "일반회계 현금", desc: "11/8 차량 유류·주차",
        rows: [["2077 - 차량유대", 76500, "휘발유 45L", "○○주유소"], ["2084 - 주차장이용료", 3000, "심방 주차", "공영주차장"]],
      });
      const dir = process.env.CAP_EVIDENCE_DIR;
      await p.locator(`${C} input[type=file][accept*="pdf"]`).setInputFiles([`${dir}/주유영수증.png`, `${dir}/주차영수증.png`]);
      await p.waitForTimeout(500);
    },
    marks: [
      { sel: `${C} div:has(> div:text-matches("^증빙자료")) >> nth=-1`, n: 1, pad: 2 },
      { sel: `${C} button:has-text("증빙 추가")`, n: 2 },
      { sel: `${C} button:text-is("저장")`, n: 3 },
    ],
  },
  {
    file: "accounting/evidence-edit.png", path: "/accounting/entry", clip: C, maxHeight: 820,
    prepare: async (p) => {
      await pickUnit(p, "일반회계");
      await p.locator(`${C} input[type=date]`).first().fill("2026-10-08");
      await p.waitForTimeout(1500);
      await p.locator(`${C} button:has-text("20261008-001")`).first().click();
      await p.waitForTimeout(1500);
    },
    marks: [
      { sel: `${C} div:has(> div:text-matches("^증빙자료")) >> nth=-1`, n: 1, pad: 2 },
      { sel: `${C} a:text-is("전표 출력")`, n: 2 },
      { sel: `${C} button:has-text("20261008-001") span[role=button]`, n: 3 },
    ],
  },
  {
    file: "accounting/evidence-list.png", path: "/accounting/vouchers", clip: C, maxHeight: 760,
    prepare: async (p) => {
      await setDates(p, "2026-10-01", "2026-10-12");
      await p.locator(`${C} select`).nth(0).selectOption({ label: "일반회계" });
      await clickExact(p, "조회"); await p.waitForTimeout(1500);
    },
    marks: [
      { sel: `${C} span[role=button] >> nth=0`, n: 1, pad: 3 },
      { sel: `${C} button:text-is("전표 출력")`, n: 2 },
    ],
  },
  {
    file: "accounting/evidence-viewer.png", path: "/accounting/vouchers", clip: null, height: 860,
    prepare: async (p) => {
      await setDates(p, "2026-10-01", "2026-10-12");
      await p.locator(`${C} select`).nth(0).selectOption({ label: "일반회계" });
      await clickExact(p, "조회"); await p.waitForTimeout(1500);
      await p.locator(`${C} span[role=button]`).first().click();
      await p.waitForTimeout(1500);
    },
    allowModal: true,
  },
  {
    file: "accounting/evidence-modal.png", path: "/accounting/vouchers", clip: null, height: 980,
    prepare: async (p) => {
      await setDates(p, "2026-10-10", "2026-10-10");
      await p.locator(`${C} select`).nth(0).selectOption({ label: "일반회계" });
      await clickExact(p, "조회"); await p.waitForTimeout(1500);
      await p.locator(`${C} button:has-text("20261010-001")`).first().click();
      await p.waitForTimeout(2000);
    },
    allowModal: true,
  },
  {
    // 한 장에 2건: 일반회계 20261008-001 · 20261010-001 (증빙 있는 전표) — id 는 가상 데이터 기준 → CAP_PRINT_IDS="223,219" 처럼 지정
    file: "accounting/voucher-print.png", path: `/accounting/vouchers/print?ids=${process.env.CAP_PRINT_IDS || "1"}`, clip: "section.sheet", clipPad: 0, maxHeight: 1100,
    width: 900, height: 1200,
  },

  // ───────── 전표현황 (accounting-vouchers) ─────────
  {
    file: "accounting/vouchers-overview.png", path: "/accounting/vouchers", clip: C, maxHeight: 900,
    prepare: async (p) => {
      await setDates(p, "2026-10-01", "2026-10-31");
      await p.locator(`${C} select`).nth(0).selectOption({ label: "일반회계" });
      await clickExact(p, "조회"); await p.waitForTimeout(1200);
    },
    marks: [
      { sel: `${C} input[type=date] >> nth=0`, n: 1, el: "parent" },
      { sel: S(0), n: 2 },
      { sel: `${C} input[placeholder="계정과목 검색"]`, n: 3 },
      { sel: `${C} button:text-is("조회")`, n: 4 },
      { sel: `${C} button:text-is("엑셀")`, n: 5 },
      { sel: `${C} div:has(> span:text-is("수입")) >> nth=0`, n: 6, pad: 2 },
      { sel: `${C} th:has-text("입력자")`, n: 7 },
    ],
  },
  {
    file: "accounting/vouchers-account.png", path: "/accounting/vouchers", clip: C, maxHeight: 1250,
    prepare: async (p) => {
      await setDates(p, "2026-01-01", "2026-10-31");
      await p.locator(`${C} select`).nth(0).selectOption({ label: "일반회계" });
      await p.fill(`${C} input[placeholder="계정과목 검색"]`, "전기세");
      await clickExact(p, "조회"); await p.waitForTimeout(1500);
    },
    marks: [
      { sel: `${C} input[placeholder="계정과목 검색"]`, n: 1 },
      { sel: `${C} tr:has-text("3월 월계")`, n: 2, pad: 1 },
      { sel: `${C} tr:has-text("누계") >> nth=2`, n: 3, pad: 1 },
    ],
  },
  {
    file: "accounting/vouchers-edit.png", path: "/accounting/vouchers", clip: null, height: 820,
    prepare: async (p) => {
      await setDates(p, "2026-11-01", "2026-11-08");
      await clickExact(p, "조회"); await p.waitForTimeout(1200);
      await p.locator(`${C} button:has-text("20261108-001")`).first().click();
      await p.waitForTimeout(800);
    },
  },

  // ───────── 보고서 ─────────
  {
    file: "accounting/report-monthly.png", path: "/accounting/report/monthly", clip: C, maxHeight: 1500,
    prepare: async (p) => { await pickUnit(p, "일반회계", 0); await p.locator(`${C} select`).nth(2).selectOption({ label: "10월" }); await p.waitForTimeout(1500); },
    marks: [
      { sel: S(0), n: 1 },
      { sel: `${C} td:text-is("이월금")`, n: 2, el: "parent", pad: 1 },
      { sel: `${C} th:has-text("당월")`, n: 3 },
      { sel: `${C} th:has-text("누계")`, n: 4 },
      { sel: `${C} td:has-text("차액")`, n: 5, el: "parent", pad: 1 },
    ],
  },
  {
    file: "accounting/report-account.png", path: "/accounting/report/account", clip: C, maxHeight: 1500,
    prepare: async (p) => { await pickUnit(p, "일반회계", 0); await setDates(p, "2026-07-01", "2026-10-31"); await p.waitForTimeout(1500); },
    marks: [
      { sel: `${C} input[type=date] >> nth=0`, n: 1, el: "parent" },
      { sel: `${C} th:text-is("7월")`, n: 2 },
      { sel: `${C} th:text-is("기간 합계")`, n: 3 },
      { sel: `${C} th:text-is("누계")`, n: 4 },
      { sel: `${C} td:text-is("지출 월계")`, n: 5, el: "parent", pad: 1 },
    ],
  },
  {
    file: "accounting/report-daily.png", path: "/accounting/report/daily", clip: C, maxHeight: 1300,
    prepare: async (p) => { await pickUnit(p, "일반회계", 0); await setDates(p, "2026-10-01", "2026-10-31"); await p.waitForTimeout(1500); },
    marks: [
      { sel: `${C} td:text-is("전기이월")`, n: 1, el: "parent", pad: 1 },
      { sel: `${C} tr:has-text("월계") >> nth=0`, n: 2, pad: 1 },
      { sel: `${C} tr:has-text("누계") >> nth=0`, n: 3, pad: 1 },
    ],
  },
  {
    file: "accounting/settlement.png", path: "/accounting/settlement", clip: C, maxHeight: 1300,
    prepare: async (p) => { await pickUnit(p, "일반회계", 0); await p.locator(`${C} select`).nth(2).selectOption({ label: "10월" }); await p.waitForTimeout(1500); },
    marks: [
      { sel: `${C} button:text-is("월별 결산")`, n: 1, el: "parent" },
      { sel: `${C} td:text-is("전기이월")`, n: 2, el: "parent", pad: 1 },
      { sel: `${C} th:has-text("누계")`, n: 3 },
    ],
  },
  {
    file: "accounting/settlement-annual.png", path: "/accounting/settlement", clip: C, maxHeight: 1100,
    prepare: async (p) => { await pickUnit(p, "일반회계", 0); await clickExact(p, "연간 결산"); await p.waitForTimeout(1500); },
  },
  {
    file: "accounting/annual-top.png", path: "/accounting/report/annual", clip: C, maxHeight: 700,
    marks: [
      { sel: S(0), n: 1 },
      { sel: `${C} input[type=date]`, n: 2 },
      { sel: `${C} button:text-is("인쇄")`, n: 3 },
      { sel: `${C} td:text-is("회계간 대체(순)")`, n: 4, el: "parent", pad: 1 },
    ],
  },
  {
    file: "accounting/annual-unit.png", path: "/accounting/report/annual", clip: `${C} section.break-inside-avoid >> nth=1`, maxHeight: 1400,
    marks: [
      { sel: `${C} section.break-inside-avoid >> nth=1 >> text=타회계 대체 입금`, n: 1, pad: 3 },
      { sel: `${C} section.break-inside-avoid >> nth=1 >> td:has-text("대여 입금")`, n: 2, pad: 1 },
      { sel: `${C} section.break-inside-avoid >> nth=1 >> td:has-text("상환 출금")`, n: 3, pad: 1 },
      { sel: `${C} section.break-inside-avoid >> nth=1 >> text=/통장별 잔액/`, n: 4, pad: 3 },
    ],
  },

  // ───────── 마감 ─────────
  {
    file: "accounting/closing.png", path: "/accounting/closing", clip: C, maxHeight: 900,
    prepare: async (p) => { await pickUnit(p, "일반회계", 0); await p.waitForTimeout(2000); },
    marks: [
      { sel: `${C} tbody tr >> nth=8`, n: 1, pad: 1 },
      { sel: `${C} tbody tr >> nth=9`, n: 2, pad: 1 },
    ],
  },
  {
    file: "accounting/year-closing.png", path: "/accounting/year-closing", clip: C, maxHeight: 760,
    prepare: wait(1500),
    marks: [
      { sel: S(0), n: 1 },
      { sel: `${C} thead input[type=checkbox]`, n: 2 },
      { sel: `${C} button:has-text("연마감")`, n: 3 },
      { sel: `${C} tr:has-text("일반회계") >> td >> nth=1`, n: 4, pad: 2 },
      { sel: `${C} th:text-is("상태")`, n: 5 },
      { sel: `${C} th:has-text("2027년 이월금")`, n: 6 },
    ],
  },

  // ───────── 설정 ─────────
  {
    file: "accounting/settings-accounts.png", path: "/accounting/settings/accounts", clip: C, maxHeight: 1500,
    prepare: async (p) => {
      await p.locator(`${C} select`).nth(0).selectOption({ label: "일반회계 (001)" });
      await p.waitForTimeout(1500);
      await p.locator(`${C} span:text-is("제세공과금")`).first().click();
      await p.waitForTimeout(800);
    },
    marks: [
      { sel: `${C} span:text-is("제세공과금")`, n: 1, el: "parent" },
      { sel: `${C} input[placeholder="비우면 계정명으로 표시"]`, n: 2 },
      { sel: `${C} label:has-text("결산서에서 하위 계정 펼쳐 표시")`, n: 3 },
      { sel: `${C} label:has-text("사용") >> nth=-1`, n: 4 },
    ],
  },
  {
    file: "accounting/settings-mapping.png", path: "/accounting/settings/account-mapping", clip: C, maxHeight: 1100,
  },
  {
    file: "accounting/settings-units.png", path: "/accounting/settings/units", clip: C, maxHeight: 700,
  },
  {
    file: "accounting/settings-funds.png", path: "/accounting/settings/funds", clip: C, maxHeight: 760,
    prepare: async (p) => { await p.locator(`${C} tr:has-text("일반회계 현금")`).first().click(); await p.waitForTimeout(600); },
    marks: [
      { sel: `${C} button:has-text("통장 추가") >> nth=1`, n: 1 },
      { sel: `${C} tr:has-text("일반회계 현금")`, n: 2, pad: 2 },
      { sel: `${C} label:text-is("종류")`, n: 3, el: "parent", pad: 2 },
      { sel: `${C} label:text-is("계좌번호")`, n: 4, el: "parent", pad: 2 },
      { sel: `${C} label:has-text("기본 통장")`, n: 5 },
    ],
  },
  {
    file: "accounting/settings-balance.png", path: "/accounting/settings/balance", clip: C, maxHeight: 900,
    marks: [
      { sel: S(0), n: 1 },
      { sel: `${C} tr:has-text("일반회계 보통예금") input`, n: 2 },
      { sel: `${C} tr:has-text("일반회계") >> nth=0 >> td >> nth=2`, n: 3 },
      { sel: `${C} button:text-is("저장")`, n: 4 },
    ],
  },
  {
    file: "accounting/settings-journal.png", path: "/accounting/settings/journal-import", clip: C, maxHeight: 520,
    marks: [
      { sel: S(0), n: 1 },
      { sel: S(1), n: 2 },
      { sel: `${C} label:text-is("현금 계정코드")`, n: 3, el: "parent", pad: 2 },
      { sel: `${C} input[type=file]`, n: 4, el: "parent" },
      { sel: `${C} button:has-text("미리보기")`, n: 5 },
    ],
  },
];

const noReauth = !!process.env.NOREAUTH;
await run(specs.filter((s) => !!s.noReauth === noReauth));
