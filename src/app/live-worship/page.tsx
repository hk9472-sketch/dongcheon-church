import prisma from "@/lib/db";
import Link from "next/link";

const DEFAULT_URL = "https://www.youtube.com/watch?v=7KxscHRMaBE";

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

const SCHEDULE = [
  { label: "새벽", time: "4:10", color: "from-indigo-500 to-blue-600" },
  { label: "오전", time: "9:30", color: "from-amber-400 to-orange-500" },
  { label: "오후", time: "2:30", color: "from-emerald-500 to-teal-600" },
  { label: "저녁", time: "6:50", color: "from-rose-500 to-red-600" },
];

export const dynamic = "force-dynamic";

export default async function LiveWorshipPage() {
  const row = await prisma.siteSetting.findUnique({
    where: { key: "live_worship_url" },
  });
  const url = (row?.value || DEFAULT_URL).trim();
  const videoId = extractYouTubeId(url);
  const embedSrc = videoId
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`
    : null;

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="inline-block w-1 h-6 bg-red-600 rounded-full" />
        <h1 className="text-xl font-bold text-gray-800">내계집회</h1>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-white bg-red-600 rounded-full">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          LIVE
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
        {/* 좌: 영상 */}
        <div>
          {embedSrc ? (
            <div className="rounded-xl overflow-hidden border border-gray-200 bg-black shadow-sm">
              <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                <iframe
                  src={embedSrc}
                  title="내계집회"
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
              현재 송출 중인 영상이 없습니다.
              <div className="mt-3">
                <Link href="/" className="text-sm text-blue-700 underline">
                  메인으로 돌아가기
                </Link>
              </div>
            </div>
          )}

          <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
            <span className="shrink-0">원본 링크:</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline break-all"
            >
              {url}
            </a>
          </div>
        </div>

        {/* 우: 안내 패널 */}
        <aside className="rounded-xl border border-red-200 bg-gradient-to-br from-red-50 via-white to-rose-50 p-5 shadow-sm">
          <div className="space-y-1">
            <p className="text-base font-bold text-red-700 leading-tight">
              <span className="text-red-600 mr-1">*</span>총공회 내계집회 실시간 방송
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              매년 <strong className="text-gray-800">5월</strong>·<strong className="text-gray-800">8월</strong> 첫 주
              <br />
              <strong className="text-gray-800">월요일 오후</strong> ~ <strong className="text-gray-800">복요일 새벽</strong>까지
            </p>
          </div>

          <div className="my-4 border-t border-dashed border-red-200" />

          <p className="text-xs font-semibold text-gray-500 mb-2">방송 시간표</p>
          <ul className="space-y-2">
            {SCHEDULE.map((s) => (
              <li
                key={s.label}
                className="flex items-center gap-3 rounded-lg bg-white border border-gray-100 px-3 py-2 shadow-sm hover:shadow transition-shadow"
              >
                <span
                  className={`shrink-0 w-12 text-center text-[11px] font-bold text-white px-2 py-1 rounded-full bg-gradient-to-br ${s.color}`}
                >
                  {s.label}
                </span>
                <span className="text-base font-bold text-gray-800 font-mono tabular-nums tracking-tight">
                  {s.time}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[11px] text-gray-400 leading-relaxed">
            방송은 한국 표준시(KST) 기준이며, 회차별 시작 직전 송출이 시작됩니다.
          </p>
        </aside>
      </div>
    </div>
  );
}
