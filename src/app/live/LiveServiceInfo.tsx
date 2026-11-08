import Link from "next/link";

/**
 * 실시간 예배 안내 · 예배시간 — 아래 안내 칸과, 방송이 없을 때 영상 자리에 같은 내용을 보여 준다.
 *   tone="light": 아래 안내 칸 (파란 글씨)   tone="dark": 영상 자리 (어두운 바탕 · 흰 글씨)
 */
export default function LiveServiceInfo({ tone = "light" }: { tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  const h = dark ? "text-base font-bold text-white mb-2" : "text-sm font-bold text-blue-800 mb-2";
  const body = dark ? "text-sm text-slate-200" : "text-sm text-blue-700";
  const link = dark ? "underline font-medium text-white" : "underline font-medium";
  return (
    <div>
      <h3 className={h}>안내</h3>
      <ul className={`${body} space-y-1`}>
        <li>- 실시간 방송은 예배 시간에만 송출됩니다.</li>
      </ul>

      <h3 className={`${h} mt-3`}>예배시간</h3>
      <table className={body}>
        <tbody>
          <tr><td className="pr-3 py-0.5">1) 주일오전</td><td className="font-medium">: 10:00</td></tr>
          <tr><td className="pr-3 py-0.5">2) 주일오후</td><td className="font-medium">: 14:00</td></tr>
          <tr><td className="pr-3 py-0.5">3) 삼 일 밤</td><td className="font-medium">: 19:00</td></tr>
          <tr><td className="pr-3 py-0.5">4) 오 일 밤</td><td className="font-medium">: 19:00</td></tr>
          <tr><td className="pr-3 py-0.5">5) 새 &nbsp;&nbsp;&nbsp;&nbsp; 벽</td><td className="font-medium">: 04:30</td></tr>
        </tbody>
      </table>

      <p className={`${body} mt-3`}>
        - 지난 예배 영상은 <Link href="/board/DcPds" className={link}>자료실</Link> 게시판에서 확인하실 수 있습니다.
      </p>
    </div>
  );
}
