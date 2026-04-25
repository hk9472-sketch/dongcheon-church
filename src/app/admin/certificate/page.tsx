"use client";

import { useEffect, useState } from "react";

interface CertInfo {
  host: string;
  port: number;
  configured: boolean;
  error?: string;
  subjectCN?: string | null;
  issuerCN?: string | null;
  issuerO?: string | null;
  altNames?: string[];
  validFrom?: string | null;
  validTo?: string | null;
  daysLeft?: number;
  status?: "ok" | "expiring" | "expired";
  fingerprint?: string | null;
  serialNumber?: string | null;
}

interface Target {
  host: string;
  port: number;
  label: string;
  description?: string;
}

const TARGETS: Target[] = [
  { host: "pkistdc.net", port: 443, label: "메인 사이트", description: "https://pkistdc.net" },
  { host: "www.pkistdc.net", port: 443, label: "www 도메인", description: "https://www.pkistdc.net" },
  { host: "pkistdc.net", port: 8080, label: "레거시 ZB (:8080)", description: "구 제로보드" },
];

function formatDate(iso?: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function statusBadge(s?: "ok" | "expiring" | "expired") {
  if (s === "ok")
    return <span className="px-2 py-0.5 text-xs font-bold text-green-700 bg-green-100 rounded">유효</span>;
  if (s === "expiring")
    return <span className="px-2 py-0.5 text-xs font-bold text-orange-700 bg-orange-100 rounded">곧 만료</span>;
  if (s === "expired")
    return <span className="px-2 py-0.5 text-xs font-bold text-red-700 bg-red-100 rounded">만료됨</span>;
  return <span className="px-2 py-0.5 text-xs font-bold text-gray-600 bg-gray-100 rounded">미설정</span>;
}

interface RenewResult {
  success: boolean;
  skipped?: boolean;
  message?: string;
  stdout?: string;
  stderr?: string;
  code?: number;
  error?: string;
}

export default function CertificateAdminPage() {
  const [results, setResults] = useState<(CertInfo & { label: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [renewing, setRenewing] = useState(false);
  const [renewResult, setRenewResult] = useState<RenewResult | null>(null);

  async function load() {
    setLoading(true);
    const out = await Promise.all(
      TARGETS.map(async (t) => {
        try {
          const res = await fetch(
            `/api/admin/certificate?host=${encodeURIComponent(t.host)}&port=${t.port}`,
            { cache: "no-store" }
          );
          const data = await res.json();
          return { ...data, host: t.host, port: t.port, label: t.label };
        } catch (e) {
          return {
            host: t.host,
            port: t.port,
            label: t.label,
            configured: false,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      })
    );
    setResults(out);
    setLoading(false);
  }

  async function handleRenew() {
    if (!confirm("인증서 갱신을 시도하시겠습니까?\n\nLet's Encrypt 의 '만료 30일 이내' 인증서만 실제 갱신됩니다.\n실행 시간 1~3분.")) {
      return;
    }
    setRenewing(true);
    setRenewResult(null);
    try {
      const res = await fetch("/api/admin/certificate/renew", { method: "POST" });
      const data = await res.json();
      setRenewResult(data);
      if (data.success) {
        // 카드 새로고침 (재발급된 만료일 즉시 반영)
        await load();
      }
    } catch (e) {
      setRenewResult({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRenewing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">SSL 인증서 상태</h1>
          <p className="text-sm text-gray-500 mt-1">
            각 도메인·포트의 TLS 인증서 정보를 실시간으로 조회합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "조회 중..." : "새로고침"}
        </button>
      </div>

      <div className="space-y-3">
        {results.map((r, i) => (
          <div
            key={i}
            className={`bg-white rounded-lg shadow-sm border overflow-hidden ${
              r.status === "expired"
                ? "border-red-300"
                : r.status === "expiring"
                ? "border-orange-300"
                : "border-gray-200"
            }`}
          >
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-gray-700">{r.label}</h2>
                <span className="text-xs text-gray-400 font-mono">
                  {r.host}:{r.port}
                </span>
              </div>
              {statusBadge(r.status)}
            </div>

            <div className="p-5">
              {r.configured ? (
                <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-gray-500 mb-0.5">발급자</dt>
                    <dd className="text-gray-800">{r.issuerO || r.issuerCN || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500 mb-0.5">도메인 (CN)</dt>
                    <dd className="text-gray-800 font-mono">{r.subjectCN || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500 mb-0.5">남은 기간</dt>
                    <dd
                      className={`font-bold ${
                        r.status === "expired"
                          ? "text-red-700"
                          : r.status === "expiring"
                          ? "text-orange-700"
                          : "text-green-700"
                      }`}
                    >
                      {typeof r.daysLeft === "number" ? `${r.daysLeft}일` : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500 mb-0.5">발급일</dt>
                    <dd className="text-gray-700 text-xs">{formatDate(r.validFrom)}</dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="text-xs text-gray-500 mb-0.5">만료일</dt>
                    <dd className="text-gray-700 text-xs">{formatDate(r.validTo)}</dd>
                  </div>
                  {r.altNames && r.altNames.length > 0 && (
                    <div className="md:col-span-3">
                      <dt className="text-xs text-gray-500 mb-0.5">대상 도메인 (SAN)</dt>
                      <dd className="text-gray-700 text-xs font-mono">{r.altNames.join(", ")}</dd>
                    </div>
                  )}
                  {r.fingerprint && (
                    <div className="md:col-span-3">
                      <dt className="text-xs text-gray-500 mb-0.5">SHA-256 지문</dt>
                      <dd className="text-gray-500 text-xs font-mono break-all">{r.fingerprint}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <div className="text-sm text-gray-600">
                  <p className="mb-1">
                    <span className="font-semibold">HTTPS 미설정</span> 또는 연결 실패
                  </p>
                  {r.error && (
                    <p className="text-xs text-red-600 font-mono">{r.error}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 인증서 수동 갱신 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">수동 갱신</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Let&apos;s Encrypt 인증서는 90일 유효이며 certbot 이 자동 갱신합니다.
            자동 갱신이 실패했거나 갱신 알림 메일을 받으셨을 때 아래 버튼으로 즉시 시도하세요.
            (만료 30일 이상 남으면 실제 갱신 없이 통과)
          </p>
        </div>
        <div className="p-5 space-y-3">
          <button
            type="button"
            onClick={handleRenew}
            disabled={renewing}
            className="px-5 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {renewing ? "갱신 중... (최대 3분)" : "🔄 인증서 갱신 시도"}
          </button>

          {/* 결과 패널 */}
          {renewResult && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                renewResult.success
                  ? renewResult.skipped
                    ? "bg-blue-50 border-blue-200"
                    : "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <div className="font-semibold mb-1">
                {renewResult.success
                  ? renewResult.skipped
                    ? "ℹ️ 갱신 불필요"
                    : "✅ 갱신 완료"
                  : "❌ 갱신 실패"}
              </div>
              {renewResult.message && (
                <div className="text-xs text-gray-700 mb-2">{renewResult.message}</div>
              )}
              {renewResult.error && (
                <div className="text-xs text-red-700 mb-2">{renewResult.error}</div>
              )}
              {(renewResult.stdout || renewResult.stderr) && (
                <pre className="text-[11px] text-gray-600 bg-white border border-gray-200 rounded p-2 mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all">
                  {renewResult.stdout}
                  {renewResult.stderr && (renewResult.stdout ? "\n---\n" : "") + renewResult.stderr}
                </pre>
              )}
              {!renewResult.success && (
                <div className="text-xs text-gray-600 mt-2 space-y-1">
                  <p className="font-semibold">실패 원인 점검:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>서버에 <code className="px-1 bg-white rounded">/usr/local/bin/dc-cert-renew</code> 스크립트가 있는지</li>
                    <li>sudoers 에 <code className="px-1 bg-white rounded">hk9472 ALL=(root) NOPASSWD: /usr/local/bin/dc-cert-renew</code> 있는지</li>
                    <li>위 출력에 <code>certbot</code> 관련 에러가 있는지</li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
