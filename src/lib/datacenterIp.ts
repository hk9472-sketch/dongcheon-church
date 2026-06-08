// ============================================================
// 데이터센터/클라우드 IP 판별 — 방문자 카운트 크롤러 차단용.
//
// UA 위장(정상 Mozilla/... 행세) + JS 실행하는 분산 크롤러가 방문 카운트를 부풀린다.
// (관측: 중국 클라우드 Tencent/Huawei/Alibaba 대역에서 게시판 옛 글을 ID로 훑음)
// UA 키워드 필터(isBot)로는 못 거르므로, 알려진 클라우드 데이터센터 IP 대역을 차단한다.
//
// 주의: 완벽한 CIDR 검사가 아니라 관측된 대역 + 주요 클라우드 /10~/16 의 octet 범위 매칭.
// 잔여(미차단 프록시 등)는 호출 측의 행태 기반 카운트(체류/복수페이지/로그인/모바일)가 거른다.
// ============================================================

/** IPv4 가 알려진 클라우드 데이터센터 대역이면 true (= 사람 아닌 크롤러로 간주) */
export function isDatacenterIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  // IPv6 또는 비정상 → 판단 보류(false)
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;

  // ── Tencent Cloud ──
  if (a === 43 && b >= 128 && b <= 191) return true; // 43.128.0.0/10 (주 크롤러 대역)
  if (a === 49 && (b === 51 || b === 232)) return true;
  if (a === 119 && (b === 8 || b === 13 || b === 28 || b === 29 || b === 45)) return true;
  if (a === 124 && (b === 156 || b === 243)) return true;
  if (a === 82 && (b === 156 || b === 157)) return true;
  if (a === 111 && (b === 119 || b === 230)) return true;
  if (a === 152 && b === 136) return true;
  if (a === 1 && (b === 92 || (b >= 12 && b <= 15))) return true; // 1.12/14 + 1.92
  if (a === 129 && b === 226) return true;
  if (a === 150 && b === 109) return true;
  if (a === 170 && b === 106) return true;
  if (a === 101 && (b === 32 || b === 42)) return true;
  if (a === 81 && b >= 68 && b <= 71) return true; // 81.68.0.0/14
  if (a === 134 && b === 175) return true;
  if (a === 162 && b === 14) return true;

  // ── Huawei Cloud ──
  if (a === 159 && b === 138) return true;
  if (a === 114 && b === 115) return true;
  if (a === 139 && b === 159) return true;
  if (a === 116 && b === 204) return true;
  if (a === 122 && b === 112) return true;
  if (a === 121 && b === 36) return true;

  // ── Alibaba Cloud ──
  if (a === 47 && ((b >= 74 && b <= 95) || (b >= 235 && b <= 255))) return true;
  if (a === 8 && b >= 128 && b <= 159) return true; // 8.128.0.0/12
  if (a === 120 && b >= 24 && b <= 27) return true;

  // ── 관측된 기타 크롤러 대역 (로그 마이닝) ──
  if (a === 113 && b === 44) return true;
  if (a === 180 && b === 153) return true;
  if (a === 140 && b === 206) return true;
  if (a === 94 && b === 74) return true;
  if (a === 46 && b === 250) return true;
  if (a === 149 && b === 232) return true;
  if (a === 190 && b === 92) return true;

  return false;
}
