import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendVerificationEmail(
  to: string,
  verifyUrl: string,
  userName: string
): Promise<void> {
  const siteName = process.env.SITE_NAME || "동천교회";

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `${siteName} <noreply@pkistdc.net>`,
    to,
    subject: `[${siteName}] 이메일 인증 안내`,
    html: `
      <div style="max-width: 480px; margin: 0 auto; font-family: 'Noto Sans KR', sans-serif; color: #1f2937;">
        <h2 style="color: #1d4ed8;">${siteName} 회원가입 인증</h2>
        <p>${userName}님, 가입해 주셔서 감사합니다.</p>
        <p>아래 버튼을 클릭하시면 이메일 인증이 완료됩니다.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${verifyUrl}"
             style="display: inline-block; padding: 12px 24px;
                    background-color: #1d4ed8; color: #ffffff;
                    text-decoration: none; border-radius: 8px;
                    font-size: 14px;">
            이메일 인증하기
          </a>
        </p>
        <p style="font-size: 13px; color: #666;">
          이 링크는 24시간 동안 유효합니다.<br/>
          본인이 가입하지 않은 경우 이 메일을 무시하세요.
        </p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  userName: string
): Promise<void> {
  const siteName = process.env.SITE_NAME || "동천교회";

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `${siteName} <noreply@pkistdc.net>`,
    to,
    subject: `[${siteName}] 비밀번호 초기화 안내`,
    html: `
      <div style="max-width: 480px; margin: 0 auto; font-family: 'Noto Sans KR', sans-serif; color: #1f2937;">
        <h2 style="color: #1d4ed8;">${siteName} 비밀번호 초기화</h2>
        <p>${userName}님, 안녕하세요.</p>
        <p>비밀번호 초기화가 요청되었습니다. 아래 버튼을 클릭하여 새 비밀번호를 설정하세요.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${resetUrl}"
             style="display: inline-block; padding: 12px 24px;
                    background-color: #1d4ed8; color: #ffffff;
                    text-decoration: none; border-radius: 8px;
                    font-size: 14px;">
            비밀번호 재설정
          </a>
        </p>
        <p style="font-size: 13px; color: #666;">
          이 링크는 1시간 동안 유효합니다.<br/>
          본인이 요청하지 않은 경우 이 메일을 무시하세요.
        </p>
      </div>
    `,
  });
}
