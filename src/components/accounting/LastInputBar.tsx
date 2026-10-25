"use client";

import { useEffect, useState } from "react";
import { fmtStamp } from "./AuditStamp";

/**
 * 집계 화면용 — 조회 범위의 최종 입력 일시·입력자 + 입력자별 건수 한 줄 표시.
 * scope: ledger(전표) / offering(연보) / dues(월정 입금)
 */
interface Props {
  scope: "ledger" | "offering" | "dues";
  dateFrom?: string;
  dateTo?: string;
  unitId?: string | number | null;
  category?: string;
  className?: string;
}

interface Summary {
  count: number;
  last: { at: string; by: string } | null;
  inputters: { name: string; count: number }[];
}

export default function LastInputBar({ scope, dateFrom, dateTo, unitId, category, className = "" }: Props) {
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ scope });
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);
    if (unitId) qs.set("unitId", String(unitId));
    if (category) qs.set("category", category);
    let alive = true;
    fetch(`/api/accounting/last-input?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [scope, dateFrom, dateTo, unitId, category]);

  if (!data) return null;
  return (
    <div className={`text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1 ${className}`}>
      <span>
        최종입력{" "}
        {data.last ? (
          <strong className="text-gray-700">
            {fmtStamp(data.last.at)} · {data.last.by}
          </strong>
        ) : (
          "-"
        )}
      </span>
      {data.inputters.length > 0 && (
        <span>
          입력자 {data.inputters.map((i) => `${i.name}(${i.count.toLocaleString()}건)`).join(", ")}
        </span>
      )}
    </div>
  );
}
