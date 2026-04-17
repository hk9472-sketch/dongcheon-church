import { createHmac, timingSafeEqual } from "crypto";

// CAPTCHA_SECRET은 필수 환경변수. 미설정 시 모듈 로드 단계에서 즉시 실패시킴.
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET;
if (!CAPTCHA_SECRET) {
  throw new Error("CAPTCHA_SECRET environment variable is required");
}

const CAPTCHA_EXPIRE_MS = 5 * 60 * 1000; // 5분

type Operator = "+" | "-" | "*";

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function computeHmac(answer: string, timestamp: string): string {
  return createHmac("sha256", CAPTCHA_SECRET as string)
    .update(`${answer}:${timestamp}`)
    .digest("hex");
}

export function generateCaptcha(): { question: string; token: string } {
  // 1~9 범위의 두 정수와 연산자(+ - *) 중 하나로 간단한 수식 생성
  const operators: Operator[] = ["+", "-", "*"];
  const op: Operator = operators[randInt(0, operators.length - 1)];

  const a = randInt(1, 9);
  const b = randInt(1, 9);

  let answer: number;
  switch (op) {
    case "+":
      answer = a + b;
      break;
    case "-":
      // 음수 방지를 위해 큰 값을 앞에 배치
      answer = Math.abs(a - b);
      break;
    case "*":
      answer = a * b;
      break;
  }

  // 뺄셈의 경우 표시 순서도 조정 (음수 결과 회피)
  const [left, right] = op === "-" ? [Math.max(a, b), Math.min(a, b)] : [a, b];
  const question = `${left} ${op} ${right} = ?`;

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
