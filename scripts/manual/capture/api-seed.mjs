// 가상 DB(dc_manual)에 실제 API 로 이체·대체·대사·마감·일별결산 데이터를 넣는다.
const BASE = process.env.CAP_BASE || "http://localhost:3100";
const H = { "Content-Type": "application/json", Cookie: "dc_session=manual-demo-session" };
async function call(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) console.log("FAIL", method, path, r.status, t.slice(0, 200));
  try { return JSON.parse(t); } catch { return t; }
}
const post = (p, b) => call("POST", p, b);

// 1) 같은 회계 안 통장 간 이체 (현금 인출·입금, 정기예금 예치)
for (let m = 1; m <= 10; m++) {
  const mm = String(m).padStart(2, "0");
  await post("/api/accounting/transfers", { unitId: 1, date: `2026-${mm}-05`, fromFundId: 1, toFundId: 2, amount: 100000, description: "현금 인출 (소액 지출용)" });
}
await post("/api/accounting/transfers", { unitId: 1, date: "2026-06-30", fromFundId: 2, toFundId: 1, amount: 150000, description: "남은 현금 통장 입금" });
await post("/api/accounting/transfers", { unitId: 2, date: "2026-03-02", fromFundId: 3, toFundId: 4, amount: 5000000, description: "정기예금 추가 예치" });
await post("/api/accounting/transfers", { unitId: 2, date: "2026-06-05", fromFundId: 3, toFundId: 5, amount: 200000, description: "현금 인출 (심방 경비)" });

// 2) 회계 간 대체 (대여 / 상환 / 지원)
await post("/api/accounting/unit-transfers", { date: "2026-08-20", kind: "대여", fromFundId: 3, toFundId: 1, amount: 3000000, description: "여름집회 경비 부족분" });
await post("/api/accounting/unit-transfers", { date: "2026-09-10", kind: "지원", fromFundId: 1, toFundId: 7, amount: 300000, description: "여름성경학교 지원" });
await post("/api/accounting/unit-transfers", { date: "2026-10-15", kind: "상환", fromFundId: 1, toFundId: 3, amount: 1000000, description: "1차 상환" });

// 3) 월마감 (1~9월, 전 회계)
for (const unitId of [1, 2, 3, 4, 5]) for (let month = 1; month <= 9; month++) await post("/api/accounting/closing", { unitId, year: 2026, month });

// 4) 통장 대사 (10/31 실제 잔액)
for (const unitId of [1, 2]) {
  const st = await call("GET", `/api/accounting/funds/status?unitId=${unitId}&date=2026-10-31`);
  for (const f of st.funds || []) {
    const diff = f.kind === "현금" && unitId === 1 ? -3000 : 0;
    await post("/api/accounting/funds/checks", { fundId: f.fundId, date: "2026-10-31", actualAmount: f.balance + diff, memo: diff ? "영수증 1건 미입력 확인 중" : "통장 잔액 확인" });
  }
}

// 5) 일별결산 (최근 주일)
function denoms(total) {
  const out = { check: 0, w50000: 0, w10000: 0, w5000: 0, w1000: 0, w500: 0, w100: 0, w50: 0, w10: 0 };
  let rest = total;
  out.check = Math.floor((rest * 0.3) / 100000) * 100000; rest -= out.check;
  const units = [["w50000", 50000], ["w10000", 10000], ["w5000", 5000], ["w1000", 1000], ["w500", 500], ["w100", 100], ["w50", 50], ["w10", 10]];
  for (const [k, v] of units) { const share = k === "w50000" ? 0.6 : k === "w10000" ? 0.8 : 1; const c = Math.floor((rest * share) / v); out[k] = c; rest -= c * v; }
  return out;
}
for (const date of ["2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08"]) {
  const g = await call("GET", `/api/accounting/offering/settlement?date=${date}`);
  const c = g.categories;
  const total = c.amtTithe + c.amtSunday + c.amtThanks + c.amtSpecial + c.amtOil + c.amtSeason;
  const extra = date === "2026-11-01" ? 12000 : 0; // 차액 예시
  await post("/api/accounting/offering/settlement", { date, denominations: denoms(total + extra), sundaySchool: 52000, envelopeCount: 41 });
}
console.log("api seed done");

// 6) 증빙자료 (가상 영수증 이미지 · PDF) — 전표현황·출력 캡처용
{
  const { receiptPng, samplePdf } = await import("./sample-evidence.mjs");
  const list = await call("GET", "/api/accounting/vouchers?unitId=1&dateFrom=2026-10-01&dateTo=2026-10-31");
  const vs = list.vouchers || [];
  const cash = vs.find((v) => v.date.startsWith("2026-10-08") && v.type === "C");
  const util = vs.find((v) => v.date.startsWith("2026-10-10") && v.type === "C");
  async function upload(v, files) {
    if (!v) return;
    const fd = new FormData();
    for (const [buf, name, type] of files) fd.append("files", new Blob([buf], { type }), name);
    const r = await fetch(`${BASE}/api/accounting/vouchers/${v.id}/attachments`, { method: "POST", headers: { Cookie: H.Cookie }, body: fd });
    if (!r.ok) console.log("FAIL upload", v.voucherNo, r.status, await r.text());
  }
  await upload(cash, [
    [await receiptPng({ shop: "○○마트 (가상)", date: "2026-10-08 14:32", items: [["화장지 30롤", 18000], ["세제 3L", 15000]], total: 33000 }), "마트영수증.png", "image/png"],
    [await receiptPng({ shop: "○○공영주차장 (가상)", date: "2026-10-08 16:05", items: [["주차 2시간", 13000]], total: 13000 }), "주차영수증.png", "image/png"],
  ]);
  await upload(util, [
    [samplePdf("Electric bill 2026-10 (sample)"), "10월 전기요금 고지서.pdf", "application/pdf"],
    [await receiptPng({ shop: "상수도사업본부 (가상)", date: "2026-10-10", items: [["10월 수도요금", 81000]], total: 81000 }), "수도요금.png", "image/png"],
  ]);
}
console.log("evidence seed done");
