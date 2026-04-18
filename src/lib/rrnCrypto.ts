import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// 주민등록번호 저장용 AES-256-GCM 암호화.
// - 키: env `RRN_ENCRYPTION_KEY` (hex 64자 = 32바이트)
// - 출력 형식: "v1:<base64(iv)>:<base64(ciphertext+tag)>"
//   * IV 12바이트(GCM 권장)
//   * tag 16바이트 — ciphertext 뒤에 concat 후 base64
// - 키 미설정 시: throw. 호출부는 사용자 에러(503) 반환.

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = process.env.RRN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "RRN_ENCRYPTION_KEY 환경변수가 설정되지 않아 주민번호를 저장/조회할 수 없습니다. " +
        "64자 hex (32바이트) 키를 .env 에 설정하세요."
    );
  }
  const cleaned = hex.trim().replace(/[^0-9a-fA-F]/g, "");
  if (cleaned.length !== 64) {
    throw new Error("RRN_ENCRYPTION_KEY 는 hex 64자(32바이트) 여야 합니다.");
  }
  cachedKey = Buffer.from(cleaned, "hex");
  return cachedKey;
}

export function rrnEncryptionReady(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * 주민번호 평문 → 암호화 문자열 ("v1:iv:ciphertext+tag" base64).
 * 빈 문자열/null 은 그대로 null 반환.
 */
export function encryptRrn(plain: string | null | undefined): string | null {
  if (plain == null) return null;
  const s = String(plain).trim();
  if (!s) return null;

  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(s, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([enc, tag]);
  return `${VERSION}:${iv.toString("base64")}:${blob.toString("base64")}`;
}

/**
 * 저장된 문자열 → 평문.
 * v1: prefix 가 없으면 평문으로 간주 (마이그레이션 기간 호환).
 */
export function decryptRrn(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  const s = String(stored);
  if (!s) return null;

  // 과거 평문 데이터 호환: 000000-0000000 형태면 그대로 반환
  if (!s.startsWith(`${VERSION}:`)) {
    return s;
  }

  const parts = s.split(":");
  if (parts.length !== 3) {
    throw new Error("주민번호 암호화 형식이 올바르지 않습니다.");
  }
  const [, ivB64, blobB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const blob = Buffer.from(blobB64, "base64");
  if (iv.length !== IV_BYTES || blob.length <= TAG_BYTES) {
    throw new Error("주민번호 암호화 형식이 올바르지 않습니다.");
  }
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const ciphertext = blob.subarray(0, blob.length - TAG_BYTES);

  const key = loadKey();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString("utf8");
}

/**
 * 목록 노출용 마스킹: 앞6자리 + 성별코드 1자리만 노출.
 */
export function maskRrn(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const digits = plain.replace(/-/g, "");
  if (digits.length < 7) return plain;
  return `${digits.slice(0, 6)}-${digits.charAt(6)}******`;
}
