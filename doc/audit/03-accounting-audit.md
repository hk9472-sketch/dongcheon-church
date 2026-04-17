# Accounting Module Audit — 동천교회 홈페이지

**감사일**: 2026-04-13
**감사팀**: Accounting Module Auditor (Agent)
**범위**: /accounting + /api/accounting 전체 (장부관리·연보관리)

---

## CRITICAL

### C1. 전표번호 경합 조건
- **파일**: `src/app/api/accounting/vouchers/route.ts:35-53` `generateVoucherNo`
- **문제**: 비동기 다중 POST 시 동일 번호 생성 → 후속 insert는 P2002 → 사용자는 의미 없는 500만 봄. 트랜잭션·재시도·advisory lock 없음.
- **수정**: `$transaction` 내부에서 번호 생성 + P2002 retry 루프, 또는 VoucherCounter 테이블 사용.

### C2. 세분화된 권한이 API에서 미적용
- **파일**: `src/app/api/accounting/**/route.ts` 전체 — `checkAccess`는 `isAdmin <= 2 || user.accountAccess`만 확인
- **문제**: 신규 `accLedgerAccess/accOfferingAccess/accMemberEditAccess`는 UI 사이드바에서만 작동. 기존 `accountAccess=true` 사용자만 실제로 API 접근 가능. 역방향으로는 `accountAccess=true`면 UI가 숨긴 멤버 API도 자유롭게 호출 가능.
- **수정**: `checkAccess`에 `permission: "ledger" | "offering" | "memberEdit"` 파라미터 추가 후 라우트별 지정.

### C3. 연보 API의 회원 이름 누출
- **파일**:
  - `src/app/api/accounting/offering/entries/route.ts:64-72` GET 항상 `member.name` 반환
  - `src/app/api/accounting/offering/report/route.ts:107,256,340,358,366`
  - `src/app/api/accounting/offering/members/route.ts` 및 `[id]`
- **문제**: UI가 `hasMemberEdit`로 이름을 숨겨도 API가 그대로 이름을 내려 DevTools로 곧바로 노출. 감사연보 익명성이 무의미.
- **수정**: 서버 응답에서 조건부로 `name/groupName/family` 제거하는 공통 헬퍼 도입.

### C4. 전표 PUT이 unitId 변경 + 마감 우회
- **파일**: `src/app/api/accounting/vouchers/[id]/route.ts:107-125`
- **문제**: PUT이 `unitId`를 받지는 않으나 마감 확인 시 `targetDate + 9h` 로직을 사용 → POST와 불일치. 더 심각한 건 **원본 월의 마감 재계산 없이** 날짜만 옮길 수 있다는 점. 1월(마감)에서 2월(미마감)로 이동 시 1월 마감 합계가 stale.
- **수정**: 원월·대상월 둘 다 마감 체크, 또는 마감된 날짜 변경은 금지.

---

## HIGH

### H1. 날짜 키 생성 방식 불일치
- `report/route.ts:394`는 `v.date.toISOString().slice(0,10)` (UTC key)
- `offering/report/route.ts:35-37,167,213,365`은 `toKSTDateStr` (KST shift)
- 현재는 UTC midnight 저장 가정으로 결과 일치하나 seed/migration 데이터가 비정상이면 silent wrong.

### H2. `handleAccountReport` carryOver가 시작일의 "월초" 기준
- `report/route.ts:303-308` — `dateFrom = 2026-03-15`면 carryOver는 3월 1일 시점. 이후 3/15~3/31 합계만 더해져 잘못된 잔액.
- **수정**: dateFrom 이전 전표를 직접 합산, 또는 UI에서 dateFrom을 월초로 강제.

### H3. `handleDailyReport` 동일 문제
- `report/route.ts:419-422` — 기간 중간 지정 시 상단 carryOver 부정확.

### H4. `calculateCarryOver` N+1 쿼리
- `report/route.ts:47-74` — 12월 호출 시 최대 11 findUnique + 11 findMany.

