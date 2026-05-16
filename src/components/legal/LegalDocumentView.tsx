interface Current {
  version: string;
  content: string;
  effectiveDate: Date | null;
  changeType: string;
  createdAt: Date;
}

export default function LegalDocumentView({
  title,
  current,
}: {
  title: string;
  current: Current;
}) {
  const effective = current.effectiveDate || current.createdAt;
  const effectiveText = new Date(effective).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="min-h-[calc(100vh-200px)] bg-gray-50 py-8 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto px-4">
        <article className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 md:p-10 print:shadow-none print:border-0 print:p-0">
          <header className="border-b border-gray-200 pb-6 mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
              {title}
            </h1>
            <p className="text-sm text-gray-500">시행일자: {effectiveText}</p>
            <p className="text-xs text-gray-400 mt-1">
              현재 버전: <strong>v{current.version}</strong>
              {current.changeType === "improvement" && (
                <span className="ml-2 text-gray-400">(개선)</span>
              )}
            </p>
          </header>

          <div
            className="prose prose-sm md:prose-base max-w-none text-gray-800 leading-relaxed [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1"
            dangerouslySetInnerHTML={{ __html: current.content }}
          />

          <footer className="mt-10 pt-6 border-t border-gray-200 text-xs text-gray-500 print:hidden">
            <p>본 문서를 인쇄하시려면 브라우저의 인쇄 기능(Ctrl+P / Cmd+P)을 이용해 주세요.</p>
          </footer>
        </article>
      </div>
    </main>
  );
}
