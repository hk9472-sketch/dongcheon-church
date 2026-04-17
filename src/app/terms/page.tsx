import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관 | 동천교회",
  description:
    "동천교회 홈페이지 서비스의 이용과 관련하여 교회와 회원 간의 권리, 의무 및 책임사항을 정한 이용약관입니다.",
};

export default function TermsPage() {
  const effectiveDate = "2026년 4월 13일";

  return (
    <main className="min-h-[calc(100vh-200px)] bg-gray-50 py-8 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto px-4">
        <article className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 md:p-10 print:shadow-none print:border-0 print:p-0">
          <header className="border-b border-gray-200 pb-6 mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
              이용약관
            </h1>
            <p className="text-sm text-gray-500">
              시행일자: {effectiveDate}
            </p>
          </header>

          <nav className="bg-blue-50 rounded-md p-4 mb-8 text-sm print:hidden">
            <p className="font-semibold text-blue-900 mb-2">목차</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-800">
              <li><a href="#a1" className="hover:underline">제1조 (목적)</a></li>
              <li><a href="#a2" className="hover:underline">제2조 (정의)</a></li>
              <li><a href="#a3" className="hover:underline">제3조 (약관의 효력 및 변경)</a></li>
              <li><a href="#a4" className="hover:underline">제4조 (회원가입 및 이용계약의 성립)</a></li>
              <li><a href="#a5" className="hover:underline">제5조 (회원 탈퇴 및 자격 상실)</a></li>
              <li><a href="#a6" className="hover:underline">제6조 (회원의 의무)</a></li>
              <li><a href="#a7" className="hover:underline">제7조 (서비스의 제공 및 중단)</a></li>
              <li><a href="#a8" className="hover:underline">제8조 (게시물의 관리 및 저작권)</a></li>
              <li><a href="#a9" className="hover:underline">제9조 (책임의 제한)</a></li>
              <li><a href="#a10" className="hover:underline">제10조 (준거법 및 재판관할)</a></li>
              <li><a href="#a11" className="hover:underline">부칙</a></li>
            </ol>
          </nav>

          <section id="a1" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">제1조 (목적)</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              본 약관은 동천교회(이하 &ldquo;교회&rdquo;)가 운영하는 홈페이지
              및 관련 온라인 서비스(이하 &ldquo;서비스&rdquo;)를 이용함에 있어
              교회와 이용자 간의 권리, 의무 및 책임사항, 기타 필요한 사항을
              규정함을 목적으로 합니다.
            </p>
          </section>

          <section id="a2" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">제2조 (정의)</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-2">
              본 약관에서 사용하는 용어의 정의는 다음과 같습니다.
            </p>
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1 pl-2">
              <li>
                &ldquo;서비스&rdquo;란 교회가 운영하는 홈페이지를 통하여 제공하는
                교회 소식, 게시판, 예배 안내, 성경·찬송, 연보 관리 등 일체의
                온라인 서비스를 말합니다.
              </li>
              <li>
                &ldquo;회원&rdquo;이란 본 약관에 동의하고 교회가 정한 절차에
                따라 회원가입을 완료하여 서비스 이용 자격을 부여받은 자를
                말합니다.
              </li>
              <li>
                &ldquo;비회원&rdquo;이란 회원가입 없이 교회가 제공하는 서비스의
                일부를 이용하는 자를 말합니다.
              </li>
              <li>
                &ldquo;게시물&rdquo;이란 회원이 서비스를 이용함에 있어 게시판
                등에 게시한 글, 사진, 동영상, 파일, 링크 등 일체의 정보를
                말합니다.
              </li>
              <li>
                &ldquo;아이디(ID)&rdquo;란 회원 식별 및 서비스 이용을 위하여
                회원이 선정하고 교회가 승인하는 문자와 숫자의 조합을 말합니다.
              </li>
            </ol>
          </section>

          <section id="a3" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              제3조 (약관의 효력 및 변경)
            </h2>
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 pl-2">
              <li>
                본 약관은 서비스 화면에 게시하거나 기타의 방법으로 회원에게
                공지함으로써 효력이 발생합니다.
              </li>
              <li>
                교회는 필요한 경우 관련 법령을 위배하지 않는 범위에서 본 약관을
                개정할 수 있으며, 개정된 약관은 적용일자 및 개정 사유를 명시하여
                적용일자 7일 전부터 서비스 내에 공지합니다. 다만, 회원에게
                불리한 변경의 경우에는 30일 전부터 공지합니다.
              </li>
              <li>
                회원이 개정된 약관의 적용일자 이후에도 서비스를 계속 이용하는
                경우 개정된 약관에 동의한 것으로 봅니다. 동의하지 않는 회원은
                탈퇴할 수 있습니다.
              </li>
            </ol>
          </section>

          <section id="a4" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              제4조 (회원가입 및 이용계약의 성립)
            </h2>
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 pl-2">
              <li>
                회원가입은 이용자가 약관의 내용에 동의한 후 가입 신청을 하고,
                교회가 이에 승낙함으로써 성립합니다.
              </li>
              <li>
                가입 신청 시 기재한 정보가 허위로 확인되거나 타인의 명의를
                도용한 경우, 교회는 회원가입을 승낙하지 않거나 사후에 이용계약을
                해지할 수 있습니다.
              </li>
              <li>
                회원은 가입 시 기재한 사항에 변경이 있을 경우 즉시 회원정보를
                수정하여야 하며, 수정하지 않아 발생한 불이익에 대하여는 회원이
                책임을 부담합니다.
              </li>
            </ol>
          </section>

          <section id="a5" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              제5조 (회원 탈퇴 및 자격 상실)
            </h2>
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 pl-2">
              <li>
                회원은 언제든지 서비스 내 회원 탈퇴 기능 또는 교회에 대한
                의사표시를 통하여 이용계약을 해지할 수 있습니다.
              </li>
              <li>
                회원이 다음 각 호의 어느 하나에 해당하는 행위를 한 경우, 교회는
                사전 통지 없이 이용계약을 해지하거나 일정 기간 서비스 이용을
                제한할 수 있습니다.
                <ul className="list-disc list-inside pl-4 mt-1 space-y-1">
                  <li>가입 신청 시 허위 정보를 기재하거나 타인의 정보를 도용한 경우</li>
                  <li>교회 및 다른 회원의 권리나 명예, 신용 등을 침해하는 경우</li>
                  <li>서비스의 원활한 운영을 고의로 방해한 경우</li>
                  <li>관련 법령 또는 본 약관을 위반한 경우</li>
                </ul>
              </li>
            </ol>
          </section>

          <section id="a6" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              제6조 (회원의 의무)
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-2">
              회원은 다음 각 호의 행위를 하여서는 아니 됩니다.
            </p>
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1 pl-2">
              <li>타인의 아이디 및 비밀번호를 도용하거나 타인을 사칭하는 행위</li>
              <li>교회나 제3자의 저작권 등 지적재산권을 침해하는 행위</li>
              <li>공공질서 및 미풍양속에 위배되는 내용을 게시·전송하는 행위</li>
              <li>교회의 사전 승낙 없이 서비스를 영리 목적으로 이용하는 행위</li>
              <li>
                해킹, 악성코드 배포, 서버 과부하 유발 등 서비스의 안정적 운영을
                방해하는 행위
              </li>
              <li>관련 법령 또는 본 약관에서 금지하는 그 밖의 행위</li>
            </ol>
          </section>

          <section id="a7" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              제7조 (서비스의 제공 및 중단)
            </h2>
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 pl-2">
              <li>
                교회는 회원에게 서비스를 연중무휴, 1일 24시간 제공함을 원칙으로
                합니다.
              </li>
              <li>
                다음 각 호의 경우에는 서비스의 전부 또는 일부의 제공을 일시
                중단할 수 있습니다. 이 경우 교회는 사전 또는 사후에 그 사유를
                회원에게 공지합니다.
                <ul className="list-disc list-inside pl-4 mt-1 space-y-1">
                  <li>시스템 점검, 보수, 교체 등이 필요한 경우</li>
                  <li>정전, 서비스 설비의 장애, 서비스 이용의 폭주 등 부득이한 사유가 있는 경우</li>
                  <li>천재지변, 국가비상사태 등 불가항력적 사유가 있는 경우</li>
                </ul>
              </li>
              <li>
                교회는 서비스의 내용, 운영상·기술상 필요한 경우 제공하고 있는
                서비스의 전부 또는 일부를 변경하거나 중단할 수 있습니다.
              </li>
            </ol>
          </section>

          <section id="a8" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              제8조 (게시물의 관리 및 저작권)
            </h2>
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 pl-2">
              <li>
                회원이 서비스 내에 게시한 게시물의 저작권은 해당 게시물의 저작자에게
                귀속됩니다.
              </li>
              <li>
                회원은 자신이 게시한 게시물에 대하여 교회가 서비스의 운영, 전시,
                전송, 홍보 등의 목적으로 범위 내에서 이를 사용할 수 있는 권리를
                교회에 부여합니다.
              </li>
              <li>
                게시물이 다음 각 호에 해당하는 경우 교회는 사전 통지 없이 해당
                게시물을 삭제하거나 블라인드 처리할 수 있습니다.
                <ul className="list-disc list-inside pl-4 mt-1 space-y-1">
                  <li>타인의 명예를 훼손하거나 권리를 침해하는 내용</li>
                  <li>음란물, 욕설, 혐오 표현 등 공공질서에 위배되는 내용</li>
                  <li>상업적 광고, 스팸, 불법 정보 등</li>
                  <li>기타 관련 법령 및 본 약관에 위반되는 내용</li>
                </ul>
              </li>
              <li>
                교회가 운영하는 홈페이지의 디자인, 로고, 편집물, 본 약관 등에
                관한 저작권 및 기타 지식재산권은 교회에 귀속됩니다.
              </li>
            </ol>
          </section>

          <section id="a9" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              제9조 (책임의 제한)
            </h2>
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 pl-2">
              <li>
                교회는 천재지변, 전쟁, 기간통신사업자의 서비스 중지, 해킹 등
                불가항력적 사유로 인하여 서비스를 제공할 수 없는 경우 서비스
                제공 책임이 면제됩니다.
              </li>
              <li>
                교회는 회원의 귀책사유로 인한 서비스 이용의 장애에 대하여 책임을
                지지 아니합니다.
              </li>
              <li>
                교회는 회원이 게시한 게시물의 내용에 대한 신뢰성, 정확성 등에
                대하여 보증하지 아니하며, 회원 간 또는 회원과 제3자 간에 서비스를
                매개로 발생한 분쟁에 대하여 개입할 의무가 없고 이로 인한 손해를
                배상할 책임이 없습니다.
              </li>
            </ol>
          </section>

          <section id="a10" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              제10조 (준거법 및 재판관할)
            </h2>
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 pl-2">
              <li>본 약관의 해석 및 교회와 회원 간 분쟁에 대하여는 대한민국 법령을 적용합니다.</li>
              <li>
                서비스 이용으로 발생한 분쟁에 대하여 소송이 제기될 경우, 교회의
                소재지를 관할하는 법원을 전속관할 법원으로 합니다.
              </li>
            </ol>
          </section>

          <section id="a11" className="scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">부칙</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              본 약관은 {effectiveDate}부터 시행합니다.
            </p>
          </section>

          <footer className="mt-10 pt-6 border-t border-gray-200 text-xs text-gray-500 print:hidden">
            <p>본 약관을 인쇄하시려면 브라우저의 인쇄 기능(Ctrl+P / Cmd+P)을 이용해 주시기 바랍니다.</p>
          </footer>
        </article>
      </div>
    </main>
  );
}
