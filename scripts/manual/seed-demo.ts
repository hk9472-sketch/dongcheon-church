/**
 * 매뉴얼 화면 캡처용 "가상" 데이터 시드 — 운영 DB 에서 절대 실행 금지.
 *
 * 구조(회계단위·계정과목·통장·연보 매핑)는 운영과 같게, 사람·금액은 전부 가상.
 * DATABASE_URL 의 DB 이름이 dc_manual 이 아니면 즉시 중단한다.
 *
 * 사용:
 *   DATABASE_URL="mysql://root@127.0.0.1:3399/dc_manual" RRN_ENCRYPTION_KEY=<64hex> \
 *     npx tsx scripts/manual/seed-demo.ts
 */
import { PrismaClient } from "@prisma/client";
import { encryptRrn } from "../../src/lib/rrnCrypto";

const url = process.env.DATABASE_URL || "";
if (!/\/dc_manual(\?|$)/.test(url)) {
  console.error("중단: DATABASE_URL 이 dc_manual DB 가 아닙니다. (운영 보호)");
  process.exit(1);
}

const prisma = new PrismaClient();
const YEAR = 2026;
const TODAY = "2026-11-08";

// ───────────── 구조 (운영과 동일) ─────────────
const UNITS: [number, string, string, number][] = [
  [1, "001", "일반회계", 2],
  [2, "002", "십일조회계", 1],
  [3, "003", "건축회계", 3],
  [4, "004", "주일학교회계", 5],
  [5, "005", "전도회계", 4],
];
// id, unitId, code, name, type, parentId, level, sortOrder, isActive, reportName, reportDetail, description
type A = [number, number, string, string, "D" | "C", number | null, number, number, number, string | null, number, string | null];
const ACCOUNTS: A[] = [
  [1, 1, "1003", "주일연보", "D", null, 1, 10, 1, null, 0, null],
  [3, 1, "1005", "감사연보", "D", null, 1, 20, 1, null, 0, null],
  [12, 1, "1007", "오일연보", "D", null, 1, 30, 1, null, 0, null],
  [4, 1, "1006", "특별연보", "D", null, 1, 40, 1, null, 0, null],
  [13, 1, "1015", "절기연보", "D", null, 1, 50, 1, null, 0, null],
  [5, 1, "1011", "부활감사", "D", 13, 2, 0, 1, null, 0, null],
  [6, 1, "1012", "맥추감사", "D", 13, 2, 0, 1, null, 0, null],
  [7, 1, "1013", "추수감사", "D", 13, 2, 0, 1, null, 0, null],
  [8, 1, "1014", "성탄감사", "D", 13, 2, 0, 1, null, 0, null],
  [14, 1, "1028", "이자수입", "D", null, 1, 60, 1, null, 0, null],
  [15, 1, "1035", "잡수입", "D", null, 1, 70, 1, "잡수입(찬조금 등)", 0, null],
  [16, 1, "1038", "환급금", "D", null, 1, 80, 1, null, 0, null],
  [17, 1, "1039", "건물공과금", "D", null, 1, 90, 0, null, 0, "사용 중지 — 공과금 실비는 해당 지출에 음수(환급)로 입력"],
  [18, 1, "1041", "기타수입(태양광배상금)", "D", null, 1, 100, 1, "태양광손해배상금", 0, null],
  [19, 1, "2055", "건물관리비", "C", null, 1, 10, 1, null, 0, null],
  [20, 1, "2059", "제세공과금", "C", null, 1, 20, 1, null, 1, "결산서에서 하위 펼침"],
  [21, 1, "2060", "차량비", "C", null, 1, 30, 1, "차량", 1, "결산서에서 하위 펼침"],
  [22, 1, "2073", "난방연료비", "C", null, 1, 40, 1, "난방 연료비", 0, null],
  [23, 1, "2058", "비품", "C", null, 1, 50, 1, "비품비", 0, "결산서 한 줄 = 비품비 + 별관비품"],
  [24, 1, "2061", "목회활동비", "C", null, 1, 60, 1, null, 0, null],
  [25, 1, "2062", "집회지원", "C", null, 1, 70, 1, "집회 지원", 0, "결산서 한 줄 = 집회지원비 + 집회경비"],
  [26, 1, "2063", "도서인쇄비", "C", null, 1, 80, 1, "인쇄비", 0, null],
  [27, 1, "2065", "복리후생비", "C", null, 1, 90, 1, "복리 후생비", 0, null],
  [28, 1, "2064", "행사비", "C", null, 1, 100, 1, null, 0, null],
  [29, 1, "2082", "소모품비", "C", null, 1, 110, 1, "소모품", 0, null],
  [30, 1, "2068", "잡비", "C", null, 1, 120, 1, "기타 잡비", 0, "결산서 한 줄 = 이체수수료 + 잡비"],
  [31, 1, "2090", "방송지출", "C", null, 1, 130, 1, "실시간 방송 관련", 0, null],
  [32, 1, "2066", "공회교회 지원·업무", "C", null, 1, 140, 1, "공회교회 지원, 업무", 0, "결산서 한 줄 = 공회업무비 + 서인교회지원"],
  [33, 1, "2069", "전기세", "C", 20, 2, 1, 1, null, 0, null],
  [34, 1, "2070", "수도세", "C", 20, 2, 2, 1, null, 0, null],
  [35, 1, "2072", "통신비", "C", 20, 2, 3, 1, "통신비(전화요금 등)", 0, null],
  [36, 1, "2071", "재산세", "C", 20, 2, 4, 1, null, 0, null],
  [37, 1, "2089", "기타세금", "C", 20, 2, 5, 1, "기타(세금·과태료)", 0, null],
  [40, 1, "2075", "차량보험료", "C", 21, 2, 1, 1, "차량 보험", 0, null],
  [41, 1, "2076", "차량수리비", "C", 21, 2, 2, 1, "차량 관리(수리 등)", 0, null],
  [42, 1, "2077", "차량유대", "C", 21, 2, 3, 1, "차량 유대", 0, null],
  [43, 1, "2078", "자동차세", "C", 21, 2, 4, 1, null, 0, null],
  [44, 1, "2079", "교통비", "C", 21, 2, 5, 1, "통행료(고속도로) 등", 0, null],
  [45, 1, "2084", "주차장이용료", "C", 21, 2, 6, 1, "외부 주차장 이용료", 0, null],
  [46, 1, "2087", "기타차량관리비", "C", 21, 2, 7, 1, "기타(차량, 주차장 관리)", 0, null],
  [47, 1, "2056", "주차장관리비", "C", 21, 2, 8, 1, "주차장 관리", 0, null],
  [55, 1, "2081", "비품비", "C", 23, 2, 1, 1, null, 0, null],
  [56, 1, "2092", "별관비품", "C", 23, 2, 2, 1, null, 0, null],
  [57, 1, "2057", "집회지원비", "C", 25, 2, 1, 1, null, 0, null],
  [58, 1, "2094", "집회경비", "C", 25, 2, 2, 1, null, 0, null],
  [59, 1, "2085", "이체수수료", "C", 30, 2, 1, 1, null, 0, null],
  [60, 1, "2086", "잡비", "C", 30, 2, 2, 1, null, 0, null],
  [61, 1, "2091", "공회업무비", "C", 32, 2, 1, 1, null, 0, null],
  [62, 1, "2093", "서인교회지원", "C", 32, 2, 2, 1, null, 0, null],
  [2, 2, "1003", "십일조연보", "D", null, 1, 10, 1, "십일조 연보", 0, null],
  [70, 2, "1028", "이자수입", "D", null, 1, 20, 1, "이자 수입", 0, null],
  [71, 2, "1008", "목회자기초연보", "D", null, 1, 30, 1, "목회자 기초연보", 0, null],
  [72, 2, "1050", "대여금입금", "D", null, 1, 90, 1, "대여금 입금", 0, "비경상 — 외부 차입금 입금 (회계 간 대여는 [회계 간 대체] 사용)"],
  [73, 2, "2001", "교역자사례", "C", null, 1, 10, 1, "교역자 사례", 0, null],
  [74, 2, "2002", "공회비", "C", null, 1, 20, 1, null, 0, null],
  [75, 2, "2003", "연구소지원", "C", null, 1, 30, 1, "연구소 지원", 0, null],
  [76, 2, "2004", "사택수술및치료비", "C", null, 1, 40, 1, "사택 수술 및 치료비", 0, null],
  [77, 2, "2005", "4대보험부담금", "C", null, 1, 50, 1, "4대보험 부담금", 0, null],
  [78, 2, "2006", "양성원지원", "C", null, 1, 60, 1, "양성원 지원", 0, null],
  [79, 2, "2007", "타교회건축지원", "C", null, 1, 70, 1, "타교회 건축연보", 0, null],
  [80, 2, "2008", "선교후원", "C", null, 1, 80, 1, null, 0, null],
  [81, 2, "2085", "이체수수료", "C", null, 1, 90, 1, "수수료", 0, null],
  [9, 3, "1001", "건축연보", "D", null, 1, 10, 1, "월정연보", 0, null],
  [82, 3, "1028", "이자수입", "D", null, 1, 20, 1, null, 0, null],
  [83, 3, "2007", "타교회건축지원", "C", null, 1, 10, 1, "타교회 건축연보", 0, null],
  [84, 3, "2085", "이체수수료", "C", null, 1, 20, 1, "수수료", 0, null],
  [10, 4, "1001", "주일학교연보", "D", null, 1, 10, 1, null, 0, null],
  [85, 4, "1028", "이자수입", "D", null, 1, 20, 1, "이자", 0, null],
  [86, 4, "1035", "기타수입", "D", null, 1, 30, 1, "기타", 0, null],
  [87, 4, "2001", "주교시상", "C", null, 1, 10, 1, null, 0, null],
  [88, 4, "2002", "펄기시상", "C", null, 1, 20, 1, null, 0, null],
  [89, 4, "2003", "성탄선물", "C", null, 1, 30, 1, null, 0, null],
  [90, 4, "2004", "암송시상", "C", null, 1, 40, 1, null, 0, null],
  [91, 4, "2086", "기타지출", "C", null, 1, 50, 1, "기타", 0, null],
  [11, 5, "1001", "전도회비", "D", null, 1, 10, 1, null, 0, null],
  [92, 5, "1028", "이자수입", "D", null, 1, 20, 1, "이자", 0, null],
  [93, 5, "2001", "경조사비", "C", null, 1, 10, 1, null, 0, null],
  [94, 5, "2002", "불우이웃성금", "C", null, 1, 20, 1, "불우이웃 성금", 0, null],
  [95, 5, "2003", "심방지원", "C", null, 1, 30, 1, "심방 지원", 0, null],
  [96, 5, "2086", "기타지출", "C", null, 1, 40, 1, "기타", 0, null],
];
const MAPPINGS: [string, number][] = [
  ["tithe", 2], ["sunday", 1], ["thanks", 3], ["special", 4], ["oil", 12],
  ["easter", 5], ["midyear", 6], ["harvest", 7], ["christmas", 8],
  ["sundaySchool", 10], ["duesJeondo", 11], ["duesBuild", 9],
];
// id, unitId, name, kind, isDefault, sortOrder, bankName, accountNo, 2026 연초잔액
const FUNDS: [number, number, string, string, boolean, number, string | null, string | null, number][] = [
  [1, 1, "일반회계 보통예금", "보통", true, 1, "농협", "000-0000-0001-01", 12_480_000],
  [2, 1, "일반회계 현금", "현금", false, 9, null, null, 350_000],
  [3, 2, "십일조 보통예금", "보통", true, 1, "농협", "000-0000-0002-02", 8_920_000],
  [4, 2, "십일조 정기예금", "정기", false, 2, "농협", "000-0000-0003-03", 30_000_000],
  [5, 2, "십일조 현금", "현금", false, 9, null, null, 120_000],
  [6, 3, "건축 보통예금", "보통", true, 1, "농협", null, 45_300_000],
  [7, 4, "주일학교 보통예금", "보통", true, 1, null, null, 2_150_000],
  [8, 5, "전도 보통예금", "보통", true, 1, null, null, 3_870_000],
];

