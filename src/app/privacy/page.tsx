import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 동천교회",
  description:
    "동천교회 홈페이지의 개인정보 수집·이용·보관·파기 및 정보주체의 권리에 관한 처리방침을 안내합니다.",
};

export default function PrivacyPolicyPage() {
  const effectiveDate = "2026년 4월 13일";

  return (
    <main className="min-h-[calc(100vh-200px)] bg-gray-50 py-8 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto px-4">
        <article className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 md:p-10 print:shadow-none print:border-0 print:p-0">
          <header className="border-b border-gray-200 pb-6 mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
              개인정보처리방침
            </h1>
            <p className="text-sm text-gray-500">
              시행일자: {effectiveDate}
            </p>
            <p className="text-sm text-gray-600 mt-3 leading-relaxed">
              동천교회(이하 &ldquo;교회&rdquo;)는 「개인정보 보호법」 제30조에
              따라 정보주체의 개인정보를 보호하고 이와 관련한 고충을 신속하고
              원활하게 처리할 수 있도록 다음과 같은 처리방침을 수립·공개합니다.
            </p>
          </header>

          <nav className="bg-blue-50 rounded-md p-4 mb-8 text-sm print:hidden">
            <p className="font-semibold text-blue-900 mb-2">목차</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-800">
              <li><a href="#s1" className="hover:underline">수집하는 개인정보 항목</a></li>
              <li><a href="#s2" className="hover:underline">개인정보의 수집 및 이용 목적</a></li>
              <li><a href="#s3" className="hover:underline">개인정보의 보유 및 이용 기간</a></li>
              <li><a href="#s4" className="hover:underline">개인정보의 제3자 제공</a></li>
              <li><a href="#s5" className="hover:underline">개인정보 처리의 위탁</a></li>
              <li><a href="#s6" className="hover:underline">정보주체의 권리와 행사 방법</a></li>
              <li><a href="#s7" className="hover:underline">개인정보의 안전성 확보 조치</a></li>
              <li><a href="#s8" className="hover:underline">쿠키의 운영</a></li>
              <li><a href="#s9" className="hover:underline">개인정보 보호책임자</a></li>
              <li><a href="#s10" className="hover:underline">개정 이력</a></li>
            </ol>
          </nav>

          <section id="s1" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              1. 수집하는 개인정보 항목
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              교회는 회원가입, 예배·성도 관리, 연보 기록, 기부금영수증 발급 등의
              서비스 제공을 위하여 다음의 개인정보 항목을 수집합니다.
            </p>
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">가. 필수 수집 항목</h3>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
                  <li>아이디(userId), 이름, 이메일 주소, 비밀번호(단방향 해시로 저장)</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">나. 선택 수집 항목</h3>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
                  <li>전화번호, 주소, 프로필 사진, 생년월일</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">다. 서비스 이용 과정에서 자동으로 수집되는 항목</h3>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
                  <li>접속 IP 주소, 쿠키, 접속 일시, 서비스 이용 기록</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">라. 교회 고유 수집 항목(해당 이용자에 한함)</h3>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
                  <li>연보 및 헌금 내역, 소속 구역·권찰회 정보, 가족 관계 정보</li>
                </ul>
                <p className="text-xs text-gray-500 mt-2 pl-2">
                  ※ 교회 고유 수집 항목은 연보 관리·출석 관리 등 교회 내부 목적을
                  위한 경우에 한하여 정보주체의 동의를 받아 수집·이용합니다.
                </p>
              </div>
            </div>
          </section>

          <section id="s2" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              2. 개인정보의 수집 및 이용 목적
            </h2>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
              <li>회원 가입 의사 확인, 본인 식별·인증, 회원 자격 유지·관리</li>
              <li>교회 소식·공지·예배 안내 등 서비스 관련 정보의 전달</li>
              <li>연보 내역 기록 및 기부금영수증 발급</li>
              <li>권찰회 및 구역 모임 출석 관리</li>
              <li>부정 이용 방지, 보안 사고 대응, 민원 처리</li>
            </ul>
          </section>

          <section id="s3" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              3. 개인정보의 보유 및 이용 기간
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              교회는 정보주체로부터 개인정보를 수집할 때 동의받은 개인정보 보유
              기간 내에서 개인정보를 처리·보유합니다.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 border-b border-gray-200 font-semibold text-gray-700">항목</th>
                    <th className="text-left px-3 py-2 border-b border-gray-200 font-semibold text-gray-700">보유 기간</th>
                    <th className="text-left px-3 py-2 border-b border-gray-200 font-semibold text-gray-700">근거</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border-b border-gray-100 text-gray-700">일반 회원 정보</td>
                    <td className="px-3 py-2 border-b border-gray-100 text-gray-700">회원 탈퇴 시까지</td>
                    <td className="px-3 py-2 border-b border-gray-100 text-gray-700">정보주체 동의</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border-b border-gray-100 text-gray-700">연보 및 기부금 기록</td>
                    <td className="px-3 py-2 border-b border-gray-100 text-gray-700">5년</td>
                    <td className="px-3 py-2 border-b border-gray-100 text-gray-700">소득세법 시행령 제208조의2</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border-b border-gray-100 text-gray-700">접속 로그, IP 주소</td>
                    <td className="px-3 py-2 border-b border-gray-100 text-gray-700">3개월</td>
                    <td className="px-3 py-2 border-b border-gray-100 text-gray-700">통신비밀보호법</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mt-3">
              보유 기간이 경과한 개인정보는 지체 없이 파기합니다. 전자적 파일
              형태의 정보는 복구할 수 없는 방법으로, 종이 문서는 분쇄 또는
              소각의 방법으로 파기합니다.
            </p>
          </section>

          <section id="s4" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              4. 개인정보의 제3자 제공
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              교회는 정보주체의 개인정보를 제1조(수집 항목) 및 제2조(이용 목적)에서
              명시한 범위 내에서만 처리하며, 정보주체의 사전 동의 없이는 본래의
              범위를 초과하여 처리하거나 제3자에게 제공하지 않습니다. 다만,
              「개인정보 보호법」 제17조 및 제18조에 해당하는 경우(법령의
              규정이나 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의
              요구가 있는 경우 등)에는 예외로 합니다.
            </p>
          </section>

          <section id="s5" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              5. 개인정보 처리의 위탁
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              교회는 원활한 서비스 제공을 위하여 다음과 같이 개인정보 처리 업무를
              위탁하고 있습니다.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 border-b border-gray-200 font-semibold text-gray-700">수탁자</th>
                    <th className="text-left px-3 py-2 border-b border-gray-200 font-semibold text-gray-700">위탁 업무 내용</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border-b border-gray-100 text-gray-700">Google LLC (Gmail SMTP)</td>
                    <td className="px-3 py-2 border-b border-gray-100 text-gray-700">회원가입 인증메일, 비밀번호 재설정 메일 등 자동 발송</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mt-3">
              위탁 계약 체결 시 개인정보 보호 관련 법령을 준수하고, 개인정보의
              안전한 관리 등 책임에 관한 사항을 서면으로 명시합니다.
            </p>
          </section>

          <section id="s6" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              6. 정보주체의 권리와 행사 방법
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              정보주체는 언제든지 교회에 대하여 다음 각 호의 권리를 행사할 수
              있습니다.
            </p>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
              <li>개인정보 열람 요구</li>
              <li>오류 등이 있을 경우 정정 요구</li>
              <li>삭제 요구</li>
              <li>처리 정지 요구</li>
            </ul>
            <p className="text-sm text-gray-700 leading-relaxed mt-3">
              권리 행사는 교회에 대하여 서면, 전자우편 등을 통하여 하실 수
              있으며, 교회는 이에 대하여 지체 없이 조치합니다. 단, 다른 법령에서
              그 개인정보가 수집 대상으로 명시되어 있는 경우에는 그 삭제를 요구할
              수 없습니다.
            </p>
          </section>

          <section id="s7" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              7. 개인정보의 안전성 확보 조치
            </h2>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
              <li>비밀번호의 단방향 암호화 저장(bcrypt 해시)</li>
              <li>HTTPS를 통한 통신 구간 암호화</li>
              <li>접근 권한의 최소화 및 역할 기반 통제(관리자 등급별 접근 제한)</li>
              <li>중요 정보에 대한 접속 기록의 보관 및 위변조 방지</li>
              <li>CAPTCHA 등 부정 접근 차단 장치 운영</li>
              <li>백업 데이터의 분리 보관 및 정기 점검</li>
            </ul>
          </section>

          <section id="s8" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              8. 쿠키의 운영
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              교회는 이용자에게 맞춤형 서비스를 제공하기 위하여 이용 정보를
              저장하고 수시로 불러오는 쿠키(cookie)를 사용합니다.
            </p>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
              <li>
                <span className="font-semibold">dc_session</span> : 로그인 세션
                유지를 위한 필수 쿠키 (유효기간 7일)
              </li>
            </ul>
            <p className="text-sm text-gray-700 leading-relaxed mt-3">
              이용자는 웹 브라우저의 옵션을 설정하여 쿠키의 저장을 거부할 수
              있으나, 이 경우 로그인이 필요한 일부 서비스의 이용이 제한될 수
              있습니다.
            </p>
          </section>

          <section id="s9" className="mb-8 scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              9. 개인정보 보호책임자
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              교회는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 개인정보
              처리와 관련한 정보주체의 불만 처리 및 피해 구제 등을 위하여 다음과
              같이 개인정보 보호책임자를 지정하고 있습니다.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm text-gray-700 space-y-1">
              <p>
                <span className="font-semibold">성명 :</span> [개인정보 보호책임자 이름]
              </p>
              <p>
                <span className="font-semibold">직책 :</span> [직책]
              </p>
              <p>
                <span className="font-semibold">연락처 :</span> [연락처 전화번호]
              </p>
              <p>
                <span className="font-semibold">이메일 :</span> [교회 대표 이메일]
              </p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mt-3">
              기타 개인정보 침해에 대한 신고나 상담이 필요한 경우에는 아래
              기관에 문의하실 수 있습니다.
            </p>
            <ul className="list-disc list-inside text-xs text-gray-500 space-y-1 pl-2 mt-1">
              <li>개인정보분쟁조정위원회 (www.kopico.go.kr / 1833-6972)</li>
              <li>개인정보침해신고센터 (privacy.kisa.or.kr / 118)</li>
              <li>대검찰청 사이버수사과 (www.spo.go.kr / 1301)</li>
              <li>경찰청 사이버수사국 (ecrm.cyber.go.kr / 182)</li>
            </ul>
          </section>

          <section id="s10" className="scroll-mt-24">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              10. 개정 이력
            </h2>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
              <li>{effectiveDate} : 본 개인정보처리방침 제정 및 시행</li>
            </ul>
          </section>

          <footer className="mt-10 pt-6 border-t border-gray-200 text-xs text-gray-500 print:hidden">
            <p>본 방침을 인쇄하시려면 브라우저의 인쇄 기능(Ctrl+P / Cmd+P)을 이용해 주시기 바랍니다.</p>
          </footer>
        </article>
      </div>
    </main>
  );
}
