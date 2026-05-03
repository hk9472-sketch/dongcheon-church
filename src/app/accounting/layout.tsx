"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReauthForm from "@/components/ReauthForm";

export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasLedger, setHasLedger] = useState(false);
  const [hasOffering, setHasOffering] = useState(false);
  const [hasMemberEdit, setHasMemberEdit] = useState(false);
  const [reauthed, setReauthed] = useState(false);
  const [reauthChecked, setReauthChecked] = useState(false);

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
      .then((r) => r.json())
      .then((d) => {
        const u = d.user;
        if (!u) {
          router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }

        const admin = u.isAdmin <= 2;
        const ledger = admin || u.accLedgerAccess || u.accountAccess;
        const offering = admin || u.accOfferingAccess || u.accountAccess;
        const memberEdit = admin || u.accMemberEditAccess;

        if (!ledger && !offering) {
          router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }

        // 경로별 접근 제어
        const isLedgerPath = pathname.startsWith("/accounting/entry") ||
          pathname.startsWith("/accounting/vouchers") ||
          pathname.startsWith("/accounting/report") ||
          pathname.startsWith("/accounting/settlement") ||
          pathname.startsWith("/accounting/closing") ||
          pathname.startsWith("/accounting/settings");
        const isOfferingPath = pathname.startsWith("/accounting/offering");

        if (isLedgerPath && !ledger) { router.replace("/accounting/offering/entry"); return; }
        if (isOfferingPath && !offering) { router.replace("/accounting/entry"); return; }

        setAuthorized(true);
        setIsAdmin(admin);
        setHasLedger(ledger);
        setHasOffering(offering);
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
      .catch(() => router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`))
      .finally(() => setLoading(false));
  }, [router, pathname]);

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
    { href: "/accounting/settlement", label: "결산현황" },
    { href: "/accounting/closing", label: "마감" },
  ];

  const offeringItems = [
    { href: "/accounting/offering/members", label: "관리번호" },
    { href: "/accounting/offering/donor-info", label: "관리상세" },
    { href: "/accounting/offering/entry", label: "연보입력" },
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
    { href: "/accounting/dues/jeondo/by-period", label: "전도회 기간별 현황" },
    { href: "/accounting/dues/jeondo/by-member", label: "전도회 회원별 현황" },
    { href: "/accounting/dues/build/dues", label: "건축월정" },
    { href: "/accounting/dues/build/deposit", label: "건축입금" },
    { href: "/accounting/dues/build/by-period", label: "건축 기간별 현황" },
    { href: "/accounting/dues/build/by-member", label: "건축 회원별 현황" },
  ];

  const settingsItems = [
    { href: "/accounting/settings/accounts", label: "계정과목" },
    { href: "/accounting/settings/units", label: "회계단위" },
    { href: "/accounting/settings/balance", label: "이월잔액" },
  ];

  // 관리번호/기부자정보/소속증명서 메뉴는 memberEdit 권한이 있을 때만
  const visibleOfferingItems = hasMemberEdit
    ? offeringItems
    : offeringItems.filter(
        (i) =>
          i.href !== "/accounting/offering/members" &&
          i.href !== "/accounting/offering/donor-info" &&
          i.href !== "/accounting/offering/certificate"
      );

  const allMenuItems = [
    ...(hasLedger ? ledgerItems : []),
    ...(hasLedger && isAdmin ? settingsItems : []),
    ...(hasOffering ? visibleOfferingItems : []),
    ...(hasOffering ? duesItems : []),
  ];

  return (
    <div>
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
            {hasOffering && (
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
