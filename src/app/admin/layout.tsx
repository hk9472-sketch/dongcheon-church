"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReauthForm from "@/components/ReauthForm";

const ADMIN_MENU: { label: string; href: string; icon: string; external?: boolean }[] = [
  { label: "대시보드", href: "/admin", icon: "📊" },
  { label: "게시판 관리", href: "/admin/boards", icon: "📋" },
  { label: "게시판 생성", href: "/admin/boards/create", icon: "➕" },
  { label: "스킨 관리", href: "/admin/skins", icon: "🎨" },
  { label: "사이트 설정", href: "/admin/settings", icon: "🖌️" },
  { label: "회원 관리", href: "/admin/members", icon: "👥" },
  { label: "DB 관리", href: "/admin/db", icon: "🗄️" },
  { label: "SQL 관리", href: "/admin/db/sql", icon: "💾" },
  { label: "도움말 관리", href: "/admin/help", icon: "❓" },
  { label: "백업", href: "/admin/backup", icon: "📦" },
  { label: "SSL 인증서", href: "/admin/certificate", icon: "🔐" },
  { label: "Google Cloud", href: "https://console.cloud.google.com/compute/instances?hl=ko&project=project-d273e626-5a30-41ff-b5f", icon: "☁️", external: true },
  { label: "레거시 (제로보드)", href: "http://35.212.199.48:8080/", icon: "🗄️", external: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reauthed, setReauthed] = useState(false);
  const [reauthChecked, setReauthChecked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user && d.user.isAdmin <= 2) {
          setAuthorized(true);

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

  return (
    <div>
      {/* 모바일 탭 (인쇄 시 숨김) */}
      <div className="lg:hidden print:hidden mb-4">
        <div className="flex overflow-x-auto gap-1 pb-2 border-b border-gray-200">
          {ADMIN_MENU.map((item) => {
            const active = !item.external && pathname === item.href;
            if (item.external) {
              return (
                <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-2 text-xs whitespace-nowrap rounded-lg bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                  <span>{item.icon}</span><span>{item.label}</span>
                </a>
              );
            }
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-1 px-3 py-2 text-xs whitespace-nowrap rounded-lg transition-colors ${
                  active ? "bg-blue-700 text-white" : "bg-gray-100 text-gray-600"
                }`}>
                <span>{item.icon}</span><span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex gap-6 min-h-[calc(100vh-200px)]">
        {/* 사이드바 (인쇄 시 숨김) */}
        <aside className="w-52 shrink-0 hidden lg:block print:hidden">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden sticky top-24">
            <div className="px-4 py-3 bg-gray-800 text-white">
              <h2 className="text-sm font-bold">관리자 메뉴</h2>
            </div>
            <nav className="py-1">
              {ADMIN_MENU.map((item) => {
                const active = !item.external && pathname === item.href;
                if (item.external) {
                  return (
                    <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                      <span>{item.icon}</span><span>{item.label}</span>
                      <svg className="w-3 h-3 ml-auto text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  );
                }
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-700"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}>
                    <span>{item.icon}</span><span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* 콘텐츠 (한 번만 렌더링) */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
