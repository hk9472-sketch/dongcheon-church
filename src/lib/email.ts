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

/**
 * 채팅 메시지 수신 알림 — 비접속 상태인 회원에게.
 * 발송 시점에 receiver 가 활성 세션 없으면 호출 (POST /api/chat 안).
 */
export async function sendChatNotificationEmail(
  to: string,
  receiverName: string,
  senderName: string,
  preview: string,
  hasAttach: boolean,
): Promise<void> {
  const siteName = process.env.SITE_NAME || "동천교회";
  const siteUrl = process.env.SITE_URL || "https://pkistdc.net";
  const shortPreview = preview.slice(0, 200);

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `${siteName} <noreply@pkistdc.net>`,
    to,
    subject: `[${siteName}] ${senderName} 님이 메시지를 보냈습니다`,
    html: `
      <div style="max-width: 480px; margin: 0 auto; font-family: 'Noto Sans KR', sans-serif; color: #1f2937;">
        <h2 style="color: #4f46e5;">새 메시지가 도착했습니다</h2>
        <p>${receiverName}님,</p>
        <p><strong>${senderName}</strong> 님이 메시지를 보냈습니다.</p>
        <blockquote style="border-left: 3px solid #6366f1; padding: 8px 12px; margin: 12px 0; background: #f5f5ff; color: #374151; font-size: 14px;">
          ${shortPreview || "<em>(빈 메시지)</em>"}
          ${hasAttach ? '<div style="margin-top: 6px; color: #2563eb;">📎 첨부 파일 포함</div>' : ""}
        </blockquote>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${siteUrl}/messages"
             style="display: inline-block; padding: 10px 20px;
                    background-color: #4f46e5; color: #ffffff;
                    text-decoration: none; border-radius: 6px;
                    font-size: 14px;">
            메시지함 열기
          </a>
        </p>
        <p style="font-size: 12px; color: #999;">
          이 메일은 동천교회 사이트에서 새 메시지를 받을 때 자동 발송됩니다.
        </p>
      </div>
    `,
  });
}

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