// ───────────── 가상 이름 / 난수 ─────────────
let seed = 20261108;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const between = (a: number, b: number, unit = 1000) => Math.round((a + rnd() * (b - a)) / unit) * unit;

const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황"];
const GIVEN = ["민준", "서연", "도윤", "하은", "예준", "지우", "시우", "수아", "주원", "지아", "하준", "서윤", "은우", "채원",
  "지호", "다은", "현우", "예린", "건우", "소율", "우진", "윤서", "선우", "하린", "연우", "가은", "정민", "미숙", "영희",
  "순자", "영수", "철수", "명자", "경희", "성호", "정숙", "상철", "옥순"];
const usedNames = new Set<string>();
function fakeName() {
  for (;;) {
    const n = pick(SURNAMES) + pick(GIVEN);
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
}

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const ymd = (dt: Date) => dt.toISOString().slice(0, 10);
function sundays(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = d(from);
  while (cur.getUTCDay() !== 0) cur.setUTCDate(cur.getUTCDate() + 1);
  while (ymd(cur) <= to) { out.push(ymd(cur)); cur.setUTCDate(cur.getUTCDate() + 7); }
  return out;
}

const STAFF = { ledger: "김회계", ledger2: "박집사", offering: "이연보", dues: "최월정" };

async function wipe() {
  const tables = [
    "acc_unit_transfers", "acc_transfers", "acc_fund_checks", "acc_fund_balances", "acc_voucher_attachments", "acc_voucher_items", "acc_vouchers",
    "acc_closings", "acc_year_closings", "acc_balances", "offering_account_mappings", "acc_funds", "acc_accounts", "acc_units",
    "offering_entries", "offering_settlements", "offering_member_numbers", "offering_members",
    "monthly_dues_deposits", "monthly_dues_amounts", "monthly_dues_members", "sessions", "users",
  ];
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
  for (const t of tables) await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${t}\``);
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");
}

