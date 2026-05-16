import Link from "next/link";

const DOCS = [
  { type: "privacy", title: "개인정보처리방침", icon: "🛡️" },
  { type: "terms", title: "이용약관", icon: "📜" },
];

export default function AdminLegalIndexPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="inline-block w-1 h-7 bg-blue-700 rounded-full" />
        <h1 className="text-xl font-bold text-gray-800">법적 문서 관리</h1>
        <span className="text-xs text-gray-500">개인정보처리방침 · 이용약관</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {DOCS.map((d) => (
          <Link
            key={d.type}
            href={`/admin/legal/${d.type}`}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:border-blue-500 hover:shadow-md transition-all"
          >
            <div className="text-3xl mb-2">{d.icon}</div>
            <h2 className="text-base font-bold text-gray-800">{d.title}</h2>
            <p className="text-xs text-gray-500 mt-1">편집 · 이력 보기 · 버전 비교</p>
          </Link>
        ))}
      </div>

      <div className="text-xs text-gray-500 leading-relaxed bg-gray-50 border border-gray-200 rounded-md p-3">
        <p className="font-semibold text-gray-700 mb-1">변경 유형 안내</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li><strong>개정(revision)</strong> — 실질적 변경. 시행일 명시 필수. 이력 보존 및 버전 간 비교 가능.</li>
          <li><strong>개선(improvement)</strong> — 표현·오탈자 등 경미한 수정. 시행일 없이도 등록 가능. 이력은 동일하게 보존.</li>
          <li>모든 변경은 row 로 저장 — 사후 추적 가능.</li>
        </ul>
      </div>
    </div>
  );
}
