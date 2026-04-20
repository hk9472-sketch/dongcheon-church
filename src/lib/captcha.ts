import { createHmac, timingSafeEqual } from "crypto";

// CAPTCHA_SECRET 은 필수 환경변수지만, 빌드 단계에서 import 만 해도 throw 되면
// Next.js 의 page data collection 이 실패하므로 실제 호출 시점에 lazy 검증한다.
function getSecret(): string {
  const secret = process.env.CAPTCHA_SECRET;
  if (!secret) {
    throw new Error("CAPTCHA_SECRET environment variable is required");
  }
  return secret;
}

const CAPTCHA_EXPIRE_MS = 5 * 60 * 1000; // 5분

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function computeHmac(answer: string, timestamp: string): string {
  return createHmac("sha256", getSecret())
    .update(`${answer}:${timestamp}`)
    .digest("hex");
}

export function generateCaptcha(): { question: string; token: string } {
  // 4자리 무작위 숫자를 그대로 보여주고 사용자는 그 숫자를 다시 입력한다.
  // 기존은 '3 + 5 = ?' 식의 연산이었으나, 연산을 피곤해하는 사용자 요청으로
  // '제시된 숫자를 그대로 입력' 방식으로 변경.
  const answer = randInt(1000, 9999);
  const question = `${answer}`;

  const timestamp = Date.now().toString();
  const hash = computeHmac(String(answer), timestamp);

  return { question, token: `${hash}:${timestamp}` };
}

export function verifyCaptcha(answer: string, token: string): boolean {
  try {
    if (typeof answer !== "string" || typeof token !== "string") return false;

    const [hash, timestamp] = token.split(":");
    if (!hash || !timestamp) return false;

    // 만료 체크
    const ts = parseInt(timestamp, 10);
    if (!Number.isFinite(ts)) return false;
    if (Date.now() - ts > CAPTCHA_EXPIRE_MS) return false;

    const normalized = answer.trim();
    // 숫자 정답만 허용
    if (!/^-?\d+$/.test(normalized)) return false;

    const expectedHash = computeHmac(normalized, timestamp);

    // 타이밍 공격 방지용 상수 시간 비교
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(expectedHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
