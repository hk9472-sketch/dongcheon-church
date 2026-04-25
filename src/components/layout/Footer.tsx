import Link from "next/link";
import VisitorCounter from "./VisitorCounter";
import { getCurrentUser } from "@/lib/auth";

function getFooterLinks() {
  const youtubeUrl = process.env.NEXT_PUBLIC_YOUTUBE_LIVE_URL || "";
  const faithStudyUrl = process.env.NEXT_PUBLIC_FAITH_STUDY_URL || "";
  const sinpungUrl = process.env.NEXT_PUBLIC_SINPUNG_CHURCH_URL || "";
  const sonyangwonUrl = process.env.NEXT_PUBLIC_SONYANGWON || "";
  const replayUrl = process.env.NEXT_PUBLIC_REPLAY_URL || "";

  const isExternal = (url: string) => url.startsWith("http");

  // type: "link" = 버튼, "divider" = 구분선
  return [
    {
      type: "link" as const,
      label: "실시간 예배",
      href: "/live",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z" />
        </svg>
      ),
      external: false,
    },
    {
      type: "link" as const,
      label: "다시보기",
      href: replayUrl ? (replayUrl.startsWith("http") || replayUrl.startsWith("/") ? replayUrl : `/board/${replayUrl}`) : "#",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
        </svg>
      ),
      external: isExternal(replayUrl),
    },
    { type: "divider" as const },
    {
      type: "link" as const,
      label: "목회연구",
      href: faithStudyUrl || "#",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      ),
      external: isExternal(faithStudyUrl),
    },
    {
      type: "link" as const,
      label: "신풍교회",
      href: sinpungUrl || "#",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
        </svg>
      ),
      external: isExternal(sinpungUrl),
    },
    {
      type: "link" as const,
      label: "손양원 기념관",
      href: sonyangwonUrl || "#",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6M4.5 9.75v10.5h15V9.75" />
        </svg>
      ),
      external: isExternal(sonyangwonUrl),
    },
    { type: "divider" as const },
    {
      type: "link" as const,
      label: "성경 읽기",
      href: "/bible",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      ),
      external: false,
      maxLevel: 8,
    },
    {
      type: "link" as const,
      label: "찬송 듣기",
      href: "/hymn",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
        </svg>
      ),
      external: false,
    },
  ];
}

export default async function Footer() {
  const user = await getCurrentUser();
  const allLinks = getFooterLinks();

  // maxLevel이 설정된 링크는 로그인 + isAdmin <= maxLevel 인 경우만 표시
  const footerLinks = allLinks.filter((item) => {
    if (item.type === "divider") return true;
    if ("maxLevel" in item && item.maxLevel) {
      return user && user.isAdmin <= item.maxLevel;
    }
    return true;
  });

  // 연속된 divider 또는 맨 끝 divider 제거
  const cleanedLinks = footerLinks.filter((item, i, arr) => {
    if (item.type !== "divider") return true;
    // 첫 번째이거나 마지막이면 제거
    if (i === 0 || i === arr.length - 1) return false;
    // 다음 것도 divider이면 제거
    if (arr[i + 1]?.type === "divider") return false;
    return true;
  });

  return (
    <footer className="text-blue-100 text-sm" style={{ background: "linear-gradient(to right, var(--theme-footer-from), var(--theme-footer-to))" }}>
      <div className="max-w-[1400px] mx-auto px-4 py-4">
        {/* 상단: 교회 정보(좌) + 바로가기 버튼(우) */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-3">
          {/* 교회 정보 */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-blue-200 flex-shrink-0 text-lg leading-none">|</span>
              <span className="text-white font-bold text-sm">동천교회</span>
            </div>
            <span className="text-blue-200/80 text-xs">
              부산광역시 동구 범곡로9번길 7-7
            </span>
            <span className="text-blue-200/80 text-xs">
              TEL: 051)633-3188
            </span>
          </div>

          {/* 바로가기 링크 */}
          <div className="flex flex-wrap gap-2 items-center">
            {cleanedLinks.map((item, i) =>
              item.type === "divider" ? (
                <span key={`div-${i}`} className="text-white/40 text-lg leading-none select-none">|</span>
              ) : (
                <Link
                  key={item.label}
                  href={item.href!}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noopener noreferrer" : undefined}
                  className="flex items-center gap-2 px-4 py-2 bg-white/25 hover:bg-white/40 text-white rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow border border-white/20"
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              )
            )}
          </div>
        </div>

        {/* 하단: 방문자 + 정책 링크 + 저작권 */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-2 border-t border-white/20">
          <div className="flex items-center gap-3">
            <VisitorCounter />
            <span className="text-white/40 select-none text-xs">|</span>
            <a
              href="http://pkistdc.net:8080"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-200/80 hover:text-white hover:underline"
              title="구 홈페이지 (제로보드)"
            >
              🗄️ 이전 홈 바로가기
            </a>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Link
                href="/privacy"
                className="text-white/90 hover:text-white font-semibold hover:underline"
              >
                개인정보처리방침
              </Link>
              <span className="text-white/40 select-none">|</span>
              <Link
                href="/terms"
                className="text-blue-100/90 hover:text-white hover:underline"
              >
                이용약관
              </Link>
            </div>
            <p className="text-blue-200/60">
              &copy; {new Date().getFullYear()} 동천교회. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
