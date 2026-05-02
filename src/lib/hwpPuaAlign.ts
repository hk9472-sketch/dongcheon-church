import { isPuaCode } from "./hwpPuaMap";

// HWP 클립보드 이중 포맷 정렬.
//
// 한컴은 복사 시 클립보드에 두 포맷을 동시에 담는다:
//   · text/html  — PUA 코드(F081) + 한컴 글꼴 정보 그대로 (서식 보존용)
//   · text/plain — HWP 가 내부 매핑표로 PUA → 표준 unicode 변환한 평문
//
// 메모장에 paste 하면 평문이라 정상 표시되는 원리. 우리 에디터는
// HTML 을 우선 받지만, 동시에 평문도 읽어서 두 시퀀스를 정렬하면
// HWP 가 매번 무료로 매핑표를 빌려주는 셈.

export interface AlignedPua {
  /** 코드포인트 → 표준 unicode 글자 */
  mapping: Record<number, string>;
  /** 코드포인트 → 컨텍스트 (앞 5자 + 매핑된 글자 + 뒤 5자) */
  contexts: Record<number, string>;
}

/**
 * HTML 의 PUA 글자 자리에 plain 의 매핑된 글자를 정렬해 추출.
 * 정렬 실패 시 추출 가능한 부분까지만 반환 (best-effort).
 * 클라이언트 전용 (DOMParser 사용).
 */
export function extractPuaFromClipboard(html: string, plain: string): AlignedPua {
  const mapping: Record<number, string> = {};
  const contexts: Record<number, string> = {};
  if (!html || !plain) return { mapping, contexts };

  let htmlText = "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    htmlText = doc.body?.textContent ?? doc.documentElement?.textContent ?? "";
  } catch {
    return { mapping, contexts };
  }

  // 코드포인트 단위 분해 (서로게이트 페어 안전)
  const H = Array.from(htmlText);
  const P = Array.from(plain);

  const RESYNC_WINDOW = 12;

  let i = 0; // HTML 텍스트 포인터
  let j = 0; // plain 포인터

  while (i < H.length && j < P.length) {
    const h = H[i];
    const p = P[j];
    const hCode = h.codePointAt(0);
    const pCode = p.codePointAt(0);
    if (hCode === undefined || pCode === undefined) {
      i++;
      j++;
      continue;
    }

    if (h === p) {
      i++;
      j++;
      continue;
    }

    const hWs = /\s/.test(h);
    const pWs = /\s/.test(p);
    if (hWs && !pWs) {
      i++;
      continue;
    }
    if (pWs && !hWs) {
      j++;
      continue;
    }
    if (hWs && pWs) {
      i++;
      j++;
      continue;
    }

    // HTML 쪽이 PUA → plain 쪽 글자가 매핑값 (단 plain 도 PUA 면 무의미)
    if (isPuaCode(hCode)) {
      if (!isPuaCode(pCode) && !(hCode in mapping)) {
        mapping[hCode] = p;
        const before = H.slice(Math.max(0, i - 5), i).join("").replace(/\s+/g, " ").trim();
        const after = H.slice(i + 1, i + 6).join("").replace(/\s+/g, " ").trim();
        contexts[hCode] = `${before}[${p}]${after}`.slice(0, 64);
      }
      i++;
      j++;
      continue;
    }

    // 진짜 어긋남 — 윈도우 안에서 동기 회복 시도
    let synced = false;
    outer: for (let dh = 0; dh < RESYNC_WINDOW && i + dh < H.length; dh++) {
      for (let dp = 0; dp < RESYNC_WINDOW && j + dp < P.length; dp++) {
        if (H[i + dh] === P[j + dp]) {
          i += dh;
          j += dp;
          synced = true;
          break outer;
        }
      }
    }
    if (!synced) break;
  }

  return { mapping, contexts };
}
