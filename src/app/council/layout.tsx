"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReauthForm from "@/components/ReauthForm";

export default function CouncilLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reauthed, setReauthed] = useState(false);
  const [reauthChecked, setReauthChecked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user && (d.user.councilAccess || d.user.isAdmin <= 2)) {
          setAuthorized(true);
          setIsAdmin(d.user.isAdmin <= 2);

          // admin 계정은 재인증 면제
          if (d.user.userId === "admin") {
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
        } else {
          router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
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

  const menuItems = [
    { href: "/council/report-entry", label: "권찰보고서" },
    { href: "/council/overall", label: "전체출석보고" },
    { href: "/council/report", label: "보고서 조회" },
    { href: "/council/summary", label: "보고서 집계" },
    { href: "/council/live", label: "실시간참여" },
    { href: "/council/reading", label: "재독듣기" },
  ];

  return (
    <div>
      {/* 모바일 탭 (인쇄 시 숨김) */}
      <div className="lg:hidden print:hidden mb-4">
        <div className="flex overflow-x-auto gap-1 pb-2 border-b border-gray-200">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 text-xs whitespace-nowrap rounded-lg transition-colors ${
                pathname === item.href ? "bg-indigo-700 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/council/manage"
              className={`px-3 py-2 text-xs whitespace-nowrap rounded-lg transition-colors ${
                pathname === "/council/manage" ? "bg-indigo-700 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              관리
            </Link>
          )}
        </div>
      </div>

      <div className="flex gap-6 min-h-[calc(100vh-200px)]">
        {/* 사이드바 - 데스크톱 (인쇄 시 숨김) */}
        <aside className="w-48 shrink-0 hidden lg:block print:hidden">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden sticky top-24">
            <div className="px-4 py-3 bg-indigo-800 text-white">
              <h2 className="text-sm font-bold">권찰회</h2>
            </div>
            <nav className="py-1">
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-2.5 text-sm transition-colors ${
                    pathname === item.href
                      ? "bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-700"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              {isAdmin && (
                <>
                  <div className="border-t border-gray-200 my-1" />
                  <Link
                    href="/council/manage"
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                      pathname === "/council/manage"
                        ? "bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-700"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>관리</span>
                  </Link>
                </>
              )}
            </nav>
          </div>
        </aside>

        {/* 콘텐츠 (한 번만 렌더링) */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
