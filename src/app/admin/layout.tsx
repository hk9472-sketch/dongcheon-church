"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReauthForm from "@/components/ReauthForm";

// ─── 메뉴 정의 ─────────────────────────────────────────────
type Item = { label: string; href: string; icon: string; external?: boolean };

const ROOT_ITEMS: Item[] = [{ label: "대시보드", href: "/admin", icon: "📊" }];

const ADMIN_GROUPS: { key: string; label: string; items: Item[] }[] = [
  {
    key: "content",
    label: "콘텐츠 운영",
    items: [
      { label: "게시판 관리", href: "/admin/boards", icon: "📋" },
      { label: "게시판 생성", href: "/admin/boards/create", icon: "➕" },
      { label: "게시글 이동", href: "/admin/posts/bulk-move", icon: "🔀" },
      { label: "헤드넘 재정렬", href: "/admin/boards/reorder", icon: "🔢" },
      { label: "해상도 미리보기", href: "/admin/preview", icon: "🖥️" },
    ],
  },
  {
    key: "members",
    label: "회원·문서",
    items: [
      { label: "회원 관리", href: "/admin/members", icon: "👥" },
      { label: "도움말 관리", href: "/admin/help", icon: "❓" },
      { label: "법적 문서", href: "/admin/legal", icon: "📜" },
    ],
  },
  {
    key: "monitor",
    label: "모니터링",
    items: [
      { label: "방문 로그", href: "/admin/visit-logs", icon: "📑" },
    ],
  },
  {
    key: "settings",
    label: "사이트 설정",
    items: [
      { label: "사이트 설정", href: "/admin/settings", icon: "🎨" },
      { label: "PUA 매핑", href: "/admin/pua-map", icon: "🔤" },
    ],
  },
  {
    key: "system",
    label: "시스템·데이터",
    items: [
      { label: "SQL 관리", href: "/admin/db/sql", icon: "💾" },
      { label: "작업 백업/복원", href: "/admin/backup/operations", icon: "♻️" },
      { label: "백업", href: "/admin/backup", icon: "📦" },
      { label: "SSL 인증서", href: "/admin/certificate", icon: "🔐" },
    ],
  },
  {
    key: "external",
    label: "외부 도구",
    items: [
      {
        label: "Google Cloud",
        href: "https://console.cloud.google.com/compute/instances?hl=ko&project=project-d273e626-5a30-41ff-b5f",
        icon: "☁️",
        external: true,
      },
      {
        label: "이전홈페이지",
        href: "http://35.212.199.48:8080/",
        icon: "🗄️",
        external: true,
      },
    ],
  },
];

// 자주 안 쓰는 그룹은 default 접힘 — 사이드바 길이 절약
const DEFAULT_COLLAPSED_KEYS = new Set(["system", "external"]);

// 모바일 탭용 flat 메뉴
const FLAT_MENU: Item[] = [
  ...ROOT_ITEMS,
  ...ADMIN_GROUPS.flatMap((g) => g.items),
];

const GROUPS_STATE_KEY = "adminGroupsCollapsed";

function loadGroupCollapsed(): Record<string, boolean> {
  const fallback: Record<string, boolean> = {};
  for (const g of ADMIN_GROUPS) {
    fallback[g.key] = DEFAULT_COLLAPSED_KEYS.has(g.key);
  }
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(GROUPS_STATE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    // 미정의 그룹은 default 적용
    for (const g of ADMIN_GROUPS) {
      if (typeof parsed[g.key] !== "boolean") parsed[g.key] = fallback[g.key];
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reauthed, setReauthed] = useState(false);
  const [reauthChecked, setReauthChecked] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("adminSidebarCollapsed") === "1";
    } catch {
      return false;
    }
  });
  const [groupCollapsed, setGroupCollapsed] = useState<Record<string, boolean>>(loadGroupCollapsed);

  const toggleCollapse = () => {
    setCollapsed((p) => {
      const next = !p;
      try {
        localStorage.setItem("adminSidebarCollapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  const toggleGroup = (key: string) => {
    setGroupCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(GROUPS_STATE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user && d.user.isAdmin <= 2) {
          setAuthorized(true);

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
  if (!reauthed) {
    return <ReauthForm onSuccess={() => setReauthed(true)} />;
  }

  // 메뉴 아이템 렌더 (사이드바 공용)
  const renderItem = (item: Item) => {
    const active = !item.external && pathname === item.href;
    if (item.external) {
      return (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
          <svg className="w-3 h-3 ml-auto text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
          active
            ? "bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-700"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`}
      >
        <span>{item.icon}</span>
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <div>
      {/* 모바일 탭 — flat 으로 한 줄 가로 스크롤 */}
      <div className="lg:hidden print:hidden mb-4">
        <div className="flex overflow-x-auto gap-1 pb-2 border-b border-gray-200">
          {FLAT_MENU.map((item) => {
            const active = !item.external && pathname === item.href;
            if (item.external) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-2 text-xs whitespace-nowrap rounded-lg bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </a>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1 px-3 py-2 text-xs whitespace-nowrap rounded-lg transition-colors ${
                  active ? "bg-blue-700 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex gap-6 min-h-[calc(100vh-200px)]">
        {/* 데스크탑 사이드바 */}
        <aside className="w-52 shrink-0 hidden lg:block print:hidden">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden sticky top-24">
            <button
              type="button"
              onClick={toggleCollapse}
              className="w-full px-4 py-3 bg-gray-800 text-white flex items-center justify-between hover:bg-gray-900 transition-colors"
            >
              <h2 className="text-sm font-bold">관리자 메뉴</h2>
              <span className="text-xs">{collapsed ? "▶" : "▼"}</span>
            </button>
            {!collapsed && (
              <nav className="py-1">
                {/* 대시보드 — 그룹 밖 */}
                {ROOT_ITEMS.map(renderItem)}

                {/* 그룹들 */}
                {ADMIN_GROUPS.map((g) => {
                  const groupOpen = !groupCollapsed[g.key];
                  return (
                    <div key={g.key} className="border-t-2 border-gray-200">
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.key)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-bold transition-colors ${
                          groupOpen
                            ? "bg-slate-100 text-slate-800 hover:bg-slate-200"
                            : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                        }`}
                        title={groupOpen ? "접기" : "펼치기"}
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`inline-block w-4 h-4 text-xs text-center leading-4 rounded transition-transform ${
                              groupOpen ? "bg-blue-600 text-white" : "bg-gray-300 text-gray-700"
                            }`}
                          >
                            {groupOpen ? "−" : "+"}
                          </span>
                          {g.label}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {groupOpen ? "" : `${g.items.length}개`}
                        </span>
                      </button>
                      {groupOpen && <div className="py-0.5">{g.items.map(renderItem)}</div>}
                    </div>
                  );
                })}
              </nav>
            )}
          </div>
        </aside>

        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
