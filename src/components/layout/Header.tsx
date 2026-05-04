"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { sanitizeHtml } from "@/lib/sanitize";

interface NavMenuItem {
  label: string;
  href: string;
  requireLogin: boolean;
}

interface SessionUser {
  id: number;
  userId: string;
  name: string;
  level: number;
  isAdmin: number;
  councilAccess?: boolean;
  accountAccess?: boolean;
}

export default function Header() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [navMenu, setNavMenu] = useState<NavMenuItem[]>([]);
  const [mottoHtml, setMottoHtml] = useState<string | null>(null);
  const [liveEnabled, setLiveEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => {});

    fetch("/api/board/menu")
      .then((r) => r.json())
      .then((boards: { slug: string; title: string; requireLogin: boolean }[]) =>
        setNavMenu(boards.map((b) => ({ label: b.title, href: `/board/${b.slug}`, requireLogin: !!b.requireLogin })))
      )
      .catch(() => {});

    fetch("/api/board/motto")
      .then((r) => r.json())
      .then((d) => setMottoHtml(d.content || null))
      .catch(() => {});

    fetch("/api/settings/live-worship")
      .then((r) => r.json())
      .then((d) => setLiveEnabled(!!d.enabled))
      .catch(() => {});
  }, []);

  // 탭 활성화·포커스 복귀 시 세션 재확인 — 다른 탭에서 로그아웃했거나 세션 만료된 경우
  // 보호된 영역에 있으면 메인으로 이동.
  useEffect(() => {
    const recheck = () => {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((d) => {
          const u = d.user || null;
          setUser(u);
          if (!u) {
            const path = window.location.pathname;
            const protectedPrefixes = ["/admin", "/council", "/accounting"];
            if (protectedPrefixes.some((p) => path.startsWith(p))) {
              router.push("/");
            }
          }
        })
        .catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") recheck();
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    const path = window.location.pathname;
    // 인증·권한이 필요한 영역에서 로그아웃하면 메인으로 이동.
    // 그렇지 않으면 현재 페이지 새로고침 (헤더 상태 갱신).
    const protectedPrefixes = ["/admin", "/council", "/accounting"];
    if (protectedPrefixes.some((p) => path.startsWith(p))) {
      router.push("/");
    } else {
      router.refresh();
    }
  }

  // 로그인 상태에 따라 메뉴 필터링
  const visibleMenu = navMenu.filter((item) => !item.requireLogin || user);

  return (
    <header className="shadow-sm">
      {/* 상단: 로고 + 성구 + 로그인 */}
      <div className="bg-gradient-to-r from-blue-50/80 via-white to-blue-50/80 border-b border-gray-200/60">
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* 로고 */}
            <Link href="/" className="flex items-center gap-3 group flex-shrink-0">
              <div className="w-1 h-10 bg-gradient-to-b from-blue-600 to-indigo-600 rounded-full" />
              <div>
                <span className="block text-xl font-extrabold text-gray-800 group-hover:text-blue-800 transition-colors leading-tight tracking-[0.42em]">
                  동천교회
                </span>
                <span className="block text-[10px] text-gray-500 leading-tight">
                  예수교장로회 한국총공회
                </span>
              </div>
            </Link>

            {/* 표어 또는 성구 (데스크톱) */}
            {mottoHtml ? (
              <div
                className="hidden md:block text-center leading-snug flex-1 mx-4 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(mottoHtml) }}
              />
            ) : (
              <p className="hidden md:block text-lg text-gray-500 italic text-right leading-snug">
                그러나 너는 배우고 확신한 일에 거하라<br />
                네가 뉘게서 배운 것을 알며
                <span className="text-gray-400 text-sm not-italic ml-1.5">(딤후 3:14)</span>
              </p>
            )}

            {/* 로그인 상태 */}
            <div className="hidden md:flex items-center gap-2 flex-shrink-0">
              {liveEnabled && (
                <Link
                  href="/live-worship"
                  className="px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-red-600 to-rose-600 rounded-lg hover:from-red-700 hover:to-rose-700 shadow-sm hover:shadow transition-all flex items-center gap-1.5"
                  title="실시간 예배 / 집회"
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  내계집회
                </Link>
              )}
              {user ? (
                <>
                  <span className="text-sm text-gray-500">
                    <strong className="text-gray-700 font-semibold">{user.name}</strong>님
                  </span>
                  <Link
                    href="/auth/profile"
                    className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    정보수정
                  </Link>
                  {user.isAdmin <= 2 && (
                    <Link
                      href="/admin"
                      className="px-3 py-1.5 text-xs font-medium text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors"
                    >
                      관리
                    </Link>
                  )}
                  {(user.councilAccess || user.isAdmin <= 2) && (
                    <Link
                      href="/council"
                      className="px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      권찰회
                    </Link>
                  )}
                  {(user.accountAccess || user.isAdmin <= 2) && (
                    <Link
                      href="/accounting"
                      className="px-3 py-1.5 text-xs font-medium text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors"
                    >
                      행정실
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
                  >
                    로그아웃
                  </button>
                </>
              ) : (
                <>
                  <Link href="/auth/login" className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-blue-700 transition-colors">
                    로그인
                  </Link>
                  <Link
                    href="/auth/register"
                    className="px-4 py-1.5 text-sm font-medium bg-gradient-to-r from-blue-700 to-indigo-600 text-white rounded-lg hover:from-blue-800 hover:to-indigo-700 shadow-sm hover:shadow transition-all"
                  >
                    회원가입
                  </Link>
                </>
              )}
            </div>

            {/* 모바일 햄버거 */}
            <button className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors" onClick={() => setMenuOpen(!menuOpen)} aria-label="메뉴">
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 하단: 네비게이션 메뉴 (데스크톱) */}
      <nav className="hidden md:block" style={{ background: "linear-gradient(to right, var(--theme-nav-from), var(--theme-nav-to))" }}>
        <div className="mx-auto px-4">
          <div className="flex items-center justify-center gap-0.5 whitespace-nowrap py-1.5">
            {visibleMenu.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-4 py-2 font-medium hover:text-white hover:bg-white/15 rounded transition-all duration-150 shrink-0"
                style={{
                  fontFamily: "var(--theme-nav-font)",
                  fontSize: "var(--theme-nav-font-size)",
                  color: "var(--theme-nav-font-color)",
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* 모바일 메뉴 */}
      {menuOpen && (
        <nav className="md:hidden bg-white border-b border-gray-200 pb-3">
          {/* 표어 또는 성구 (모바일) */}
          {mottoHtml ? (
            <div
              className="px-4 py-3 text-xs border-b border-gray-100 leading-relaxed text-center prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(mottoHtml) }}
            />
          ) : (
            <p className="px-4 py-3 text-xs text-gray-500 italic border-b border-gray-100 leading-relaxed">
              그러나 너는 배우고 확신한 일에 거하라 네가 뉘게서 배운 것을 알며
              <span className="text-gray-400 not-italic ml-1">(딤후 3:14)</span>
            </p>
          )}
          <div className="py-1">
            {visibleMenu.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg mx-1 transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3 border-t border-gray-100">
            {liveEnabled && (
              <Link
                href="/live-worship"
                onClick={() => setMenuOpen(false)}
                className="px-3 py-1 text-xs font-bold text-white bg-gradient-to-r from-red-600 to-rose-600 rounded-lg shadow-sm flex items-center gap-1.5"
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                내계집회
              </Link>
            )}
            {user ? (
              <>
                <span className="text-sm text-gray-600 font-medium">{user.name}님</span>
                <Link href="/auth/profile" className="text-sm text-blue-600 font-medium" onClick={() => setMenuOpen(false)}>정보수정</Link>
                {user.isAdmin <= 2 && (
                  <Link href="/admin" className="text-sm text-orange-600 font-medium" onClick={() => setMenuOpen(false)}>관리</Link>
                )}
                {(user.councilAccess || user.isAdmin <= 2) && (
                  <Link href="/council" className="text-sm text-indigo-600 font-medium" onClick={() => setMenuOpen(false)}>권찰회</Link>
                )}
                {(user.accountAccess || user.isAdmin <= 2) && (
                  <Link href="/accounting" className="text-sm text-teal-600 font-medium" onClick={() => setMenuOpen(false)}>행정실</Link>
                )}
                <button onClick={() => { handleLogout(); setMenuOpen(false); }} className="text-sm text-gray-500">
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="text-sm text-gray-600 font-medium" onClick={() => setMenuOpen(false)}>로그인</Link>
                <Link href="/auth/register" className="text-sm text-blue-700 font-semibold" onClick={() => setMenuOpen(false)}>회원가입</Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
