import { createHmac, timingSafeEqual } from "crypto";

// 레거시 ZB 사이트 (pkistdc.net:8080) 의 SSO 게이트용 HMAC 토큰.
// 신홈에서 로그인 시 발급, nginx auth_request 에서 검증.
// 세션이 아니라 stateless 토큰 — 만료 + HMAC 서명만으로 유효성 판정.

const SECRET = process.env.LEGACY_TOKEN_SECRET || "";

export interface LegacyTokenPayload {
  userId: number;
  expires: number;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64url(s: string): Buffer {
  let padded = s.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  return Buffer.from(padded, "base64");
}

export function signLegacyToken(payload: LegacyTokenPayload): string {
  if (!SECRET) throw new Error("LEGACY_TOKEN_SECRET 환경변수가 설정되지 않았습니다.");
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyLegacyToken(token: string): LegacyTokenPayload | null {
  if (!SECRET || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = base64url(createHmac("sha256", SECRET).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromBase64url(body).toString("utf8")) as LegacyTokenPayload;
    if (!payload || typeof payload.userId !== "number" || typeof payload.expires !== "number") {
      return null;
    }
    if (payload.expires < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