### H5. 마감 화면 N+1
- `src/app/accounting/closing/page.tsx:58-86` — 12개월을 순차 `/api/accounting/report?...` 호출 → 130+ 쿼리.
- **수정**: 단일 overview 엔드포인트로 묶기.

### H6. 전표 API 응답 형식 무결성 취약
- `vouchers/route.ts`는 `{vouchers, summary}` 반환, 프론트 일부는 배열 기대. 현재는 fallback으로 동작하나 스키마 변경 시 쉽게 깨짐.

### H7. CSV export가 raw slice 사용
- `vouchers/page.tsx:212` — `v.date.slice(0,10)`. UTC midnight 저장 가정이 유지되는 한 OK.

### H8. 연보 entries API의 `date=` 단일 파라미터 경로
- `offering/entries/route.ts:58-62` — `date=` 사용 시 from/to 모두 같은 값 → `lt toNextDay(dateTo)`로 정상.

### H9. 마감 재개설 로직이 이후 월 carryOver 재계산 안 함
- `closing/route.ts:197-281` — month M을 reopen할 때 M+1 검사만. M+2, M+3이 이미 마감이면 그들의 frozen carryOver가 stale.
- **수정**: reopen 시 이후 마감된 월이 하나라도 있으면 차단, 또는 이후 월 재계산.

---

## MEDIUM

- **M1**: 전표 POST가 `amount === 0` 허용. 프론트는 필터링하나 API 직접 호출 시 제로 금액 전표 저장 가능.
- **M2**: `parseAmount`가 음수 허용 (`[^0-9-]`) → 프론트 Math.max(0) + API amount>0 필요.
- **M3**: 전표 PUT에 `items: []` 넘기면 기존 모두 삭제 → 항목 0개 전표 저장됨.
- **M4**: 계정과목 DELETE는 자식 존재 시 차단하나 스키마 `onDelete: NoAction`이라 무결성 OK.
- **M5**: 영수증이 가족 구성원의 개인 조회 시 head로 rollup하지 않음.
- **M6**: 영수증 연도 경계 `lt: toNextDay(${year}-12-31)` — 정상.
- **M7**: 전표 목록이 pagination 없이 전체 반환 → 대량 데이터 시 응답 크기.
- **M8**: 연보 entries POST는 마감 로직과 무관. 백데이트 허용 여부 확인 필요.
- **M9**: offering/report 일부 핸들러가 `lte: toDateOnly(dateTo)`, 다른 핸들러는 `lt: toNextDay(dateTo)` — 통일 필요.
- **M10**: 전표 입력 폼이 any cell 편집 시 행 자동 추가 → UX 혼란 가능성.

## LOW

- `useAccountPerms` 로딩 전 hasMemberEdit=false로 초기 렌더 시 짧은 깜빡임.
- 마감 페이지에서 active 변경된 unit 선택 상태 처리 미흡.
- `todayKST()` → UTC 저장 변환 흐름 정상.
- 전표 입력 후 탭 전환 시 refetch 안 함.
- 일부 버튼 disabled 상태 누락.
- 폐쇄 전표 로드 후 저장 버튼 disable 누락 (API가 409 반환은 함).
- offering entries PUT validTypes와 POST validTypes 목록 불일치.
- OfferingMember id 수동 부여 시 AUTO_INCREMENT 점프 가능.
- Thanks 페이지 초기 자동 조회 없음 → 일관성 부족.
- ClosingPage가 `any` 타입 남용 + HTTP 오류 세부 처리 부족.

---

## 출시 전 우선순위

1. **C2** + **C3** — 방금 출시한 권한 모델이 서버 단에서 무력화되어 있음, 최우선.
2. **C1** — 동시 입력 시 500 발생 방지.
3. **C4 / H9** — 마감 무결성 강화.
4. **H2 / H3** — 기간 보고서 carryOver 의미 재정의.
5. **M1 / M2 / M3** — 전표 API 하드닝.
6. **L7** — offeringType 통일.
