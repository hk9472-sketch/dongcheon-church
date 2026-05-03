"use client";

import { useEffect, useState } from "react";

const OFFERING_KINDS: { key: string; label: string }[] = [
  { key: "tithe", label: "십일조" },
  { key: "sunday", label: "주일연보" },
  { key: "thanks", label: "감사연보" },
  { key: "special", label: "특별연보" },
  { key: "oil", label: "오일연보" },
  { key: "easter", label: "부활감사" },
  { key: "midyear", label: "맥추감사" },
  { key: "harvest", label: "추수감사" },
  { key: "christmas", label: "성탄감사" },
  { key: "sundaySchool", label: "주일학교" },
];

interface Account {
  id: number;
  code: string;
  name: string;
  unitId: number;
  unitName: string;
  unitCode: string;
}

export default function AccountMappingPanel() {
  const [mappings, setMappings] = useState<Record<string, number>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounting/offering/account-mapping");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setMappings(data.mappings || {});
      setAccounts(data.accounts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const update = async (offeringKey: string, accountId: number | null) => {
    setSavingKey(offeringKey);
    setError(null);
    try {
      const res = await fetch("/api/accounting/offering/account-mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offeringKey, accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      if (accountId === null) {
        setMappings((prev) => {
          const next = { ...prev };
          delete next[offeringKey];
          return next;
        });
      } else {
        setMappings((prev) => ({ ...prev, [offeringKey]: accountId }));
      }
      setSavedKey(offeringKey);
      setTimeout(() => setSavedKey((k) => (k === offeringKey ? null : k)), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSavingKey(null);
    }
  };

  // 회계단위별로 그룹핑된 옵션
  const accountsByUnit: Record<string, Account[]> = {};
  for (const a of accounts) {
    const k = a.unitName;
    if (!accountsByUnit[k]) accountsByUnit[k] = [];
    accountsByUnit[k].push(a);
  }
  const unitNames = Object.keys(accountsByUnit);

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">
        연보종류별로 매칭할 수입(D) 계정과목을 선택하세요. 매핑된 계정의 회계단위로 전표가
        반영됩니다. 같은 계정과목을 여러 종류가 공유 가능합니다.
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">불러오는 중...</div>
      ) : accounts.length === 0 ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          등록된 수입(D) 계정과목이 없습니다. 먼저 회계 → 계정과목 메뉴에서 추가하세요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-32">연보종류</th>
                <th className="px-3 py-2 text-left font-medium">계정과목 (회계단위)</th>
                <th className="px-3 py-2 w-16 text-center font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {OFFERING_KINDS.map((k) => {
                const currentId = mappings[k.key] ?? 0;
                const isSaving = savingKey === k.key;
                const isSaved = savedKey === k.key;
                return (
                  <tr key={k.key} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium text-gray-700">{k.label}</td>
                    <td className="px-3 py-2">
                      <select
                        value={currentId}
                        onChange={(e) =>
                          update(
                            k.key,
                            e.target.value === "0" ? null : parseInt(e.target.value, 10),
                          )
                        }
                        disabled={isSaving}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 disabled:opacity-50"
                      >
                        <option value="0">— 매핑 안 됨 —</option>
                        {unitNames.map((unit) => (
                          <optgroup key={unit} label={unit}>
                            {accountsByUnit[unit].map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.code} {a.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {isSaving && <span className="text-gray-500">...</span>}
                      {isSaved && <span className="text-green-600">✓</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
