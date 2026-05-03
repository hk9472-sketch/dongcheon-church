"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface Settlement {
  date: string;
  amtTithe: number;
  amtSunday: number;
  amtThanks: number;
  amtSpecial: number;
  amtOil: number;
  amtSeason: number;
  amtSundaySchool: number;
  envelopeCount: number;
  diffAmount: number;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function SettlementPrintPage() {
  const sp = useSearchParams();
  const date = sp.get("date") || "";
  const [data, setData] = useState<Settlement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) return;
    fetch(`/api/accounting/offering/settlement?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.mode === "saved") {
          setData(d.settlement);
        } else if (d.mode === "new") {
          // 저장 전이라도 카테고리 합계는 표시 (envelopeCount/sundaySchool 은 0)
          setData({
            date,
            ...d.categories,
            amtSundaySchool: 0,
            envelopeCount: 0,
            diffAmount: 0,
          });
        }
      })
      .catch(() => setError("조회 실패"));
  }, [date]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!data) return <div className="p-8 text-gray-500">불러오는 중...</div>;

  const generalSum = data.amtSunday + data.amtThanks + data.amtSpecial + data.amtOil + data.amtSeason;
  const subtotal = data.amtTithe + generalSum; // 계 (장년반계)
  // 합계 = 계 + 주일학교 (+ 향후 건축연보·전도회비·기타수입 — 현재는 미관리)
  const grandTotal = subtotal + data.amtSundaySchool;

  // 날짜 파싱 — YYYY-MM-DD → YYYY.M.D
  let dateDisplay = date;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (m) dateDisplay = `${m[1]}.${parseInt(m[2], 10)}.${parseInt(m[3], 10)}.`;

  // 증명번호는 비워둠 — 나중에 수입전표로 이관할 때 발생할 번호이므로 지금 쓰지 않음.

  return (
    <div className="p-8 print:p-4 max-w-3xl mx-auto bg-white">
      <style jsx global>{`
        /* 사이트 헤더/푸터 + 회계 사이드바 숨김 — 인쇄 페이지는 깨끗한 양식만 보여줌
           (스크린/인쇄 모두). aside.print:hidden 은 회계 layout 의 사이드바. */
        body > header,
        body > footer {
          display: none !important;
        }
        body > main {
          max-width: none !important;
          padding: 0 !important;
        }
        body > main aside {
          display: none !important;
        }
        body > main > div > div:first-child.lg\\:hidden {
          display: none !important;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          .no-print {
            display: none !important;
          }
        }
        .receipt-table {
          border-collapse: collapse;
          width: 100%;
          font-family: "맑은 고딕", "Malgun Gothic", sans-serif;
        }
        .receipt-table th,
        .receipt-table td {
          border: 1px solid #000;
          padding: 8px 12px;
          font-size: 15px;
        }
        .receipt-table th {
          background: #f5f5f5;
          font-weight: 600;
        }
        .receipt-table .amt {
          text-align: right;
          font-family: "Courier New", monospace;
          font-size: 16px;
          font-weight: 500;
        }
      `}</style>

      <div className="no-print mb-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          인쇄
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
        >
          닫기
        </button>
      </div>

      {/* 제목 + 회계 결재란 */}
      <div className="flex items-end justify-between mb-6">
        <div className="flex-1 text-center">
          <h1 className="text-3xl font-bold tracking-[0.5em] inline-block">수 입 내 역 서</h1>
        </div>
        <table className="receipt-table" style={{ width: "auto" }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ writingMode: "vertical-rl", padding: "12px 4px" }}>
                확인
              </th>
              <th style={{ minWidth: 50 }}>회계1</th>
              <th style={{ minWidth: 50 }}>회계2</th>
              <th style={{ minWidth: 50 }}>회계3</th>
            </tr>
            <tr>
              <td style={{ height: 40 }}></td>
              <td></td>
              <td></td>
            </tr>
          </thead>
        </table>
      </div>

      {/* 증명번호 + 날짜 */}
      <table className="receipt-table mb-0">
        <tbody>
          <tr>
            <th style={{ width: "20%" }}>증명번호</th>
            <td style={{ width: "30%" }}></td>
            <th style={{ width: "15%" }}>날짜</th>
            <td>{dateDisplay}</td>
          </tr>
        </tbody>
      </table>

      {/* 내역 */}
      <table className="receipt-table">
        <thead>
          <tr>
            <th colSpan={2}>내 역</th>
            <th style={{ width: "30%" }}>금 액</th>
            <th style={{ width: "20%" }}>비 고</th>
          </tr>
          <tr>
            <th colSpan={2}>계 정</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={2} className="text-center">십일조</td>
            <td className="amt">{data.amtTithe > 0 ? fmt(data.amtTithe) : ""}</td>
            <td></td>
          </tr>
          <tr>
            <td rowSpan={5} className="text-center" style={{ width: "12%" }}>
              일반<br />회계
            </td>
            <td className="text-center">주일</td>
            <td className="amt">{data.amtSunday > 0 ? fmt(data.amtSunday) : ""}</td>
            <td></td>
          </tr>
          <tr>
            <td className="text-center">감사</td>
            <td className="amt">{data.amtThanks > 0 ? fmt(data.amtThanks) : ""}</td>
            <td></td>
          </tr>
          <tr>
            <td className="text-center">특별</td>
            <td className="amt">{data.amtSpecial > 0 ? fmt(data.amtSpecial) : ""}</td>
            <td></td>
          </tr>
          <tr>
            <td className="text-center">오일</td>
            <td className="amt">{data.amtOil > 0 ? fmt(data.amtOil) : ""}</td>
            <td></td>
          </tr>
          <tr>
            <td className="text-center">절기</td>
            <td className="amt">{data.amtSeason > 0 ? fmt(data.amtSeason) : ""}</td>
            <td></td>
          </tr>
          <tr>
            <td colSpan={2} className="text-center font-semibold">
              계 (봉투수)
            </td>
            <td className="amt font-semibold">
              {fmt(subtotal)}
              {data.envelopeCount > 0 && (
                <span className="ml-1 text-sm">({fmt(data.envelopeCount)})매</span>
              )}
            </td>
            <td></td>
          </tr>
          <tr>
            <td colSpan={2} className="text-center">건축연보</td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td colSpan={2} className="text-center">전도회비</td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td colSpan={2} className="text-center">주일학교</td>
            <td className="amt">{data.amtSundaySchool > 0 ? fmt(data.amtSundaySchool) : ""}</td>
            <td></td>
          </tr>
          <tr>
            <td colSpan={2} className="text-center">기타수입</td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td colSpan={2} className="text-center font-bold">합 계</td>
            <td className="amt font-bold">{fmt(grandTotal)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <div className="mt-12 text-sm">
        <p>상기 수입 내역을 제출합니다.</p>
        <div className="flex justify-end mt-6 gap-8">
          <span>{m ? `${m[1]}년 ${parseInt(m[2], 10)}월 ${parseInt(m[3], 10)}일` : ""}</span>
        </div>
        <div className="flex justify-end mt-2 gap-2">
          <span>제출자 :</span>
          <span style={{ minWidth: 100, borderBottom: "1px solid #000" }}>&nbsp;</span>
          <span>(인)</span>
        </div>
        <p className="text-center mt-8 font-semibold">예수교 장로회 한국총공회 동천교회</p>
      </div>
    </div>
  );
}
