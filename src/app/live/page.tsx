import Link from "next/link";
import LiveAttendanceForm from "./LiveAttendanceForm";
import LiveViewerCount from "./LiveViewerCount";
import LiveAttendanceList from "./LiveAttendanceList";
import LiveServiceTracker from "@/components/LiveServiceTracker";
import { parseYouTubeLiveUrl } from "@/lib/youtubeEmbed";

export default function LivePage() {
  const youtubeUrl = process.env.NEXT_PUBLIC_YOUTUBE_LIVE_URL || "";
  const { embed: embedUrl, hint: parseHint } = parseYouTubeLiveUrl(youtubeUrl);

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-4">
      <LiveServiceTracker />
      {/* 헤더 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-1 h-8 bg-gradient-to-b from-red-500 to-red-700 rounded-full" />
        <div>
          <h1 className="text-xl font-bold text-gray-800">실시간 예배</h1>
          <p className="text-sm text-gray-500">동천교회 실시간 방송</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <LiveViewerCount />
          <Link
            href="/live/stats"
            className="flex items-center gap-1 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full hover:bg-emerald-100 transition-colors"
            title="실시간 예배 참석 통계"
          >
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <span className="text-xs font-bold text-emerald-700">참석 통계</span>
          </Link>
          <span className="flex items-center gap-1.5 px-3 py-1 bg-red-50 border border-red-200 rounded-full">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold text-red-600">LIVE</span>
          </span>
        </div>
      </div>

      {/* 영상 영역 */}
      <div className="bg-black rounded-lg overflow-hidden shadow-lg">
        {embedUrl ? (
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={embedUrl}
              title="동천교회 실시간 예배"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 px-4 text-center">
            {youtubeUrl ? (
              <>
                <p className="text-sm">실시간 방송을 불러올 수 없습니다.</p>
                {parseHint && (
                  <p className="mt-2 text-xs text-gray-500 max-w-md">{parseHint}</p>
                )}
              </>
            ) : (
              <p>유튜브 채널 URL이 설정되지 않았습니다.</p>
            )}
          </div>
        )}
      </div>

      {/* 유튜브 바로가기 버튼 */}
      {youtubeUrl && (
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded shadow hover:shadow-md transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z" />
            </svg>
            유튜브
          </a>
          <p className="text-xs text-gray-400">
            실시간 방송이 보이지 않으면 유튜브 채널에서 직접 확인해 주세요.
          </p>
        </div>
      )}

      {/* 하단: 안내 + 예배시간(좌) | 참여등록(우상) + 참여현황(우하) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 안내 + 예배시간 */}
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-bold text-blue-800 mb-2">안내</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>- 실시간 방송은 예배 시간에만 송출됩니다.</li>
            </ul>

            {/* 예배시간 안내 */}
            <h3 className="text-sm font-bold text-blue-800 mt-3 mb-2">예배시간</h3>
            <table className="text-sm text-blue-700">
              <tbody>
                <tr><td className="pr-3 py-0.5">1) 주일오전</td><td className="font-medium">: 10:00</td></tr>
                <tr><td className="pr-3 py-0.5">2) 주일오후</td><td className="font-medium">: 14:00</td></tr>
                <tr><td className="pr-3 py-0.5">3) 삼 일 밤</td><td className="font-medium">: 19:00</td></tr>
                <tr><td className="pr-3 py-0.5">4) 오 일 밤</td><td className="font-medium">: 19:00</td></tr>
                <tr><td className="pr-3 py-0.5">5) 새 &nbsp;&nbsp;&nbsp;&nbsp; 벽</td><td className="font-medium">: 04:30</td></tr>
              </tbody>
            </table>

            <p className="text-sm text-blue-700 mt-3">
              - 지난 예배 영상은 <Link href="/board/DcPds" className="underline font-medium">자료실</Link> 게시판에서 확인하실 수 있습니다.
            </p>
          </div>
        </div>

        {/* 우측: 참여 등록 + 참여 현황 */}
        <div className="space-y-4">
          {/* 실시간 참여 등록 */}
          <LiveAttendanceForm />

          {/* 참여 등록 현황 (권찰회 권한자만) */}
          <LiveAttendanceList />
        </div>
      </div>
    </div>
  );
}
