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
    { href: "/accounting/offering/entry", label: "연보입력" },
    { href: "/accounting/offering/list", label: "연보내역" },
    { href: "/accounting/offering/thanks", label: "감사연보현황" },
    { href: "/accounting/offering/summary", label: "연보집계" },
    { href: "/accounting/offering/receipt", label: "기부금영수증" },
  ];

  const settingsItems = [
    { href: "/accounting/settings/accounts", label: "계정과목" },
    { href: "/accounting/settings/units", label: "회계단위" },
    { href: "/accounting/settings/balance", label: "이월잔액" },
  ];

  // 관리번호 메뉴는 memberEdit 권한이 있을 때만
  const visibleOfferingItems = hasMemberEdit
    ? offeringItems
    : offeringItems.filter((i) => i.href !== "/accounting/offering/members");

  const allMenuItems = [
    ...(hasLedger ? ledgerItems : []),
    ...(hasLedger && isAdmin ? settingsItems : []),
    ...(hasOffering ? visibleOfferingItems : []),
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
            {/* 장부관리 (회계) */}
            {hasLedger && (
              <>
                <div className="px-4 py-3 bg-teal-700 text-white">
                  <h2 className="text-sm font-bold">장부관리</h2>
                </div>
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
              </>
            )}
            {/* 연보관리 */}
            {hasOffering && (
              <>
                <div className={`px-4 py-3 bg-indigo-700 text-white ${hasLedger ? "border-t border-gray-200" : ""}`}>
                  <h2 className="text-sm font-bold">연보관리</h2>
                </div>
                <nav className="py-1">
                  {visibleOfferingItems.map((item) => (
                    <Link key={item.href} href={item.href}
                      className={`block px-4 py-2.5 text-sm transition-colors ${
                        pathname === item.href ? "bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-700" : "text-gray-600 hover:bg-gray-50"
                      }`}>{item.label}</Link>
                  ))}
                </nav>
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
