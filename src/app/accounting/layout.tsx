"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import ReauthForm from "@/components/ReauthForm";

export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasLedger, setHasLedger] = useState(false);
  const [hasOffering, setHasOffering] = useState(false);
  const [hasDues, setHasDues] = useState(false);
  const [hasMemberEdit, setHasMemberEdit] = useState(false);
  const [reauthed, setReauthed] = useState(false);
  const [reauthChecked, setReauthChecked] = useState(false);
  // 작업 중 세션 만료 감지 — 화면을 떠나지 않고 안내만 띄워 입력 내용을 보존
  const [sessionLost, setSessionLost] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const authorizedRef = useRef(false);

  // 사이드바 섹션 접기/펼치기 상태 — localStorage 에 저장돼 새 페이지에서도 유지
  type SectionKey = "ledger" | "offering" | "dues";
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>(() => {
    if (typeof window === "undefined") return { ledger: false, offering: false, dues: false };
    try {
      const raw = localStorage.getItem("accountingSidebarCollapsed");
      if (raw) return { ledger: false, offering: false, dues: false, ...JSON.parse(raw) };
    } catch {}
    return { ledger: false, offering: false, dues: false };
  });
  const toggleSection = (k: SectionKey) => {
    setCollapsed((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try {
        localStorage.setItem("accountingSidebarCollapsed", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        // 503 = 서버 일시 오류 → 로그인 화면으로 보내지 않음 (아래 catch 에서 처리)
        if (!r.ok) throw new Error("transient");
        return r.json();
      })
      .then((d) => {
        const u = d.user;
        if (!u) {
          router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }

        const admin = u.isAdmin <= 2;
        const ledger = admin || u.accLedgerAccess || u.accountAccess;
        const offering = admin || u.accOfferingAccess || u.accountAccess;
        const dues = admin || u.accDuesAccess;
        const memberEdit = admin || u.accMemberEditAccess;

        if (!ledger && !offering && !dues) {
          router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }

        // 경로별 접근 제어
        const isLedgerPath = pathname.startsWith("/accounting/entry") ||
          pathname.startsWith("/accounting/vouchers") ||
          pathname.startsWith("/accounting/funds") ||
          pathname.startsWith("/accounting/report") ||
          pathname.startsWith("/accounting/settlement") ||
          pathname.startsWith("/accounting/closing") ||
          pathname.startsWith("/accounting/settings");
        const isOfferingPath = pathname.startsWith("/accounting/offering");
        const isDuesPath = pathname.startsWith("/accounting/dues");

        const firstAvailable = ledger
          ? "/accounting/entry"
          : offering
            ? "/accounting/offering/entry"
            : "/accounting/dues/jeondo/dues";
        if (isLedgerPath && !ledger) { router.replace(firstAvailable); return; }
        if (isOfferingPath && !offering) { router.replace(firstAvailable); return; }
        if (isDuesPath && !dues) { router.replace(firstAvailable); return; }

        setAuthorized(true);
        authorizedRef.current = true;
        setLoadError(false);
        setIsAdmin(admin);
        setHasLedger(ledger);
        setHasOffering(offering);
        setHasDues(dues);
        setHasMemberEdit(memberEdit);

        // admin 계정은 재인증 면제
        if (u.userId === "admin") {
          setReauthed(true);
          setReauthChecked(true);
        } else {
          fetch("/api/auth/reauth")
            .then((r) => r.json())
            .then((r) => {
              setReauthed(r.reauthed);
              setReauthChecked(true);
            })
            .catch(() => setReauthChecked(true));
        }
      })
      .catch(() => {
        // 이미 사용 중인 화면이면 그대로 둔다(메뉴 이동 중 일시 오류). 첫 진입이면 재시도 안내.
        if (!authorizedRef.current) setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, [router, pathname]);

  // 세션 확인 — 응답이 정상(200)인데 user 가 없을 때만 '만료'로 판단 (503 등은 보류)
  const lastPingRef = useRef(0);
  const pingSession = useCallback(async (force = false) => {
    if (!force && Date.now() - lastPingRef.current < 30_000) return;
    lastPingRef.current = Date.now();
    try {
      const r = await fetch("/api/auth/me");
      if (!r.ok) return;
      const d = await r.json();
      if (d.user) setSessionLost(false);
      else if (authorizedRef.current) setSessionLost(true);
    } catch {
      /* 네트워크 오류는 무시 */
    }
  }, []);

  // 세션 heartbeat — 회계 화면을 열어둔 채 오래 입력해도 세션이 끊기지 않게
  // 10분마다 + 탭 복귀/포커스 시 /api/auth/me 호출(서버가 sliding 으로 세션·쿠키 연장).
  // 절전·다른 사이트 이용 후 돌아오면 타이머가 멈춰 있었을 수 있으므로 복귀 즉시 한 번 확인.
  useEffect(() => {
    const t = setInterval(() => pingSession(true), 10 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") pingSession();
    };
    const onFocus = () => pingSession();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [pingSession]);

  // 행정 화면의 모든 API 호출에서 401(세션 만료) 감지 → 안내 창. 페이지 상태는 그대로 유지되므로
  // 새 창에서 로그인한 뒤 같은 화면에서 [저장]을 다시 누르면 된다.
  useEffect(() => {
    const orig = window.fetch;
    const wrapped: typeof window.fetch = async (input, init) => {
      const res = await orig(input, init);
      try {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
        const path = new URL(url, window.location.origin);
        if (
          res.status === 401 &&
          path.origin === window.location.origin &&
          path.pathname.startsWith("/api/") &&
          !path.pathname.startsWith("/api/auth/")
        ) {
          setSessionLost(true);
        }
      } catch {
        /* URL 해석 실패는 무시 */
      }
      return res;
    };
    window.fetch = wrapped;
    // 새 창 로그인 완료 알림 (/auth/login-done 이 opener 로 postMessage)
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "dc-login-done") pingSession(true);
    };
    window.addEventListener("message", onMsg);
    return () => {
      if (window.fetch === wrapped) window.fetch = orig;
      window.removeEventListener("message", onMsg);
    };
  }, [pingSession]);

  const sessionModal = sessionLost && (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 print:hidden">
      <div className="w-full max-w-sm rounded-lg bg-white shadow-xl p-5 space-y-3">
        <h2 className="text-base font-bold text-gray-900">로그인이 만료되었습니다</h2>
        <p className="text-sm text-gray-600">
          입력하던 내용은 <strong>이 화면에 그대로 남아 있습니다.</strong> 새 창에서 로그인한 뒤 이 창으로
          돌아와 <strong>[로그인 확인]</strong>을 누르고, 저장을 다시 하세요.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              window.open(
                `/auth/login?redirect=${encodeURIComponent("/auth/login-done")}`,
                "dcLogin",
                "width=480,height=680",
              )
            }
            className="flex-1 rounded bg-teal-600 px-3 py-2 text-sm text-white hover:bg-teal-700"
          >
            새 창에서 로그인
          </button>
          <button
            type="button"
            onClick={() => pingSession(true)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            로그인 확인
          </button>
        </div>
        <button
          type="button"
          onClick={() => setSessionLost(false)}
          className="w-full text-xs text-gray-400 hover:text-gray-600"
        >
          닫기 (저장은 로그인 후에만 됩니다)
        </button>
      </div>
    </div>
  );

  if (loadError && !authorized) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-gray-500">
        서버 응답이 지연되고 있습니다.
        <button
          onClick={() => window.location.reload()}
          className="rounded bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (loading || !reauthChecked) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        권한 확인 중...
      </div>
    );
  }

  if (!authorized) return null;

  // 재인증 필요
  if (!reauthed) {
    return <ReauthForm onSuccess={() => setReauthed(true)} />;
  }

  const ledgerItems = [
    { href: "/accounting/entry", label: "전표입력" },
    { href: "/accounting/vouchers", label: "전표현황" },
    { href: "/accounting/report/monthly", label: "월별 수입지출" },
    { href: "/accounting/report/account", label: "계정별 현황" },
    { href: "/accounting/report/daily", label: "일자별 현황" },
    { href: "/accounting/funds", label: "통장현황·이체" },
    { href: "/accounting/settlement", label: "결산현황" },
    { href: "/accounting/report/annual", label: "연간 결산서" },
    { href: "/accounting/closing", label: "마감" },
  ];

  const offeringItems = [
    { href: "/accounting/offering/members", label: "관리번호" },
    { href: "/accounting/offering/member-numbers", label: "관리번호 변경" },
    { href: "/accounting/offering/donor-info", label: "관리상세" },
    { href: "/accounting/offering/entry", label: "연보입력" },
    { href: "/accounting/offering/multi-entry", label: "연보통합입력" },
    { href: "/accounting/offering/by-type", label: "연보별입력" },
    { href: "/accounting/offering/edit", label: "연보일괄수정" },
    { href: "/accounting/offering/settlement", label: "일별결산" },
    { href: "/accounting/offering/list", label: "연보내역" },
    { href: "/accounting/offering/thanks", label: "감사연보현황" },
    { href: "/accounting/offering/summary", label: "연보집계" },
    { href: "/accounting/offering/receipt", label: "기부금영수증" },
    { href: "/accounting/offering/certificate", label: "소속증명서" },
  ];

  const duesItems = [
    { href: "/accounting/dues/jeondo/dues", label: "전도회월정" },
    { href: "/accounting/dues/jeondo/deposit", label: "전도회입금" },
    { href: "/accounting/dues/jeondo/deposit-matrix", label: "전도회입금(일괄)" },
    { href: "/accounting/dues/jeondo/by-period", label: "전도회 기간별 현황" },
    { href: "/accounting/dues/jeondo/by-member", label: "전도회 회원별 현황" },
    { href: "/accounting/dues/build/dues", label: "건축월정" },
    { href: "/accounting/dues/build/deposit", label: "건축입금" },
    { href: "/accounting/dues/build/deposit-matrix", label: "건축입금(일괄)" },
    { href: "/accounting/dues/build/by-period", label: "건축 기간별 현황" },
    { href: "/accounting/dues/build/by-member", label: "건축 회원별 현황" },
  ];

  const settingsItems = [
    { href: "/accounting/settings/accounts", label: "계정과목" },
    { href: "/accounting/settings/account-mapping", label: "계정과목 매핑" },
    { href: "/accounting/settings/units", label: "회계단위" },
    { href: "/accounting/settings/funds", label: "통장관리" },
    { href: "/accounting/settings/balance", label: "이월잔액" },
    { href: "/accounting/settings/journal-import", label: "분개장 가져오기" },
  ];

  // 관리번호/기부자정보/소속증명서 메뉴는 memberEdit 권한이 있을 때만
  const visibleOfferingItems = hasMemberEdit
    ? offeringItems
    : offeringItems.filter(
        (i) =>
          i.href !== "/accounting/offering/members" &&
          i.href !== "/accounting/offering/member-numbers" &&
          i.href !== "/accounting/offering/donor-info" &&
          i.href !== "/accounting/offering/certificate"
      );

  const allMenuItems = [
    ...(hasLedger ? ledgerItems : []),
    ...(hasLedger && isAdmin ? settingsItems : []),
    ...(hasOffering ? visibleOfferingItems : []),
    ...(hasDues ? duesItems : []),
  ];

  return (
    <div>
      {sessionModal}
      {/* 모바일 탭 (인쇄 시 숨김) */}
      <div className="lg:hidden print:hidden mb-4">
        <div className="flex overflow-x-auto gap-1 pb-2 border-b border-gray-200">
          {allMenuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 text-xs whitespace-nowrap rounded-lg transition-colors ${
                pathname === item.href
                  ? "bg-teal-700 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex gap-6 min-h-[calc(100vh-200px)]">
        {/* 사이드바 - 데스크톱 (인쇄 시 숨김) */}
        <aside className="w-48 shrink-0 hidden lg:block print:hidden">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden sticky top-24">
            {/* 행정실 (회계) */}
            {hasLedger && (
              <>
                <button
                  type="button"
                  onClick={() => toggleSection("ledger")}
                  className="w-full px-4 py-3 bg-teal-700 text-white flex items-center justify-between hover:bg-teal-800 transition-colors"
                >
                  <h2 className="text-sm font-bold">행정실</h2>
                  <span className="text-xs">{collapsed.ledger ? "▶" : "▼"}</span>
                </button>
                {!collapsed.ledger && (
                <nav className="py-1">
                  {ledgerItems.map((item) => (
                    <Link key={item.href} href={item.href}
                      className={`block px-4 py-2.5 text-sm transition-colors ${
                        pathname === item.href ? "bg-teal-50 text-teal-700 font-medium border-r-2 border-teal-700" : "text-gray-600 hover:bg-gray-50"
                      }`}>{item.label}</Link>
                  ))}
                  {isAdmin && (
                    <>
                      <div className="border-t border-gray-200 my-1" />
                      <div className="px-4 py-1.5 text-[11px] text-gray-400 font-bold tracking-wider">설정</div>
                      {settingsItems.map((item) => (
                        <Link key={item.href} href={item.href}
                          className={`block px-4 py-2.5 text-sm transition-colors ${
                            pathname === item.href ? "bg-teal-50 text-teal-700 font-medium border-r-2 border-teal-700" : "text-gray-600 hover:bg-gray-50"
                          }`}>{item.label}</Link>
                      ))}
                    </>
                  )}
                </nav>
                )}
              </>
            )}
            {/* 연보관리 */}
            {hasOffering && (
              <>
                <button
                  type="button"
                  onClick={() => toggleSection("offering")}
                  className={`w-full px-4 py-3 bg-indigo-700 text-white flex items-center justify-between hover:bg-indigo-800 transition-colors ${hasLedger ? "border-t border-gray-200" : ""}`}
                >
                  <h2 className="text-sm font-bold">연보관리</h2>
                  <span className="text-xs">{collapsed.offering ? "▶" : "▼"}</span>
                </button>
                {!collapsed.offering && (
                <nav className="py-1">
                  {visibleOfferingItems.map((item) => (
                    <Link key={item.href} href={item.href}
                      className={`block px-4 py-2.5 text-sm transition-colors ${
                        pathname === item.href ? "bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-700" : "text-gray-600 hover:bg-gray-50"
                      }`}>{item.label}</Link>
                  ))}
                </nav>
                )}
              </>
            )}
            {/* 월정관리 */}
            {hasDues && (
              <>
                <button
                  type="button"
                  onClick={() => toggleSection("dues")}
                  className="w-full px-4 py-3 bg-fuchsia-700 text-white flex items-center justify-between hover:bg-fuchsia-800 transition-colors border-t border-gray-200"
                >
                  <h2 className="text-sm font-bold">월정관리</h2>
                  <span className="text-xs">{collapsed.dues ? "▶" : "▼"}</span>
                </button>
                {!collapsed.dues && (
                  <nav className="py-1">
                    <div className="px-4 py-1.5 text-[11px] text-gray-400 font-bold tracking-wider">전도회</div>
                    {duesItems.filter((i) => i.href.includes("/jeondo/")).map((item) => (
                      <Link key={item.href} href={item.href}
                        className={`block px-4 py-2.5 text-sm transition-colors ${
                          pathname === item.href ? "bg-fuchsia-50 text-fuchsia-700 font-medium border-r-2 border-fuchsia-700" : "text-gray-600 hover:bg-gray-50"
                        }`}>{item.label}</Link>
                    ))}
                    <div className="border-t border-gray-200 my-1" />
                    <div className="px-4 py-1.5 text-[11px] text-gray-400 font-bold tracking-wider">건축</div>
                    {duesItems.filter((i) => i.href.includes("/build/")).map((item) => (
                      <Link key={item.href} href={item.href}
                        className={`block px-4 py-2.5 text-sm transition-colors ${
                          pathname === item.href ? "bg-fuchsia-50 text-fuchsia-700 font-medium border-r-2 border-fuchsia-700" : "text-gray-600 hover:bg-gray-50"
                        }`}>{item.label}</Link>
                    ))}
                  </nav>
                )}
              </>
            )}
          </div>
        </aside>

        {/* 콘텐츠 */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
