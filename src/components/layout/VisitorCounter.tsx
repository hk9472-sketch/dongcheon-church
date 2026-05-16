"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Stats {
  online: number;
  total: number;
  today: number;
  yesterday: number;
}

function todayKstYmd(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function yesterdayKstYmd(): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - 24 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function VisitorCounter() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const pathname = usePathname();
  const firstRef = useRef(true);

  // 페이지 이동마다 stats 재조회 — 서버에 5초 in-memory cache 가 있어
  // 동일 TTL 내 여러 페이지 이동이 와도 실제 DB 쿼리는 최대 1회.
  // 첫 mount 때만 POST 로 본인 카운트 등록 + 응답으로 본인 포함된 stats 수신.
  useEffect(() => {
    const apply = (d: unknown) => {
      if (d && typeof (d as Stats).total === "number") setStats(d as Stats);
    };

    if (firstRef.current) {
      firstRef.current = false;
      fetch("/api/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: pathname,
          referer: document.referrer || null,
          userAgent: navigator.userAgent,
        }),
      })
        .then((r) => r.json())
        .then(apply)
        .catch(() => {});
    } else {
      fetch("/api/visitor")
        .then((r) => r.json())
        .then(apply)
        .catch(() => {});
    }
  }, [pathname]);

  // 한 페이지에 오래 머무는 사용자도 30초마다 갱신.
  useEffect(() => {
    const t = setInterval(() => {
      fetch("/api/visitor")
        .then((r) => r.json())
        .then((d) => {
          if (d && typeof d.total === "number") setStats(d);
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  // 권한 확인 — 첫 mount 만.
  // - 로그인 회원: "현재" 클릭으로 활성 사용자 위젯 열림 (메시지 기능)
  // - 최고관리자(isAdmin === 1): "오늘/어제" 클릭으로 방문 로그 페이지 이동
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d?.user) {
          setIsLoggedIn(true);
          if (d.user.isAdmin === 1) setIsSuperAdmin(true);
        }
      })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const today = todayKstYmd();
  const yesterday = yesterdayKstYmd();

  // 일반 사용자용 스팬 / 최고관리자용 링크
  const Num = ({
    label,
    value,
    href,
    color,
  }: {
    label: string;
    value: number;
    href: string;
    color: string;
  }) => {
    const inner = (
      <>
        {label}:<strong className={`${color} ml-0.5`}>{(value ?? 0).toLocaleString()}</strong>
      </>
    );
    if (isSuperAdmin) {
      return (
        <Link
          href={href}
          className="hover:text-white transition-colors hover:underline"
          title={`${label} 방문 로그 조회`}
        >
          {inner}
        </Link>
      );
    }
    return <span>{inner}</span>;
  };

  // "현재" 클릭 — 페이지 이동 대신 우측 ActivePresenceWidget 펼침.
  // 위젯에서 더 즉시적이고 풍부한 정보를 보여주므로, 페이지 이동보다 자연스러움.
  const onCurrentClick = () => {
    try {
      localStorage.setItem("dc_active_widget_collapsed", "0");
    } catch {}
    window.dispatchEvent(new CustomEvent("dc:open-active-widget"));
  };

  return (
    <div className="flex items-center gap-3 text-xs text-blue-200/80">
      <span>
        총계:<strong className="text-white ml-0.5">{(stats.total ?? 0).toLocaleString()}</strong>
      </span>
      {isLoggedIn ? (
        <button
          type="button"
          onClick={onCurrentClick}
          className="hover:text-white transition-colors hover:underline"
          title="현재 접속자 위젯 열기"
        >
          현재:<strong className="text-green-300 ml-0.5">{(stats.online ?? 0).toLocaleString()}</strong>
        </button>
      ) : (
        <span>
          현재:<strong className="text-green-300 ml-0.5">{(stats.online ?? 0).toLocaleString()}</strong>
        </span>
      )}
      <Num
        label="오늘"
        value={stats.today}
        href={`/admin/visit-logs?from=${today}&to=${today}`}
        color="text-white"
      />
      <Num
        label="어제"
        value={stats.yesterday}
        href={`/admin/visit-logs?from=${yesterday}&to=${yesterday}`}
        color="text-white"
      />
    </div>
  );
}
