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
 *
 * 중요: 같은 이메일을 여러 계정이 공유할 수 있어 receiver 의 이름+아이디를
 * 본문 상단에 강조 표시. 메일을 본 사람이 "자기 앞으로 온 게 맞는지" 즉시
 * 식별 가능하도록.
 */
export async function sendChatNotificationEmail(
  to: string,
  receiverName: string,
  receiverUserId: string,
  senderName: string,
  preview: string,
  hasAttach: boolean,
): Promise<void> {
  const siteName = process.env.SITE_NAME || "동천교회";
  const siteUrl = process.env.SITE_URL || "https://pkistdc.net";
  const fullPreview = preview.slice(0, 1500);
  const escapeHtml = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
  const safePreview = escapeHtml(fullPreview).replace(/\n/g, "<br/>");

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `${siteName} <noreply@pkistdc.net>`,
    to,
    subject: `[${siteName}] ${receiverName}님(${receiverUserId})께 ${senderName}님의 메시지`,
    html: `
      <div style="max-width: 520px; margin: 0 auto; font-family: 'Noto Sans KR', sans-serif; color: #1f2937;">
        <h2 style="color: #4f46e5; margin-bottom: 8px;">새 메시지가 도착했습니다</h2>

        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 10px 12px; margin: 12px 0; font-size: 14px;">
          📩 <strong>${escapeHtml(receiverName)}</strong>님
          <span style="font-family: monospace; background: #fff; padding: 1px 6px; border-radius: 3px; color: #92400e;">${escapeHtml(receiverUserId)}</span>
          앞으로 보낸 메시지입니다.
          <div style="font-size: 11px; color: #92400e; margin-top: 4px;">
            같은 이메일을 다른 계정과 공유 중이라면 위 아이디로 로그인해야 메시지함에서 확인할 수 있습니다.
          </div>
        </div>

        <p style="margin: 16px 0 6px;"><strong>${escapeHtml(senderName)}</strong> 님이 보냄</p>
        <blockquote style="border-left: 3px solid #6366f1; padding: 10px 14px; margin: 8px 0; background: #f5f5ff; color: #374151; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
${safePreview || "<em>(빈 메시지)</em>"}${hasAttach ? '<div style="margin-top: 8px; color: #2563eb; font-size: 13px;">📎 첨부 파일이 포함되어 있습니다.</div>' : ""}
        </blockquote>

        <p style="text-align: center; margin: 24px 0;">
          <a href="${siteUrl}/messages?as=${encodeURIComponent(receiverUserId)}"
             style="display: inline-block; padding: 10px 22px;
                    background-color: #4f46e5; color: #ffffff;
                    text-decoration: none; border-radius: 6px;
                    font-size: 14px;">
            메시지함 열기 (${escapeHtml(receiverUserId)} 로 로그인)
          </a>
        </p>

        <p style="font-size: 12px; color: #999; text-align: center;">
          ${siteName} 사이트에서 새 메시지를 받을 때 자동 발송됩니다.
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
