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
    <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="inline-block w-1 h-6 bg-red-600 rounded-full" />
        <h1 className="text-xl font-bold text-gray-800">내계집회</h1>
      </div>

      {embedSrc ? (
        <div className="rounded-lg overflow-hidden border border-gray-200 bg-black">
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
          현재 송출 중인 영상이 없습니다.
          <div className="mt-3">
            <Link href="/" className="text-sm text-blue-700 underline">
              메인으로 돌아가기
            </Link>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 flex items-center gap-3">
        <span>원본 링크:</span>
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
  );
}
