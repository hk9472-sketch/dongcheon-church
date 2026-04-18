import Link from "next/link";

interface PageProps {
  searchParams: Promise<{ success?: string; error?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const { success, error } = await searchParams;

  const errorMessages: Record<string, string> = {
    missing: "인증 링크가 올바르지 않습니다.",
    invalid: "유효하지 않은 인증 링크입니다. 이미 인증되었거나 잘못된 링크입니다.",
    expired: "인증 링크가 만료되었습니다. 다시 회원가입을 진행해 주세요.",
  };

  return (
    <div className="max-w-md mx-auto mt-8">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 bg-gray-50 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-800">이메일 인증</h1>
        </div>

        <div className="p-6 text-center space-y-4">
          {success === "1" ? (
            <>
              <p className="text-5xl">✅</p>
              <p className="text-lg font-semibold text-gray-800">이메일 인증이 완료되었습니다!</p>
              <p className="text-sm text-gray-500">이제 모든 기능을 이용하실 수 있습니다.</p>
              <Link
                href="/auth/login"
                className="inline-block mt-2 px-6 py-2.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors"
              >
                로그인하기
              </Link>
            </>
          ) : (
            <>
              <p className="text-5xl">❌</p>
              <p className="text-base font-semibold text-red-700">인증에 실패했습니다</p>
              <p className="text-sm text-gray-500">
                {error && errorMessages[error]
                  ? errorMessages[error]
                  : "알 수 없는 오류가 발생했습니다."}
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap pt-2">
                <Link
                  href="/auth/resend-verify"
                  className="inline-block px-5 py-2.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors"
                >
                  인증 메일 재발송 / 이메일 수정
                </Link>
                <Link
                  href="/auth/register"
                  className="inline-block px-5 py-2.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  다시 가입
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
