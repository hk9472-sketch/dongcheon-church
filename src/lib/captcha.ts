import { createHmac } from "crypto";

const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || "dc-church-captcha-2024";
const CAPTCHA_EXPIRE_MS = 5 * 60 * 1000; // 5분

export function generateCaptcha(): { question: string; token: string } {
  // 랜덤 4자리 숫자 (봇 방지용 단순 입력)
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const question = code;
  const answer = code;

  const timestamp = Date.now().toString();
  const hash = createHmac("sha256", CAPTCHA_SECRET)
    .update(`${answer}:${timestamp}`)
    .digest("hex");

  return { question, token: `${hash}:${timestamp}` };
}

export function verifyCaptcha(answer: string, token: string): boolean {
  try {
    const [hash, timestamp] = token.split(":");
    if (!hash || !timestamp) return false;

    // 만료 체크
    if (Date.now() - parseInt(timestamp, 10) > CAPTCHA_EXPIRE_MS) return false;

    const expectedHash = createHmac("sha256", CAPTCHA_SECRET)
      .update(`${answer.trim()}:${timestamp}`)
      .digest("hex");

    return hash === expectedHash;
  } catch {
    return false;
  }
}