async function main() {
  await wipe();

  // 사용자 + 세션 (캡처 브라우저가 이 토큰으로 로그인)
  const admin = await prisma.user.create({
    data: {
      userId: "manual", password: "x", name: STAFF.ledger, level: 1, isAdmin: 1, email: "manual@example.com",
      emailVerified: true, accountAccess: true, accLedgerAccess: true, accOfferingAccess: true, accDuesAccess: true,
      accMemberEditAccess: true,
    },
  });
  await prisma.session.create({
    data: { sessionToken: "manual-demo-session", userId: admin.id, expires: new Date("2030-01-01T00:00:00Z") },
  });

  // 구조
  for (const [id, code, name, sortOrder] of UNITS) await prisma.accUnit.create({ data: { id, code, name, sortOrder } });
  for (const a of [...ACCOUNTS].sort((x, y) => (x[5] ? 1 : 0) - (y[5] ? 1 : 0))) {
    const [id, unitId, code, name, type, parentId, level, sortOrder, isActive, reportName, reportDetail, description] = a;
    await prisma.accAccount.create({
      data: { id, unitId, code, name, type, parentId, level, sortOrder, isActive: !!isActive, reportName, reportDetail: !!reportDetail, description },
    });
  }
  for (const [offeringKey, accountId] of MAPPINGS) await prisma.offeringAccountMapping.create({ data: { offeringKey, accountId } });
  for (const [id, unitId, name, kind, isDefault, sortOrder, bankName, accountNo, opening] of FUNDS) {
    await prisma.accFund.create({ data: { id, unitId, name, kind, isDefault, sortOrder, bankName, accountNo } });
    await prisma.accFundBalance.create({ data: { fundId: id, year: YEAR, amount: opening } });
  }
  for (const [unitId] of UNITS) {
    const sum = FUNDS.filter((f) => f[1] === unitId).reduce((s, f) => s + f[8], 0);
    await prisma.accBalance.create({ data: { unitId, year: YEAR, amount: sum, source: "manual" } });
  }

  // ───────────── 전표 ─────────────
  const seqByUnitDate = new Map<string, number>();
  async function voucher(
    unitId: number, type: "D" | "C", date: string, items: [number, number, string?, string?][],
    opt: { fundId?: number | null; desc?: string; by?: string; modified?: boolean } = {},
  ) {
    const k = `${unitId}:${date}`;
    const seq = (seqByUnitDate.get(k) ?? 0) + 1;
    seqByUnitDate.set(k, seq);
    const total = items.reduce((s, i) => s + i[1], 0);
    const created = new Date(`${date}T03:${String(10 + seq).padStart(2, "0")}:00Z`);
    await prisma.accVoucher.create({
      data: {
        unitId, type, date: d(date), voucherNo: `${date.replace(/-/g, "")}-${String(seq).padStart(3, "0")}`,
        description: opt.desc ?? null, totalAmount: total, fundId: opt.fundId ?? null,
        createdBy: opt.by ?? STAFF.ledger, createdAt: created,
        modifiedBy: opt.modified ? STAFF.ledger2 : null,
        modifiedAt: opt.modified ? new Date(created.getTime() + 86400000 * 2) : null,
        items: {
          create: items.map(([accountId, amount, description, counterpart], i) => ({
            seq: i + 1, accountId, amount, description: description ?? null, counterpart: counterpart ?? null,
          })),
        },
      },
    });
  }

  const allSundays = sundays(`${YEAR}-01-01`, TODAY);
  // 주일 연보 수입 (일별결산 → 전표 반영 결과 형태)
  for (const s of allSundays) {
    const month = Number(s.slice(5, 7));
    const items: [number, number, string?, string?][] = [
      [1, between(700_000, 1_100_000), "주일연보"],
      [3, between(150_000, 450_000), "감사연보"],
      [12, between(20_000, 90_000), "오일연보"],
    ];
    if (rnd() < 0.3) items.push([4, between(100_000, 500_000), "특별연보"]);
    if (s === "2026-04-05") items.push([5, 2_340_000, "부활감사"]);
    if (s === "2026-07-05") items.push([6, 1_980_000, "맥추감사"]);
    await voucher(1, "D", s, items, { desc: `${s} 주일 연보 (일별결산 반영)`, by: STAFF.offering });
    await voucher(2, "D", s, [[2, between(2_400_000, 3_600_000), "십일조연보"]], { desc: `${s} 십일조 (일별결산 반영)`, by: STAFF.offering });
    await voucher(4, "D", s, [[10, between(30_000, 80_000), "주일학교연보"]], { desc: `${s} 주일학교 연보`, by: STAFF.offering });
    void month;
  }
  // 월별 고정 지출
  for (let m = 1; m <= 10; m++) {
    const mm = String(m).padStart(2, "0");
    const day = (n: number) => `${YEAR}-${mm}-${String(n).padStart(2, "0")}`;
    // 일반회계 — 통장(보통예금) 지출
    await voucher(1, "C", day(10), [
      [33, between(180_000, 320_000), `${m}월 전기요금`, "한국전력"],
      [34, between(40_000, 90_000), `${m}월 수도요금`, "상수도사업본부"],
      [35, between(60_000, 75_000), `${m}월 인터넷·전화`, "통신사"],
    ], { fundId: 1, desc: `${m}월 공과금 자동이체`, modified: m === 3 });
    if (m % 2 === 0) {
      await voucher(1, "C", day(12), [[33, -between(30_000, 60_000), "사택 전기 실비 환급", "사택"]], { fundId: 1, desc: "사택 공과금 실비 (환급 = 음수)" });
    }
    await voucher(1, "C", day(15), [
      [42, between(150_000, 260_000), "차량 주유", "주유소"],
      [24, 500_000, "목회활동비"],
    ], { fundId: 1, desc: `${m}월 차량·목회활동` });
    await voucher(1, "C", day(20), [[59, 2_000, "이체수수료"]], { fundId: 1 });
    if (m === 1 || m === 6) await voucher(1, "C", day(22), [[40, 684_000, "차량 보험 갱신", "보험사"]], { fundId: 1 });
    if (m === 9) await voucher(1, "C", day(25), [[36, 412_000, "재산세 2기분", "구청"]], { fundId: 1 });
    if (m === 5) await voucher(1, "C", day(18), [[28, 1_250_000, "체육대회 행사비"], [26, 180_000, "행사 안내문 인쇄", "인쇄소"]], { fundId: 1, desc: "봄 행사" });
    // 일반회계 — 현금 지출 (현금 통장)
    await voucher(1, "C", day(8), [
      [29, between(20_000, 60_000), "청소용품", "마트"],
      [45, between(5_000, 15_000), "외부 주차", "주차장"],
    ], { fundId: 2, desc: `${m}월 소액 현금 지출` });
    if (m % 3 === 0) await voucher(1, "C", day(26), [[60, between(10_000, 40_000), "경조 꽃값"]], { fundId: 2, desc: "현금 지급" });
    // 십일조회계
    await voucher(2, "C", day(25), [
      [73, 3_200_000, `${m}월 사례`],
      [77, 286_000, `${m}월 4대보험`],
      [74, 300_000, `${m}월 공회비`],
      [81, 1_000, "이체수수료"],
    ], { fundId: 3, desc: `${m}월 정기 지출` });
    if (m % 3 === 0) await voucher(2, "D", day(28), [[70, between(80_000, 120_000), "정기예금 이자"]], { fundId: 4, desc: "분기 이자" });
    // 건축 / 전도 — 월정 반영
    await voucher(3, "D", day(14), [[9, between(1_800_000, 2_400_000), `${m}월 건축월정`]], { desc: `${m}월 건축월정 입금`, by: STAFF.dues });
    await voucher(5, "D", day(14), [[11, between(250_000, 380_000), `${m}월 전도회비`]], { desc: `${m}월 전도회비 입금`, by: STAFF.dues });
    if (m % 2 === 1) await voucher(5, "C", day(21), [[93, 100_000, "경조사 부조"]], { desc: "경조사비" });
    if (m === 5 || m === 10) await voucher(4, "C", day(17), [[87, 150_000, "출석 시상"], [90, 60_000, "암송 시상"]], { desc: "주일학교 시상" });
  }

  // ───────────── 연보 교인 (가상) ─────────────
  const GROUPS = ["1구역", "2구역", "3구역", "4구역", "5구역", "6구역"];
  const members: { id: number; name: string }[] = [];
  for (let i = 0; i < 48; i++) {
    const name = fakeName();
    const m = await prisma.offeringMember.create({
      data: {
        name, groupName: GROUPS[i % GROUPS.length], createdBy: STAFF.offering,
        createdAt: new Date(`${YEAR}-01-02T01:00:00Z`),
        address: i % 4 === 0 ? `부산광역시 ○○구 가상로 ${10 + i}` : null,
        phone: i % 4 === 0 ? `010-0000-${String(1000 + i)}` : null,
        residentNumber: i % 4 === 0 ? encryptRrn(`${String(50 + (i % 40)).padStart(2, "0")}0101-${i % 2 ? 1 : 2}000${String(100 + i)}`) : null,
      },
    });
    members.push({ id: m.id, name });
  }
  // 가족(공동번호): 2명씩 몇 쌍 — 대표는 familyId 없음, 구성원이 대표 id 를 가리킴 (앱 규칙과 동일)
  for (let i = 0; i < 12; i += 3) {
    await prisma.offeringMember.update({ where: { id: members[i + 1].id }, data: { familyId: members[i].id } });
  }
  // 관리번호 = 내부 번호 (운영 데이터와 같은 구조 — 관리번호 변경 전 상태)
  for (let i = 0; i < members.length; i++) {
    await prisma.offeringMemberNumber.create({
      data: { memberId: members[i].id, memberNo: members[i].id, validFrom: d(`${YEAR}-01-01`), createdBy: STAFF.offering },
    });
  }

  // 연보 입력 (주일마다)
  const entries: {
    date: Date; memberId: number | null; offeringType: string; amount: number; createdBy: string; createdAt: Date; description?: string;
  }[] = [];
  for (const s of allSundays) {
    const at = new Date(`${s}T04:00:00Z`);
    const firstSunday = Number(s.slice(8, 10)) <= 7;
    for (const m of members) {
      if (rnd() < 0.72) entries.push({ date: d(s), memberId: m.id, offeringType: "주일연보", amount: between(1_000, 20_000), createdBy: STAFF.offering, createdAt: at });
      if (firstSunday && rnd() < 0.6) entries.push({ date: d(s), memberId: m.id, offeringType: "십일조연보", amount: between(100_000, 600_000, 10_000), createdBy: STAFF.offering, createdAt: at });
      if (rnd() < 0.12) entries.push({ date: d(s), memberId: m.id, offeringType: "감사연보", amount: between(10_000, 100_000, 10_000), createdBy: STAFF.offering, createdAt: at, description: rnd() < 0.5 ? "생일 감사" : undefined });
      if (rnd() < 0.04) entries.push({ date: d(s), memberId: m.id, offeringType: "특별연보", amount: between(50_000, 300_000, 10_000), createdBy: STAFF.offering, createdAt: at });
      if (rnd() < 0.05) entries.push({ date: d(s), memberId: m.id, offeringType: "오일연보", amount: between(5_000, 30_000), createdBy: STAFF.offering, createdAt: at });
      if ((s === "2026-04-05" || s === "2026-07-05") && rnd() < 0.7)
        entries.push({ date: d(s), memberId: m.id, offeringType: "절기연보", amount: between(20_000, 100_000, 10_000), createdBy: STAFF.offering, createdAt: at });
    }
    // 무기명
    entries.push({ date: d(s), memberId: null, offeringType: "주일연보", amount: between(30_000, 120_000), createdBy: STAFF.offering, createdAt: at, description: "무기명" });
  }
  for (let i = 0; i < entries.length; i += 1000) await prisma.offeringEntry.createMany({ data: entries.slice(i, i + 1000) });

  // ───────────── 월정 (전도회 / 건축) ─────────────
  for (const [category, count, lo, hi] of [["전도회", 18, 10_000, 30_000], ["건축", 24, 50_000, 300_000]] as const) {
    for (let i = 0; i < count; i++) {
      const name = fakeName();
      const mem = await prisma.monthlyDuesMember.create({
        data: { category, memberNo: i + 1, name, createdBy: STAFF.dues, createdAt: new Date(`${YEAR}-01-03T01:00:00Z`) },
      });
      const amount = between(lo, hi, 10_000);
      // 탈퇴 예시: 전도회 6번 회원 — 6월까지 내고 그 해 월정액을 0원으로 저장(탈퇴)
      const withdrawn = category === "전도회" && i === 5;
      await prisma.monthlyDuesAmount.create({
        data: {
          category, year: YEAR, memberId: mem.id, amount: withdrawn ? 0 : amount, createdBy: STAFF.dues,
          ...(withdrawn ? { modifiedBy: STAFF.dues, modifiedAt: new Date(`${YEAR}-07-05T05:00:00Z`) } : {}),
        },
      });
      const paidMonths = withdrawn ? 6 : i % 7 === 3 ? 7 : i % 5 === 2 ? 9 : 10; // 일부 미납
      for (let m = 1; m <= paidMonths; m++) {
        const date = `${YEAR}-${String(m).padStart(2, "0")}-${String(8 + (m % 3)).padStart(2, "0")}`;
        await prisma.monthlyDuesDeposit.create({
          data: { category, date: d(date), memberId: mem.id, amount, installment: m, createdBy: STAFF.dues, createdAt: new Date(`${date}T05:00:00Z`) },
        });
      }
    }
  }

  const counts = {
    vouchers: await prisma.accVoucher.count(),
    members: await prisma.offeringMember.count(),
    entries: await prisma.offeringEntry.count(),
    dues: await prisma.monthlyDuesDeposit.count(),
  };
  console.log("가상 데이터 시드 완료:", counts);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
