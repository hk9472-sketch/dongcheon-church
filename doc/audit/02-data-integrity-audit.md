# Data Integrity Audit — 동천교회 홈페이지 (출시 전)

**감사일**: 2026-04-13
**감사팀**: Database/Data Integrity Auditor (Agent)
**범위**: 스키마, 경합조건, 트랜잭션, 타임존, NULL 처리, 데이터 마이그레이션

---

## CRITICAL

### C1. 권찰회 라우트가 `@db.Date` 컬럼에 KST 오프셋 저장 — 하루 어긋남
- **파일**:
  - `src/app/api/council/attendance/route.ts:19, 54`
  - `src/app/api/council/files/route.ts:33, 67`
  - `src/app/api/council/live-attendance/route.ts:49-50, 68-69`
- **문제**: `new Date("2026-04-17T00:00:00+09:00")` = `2026-04-16T15:00:00Z`. Prisma `@db.Date`는 UTC 날짜만 저장하므로 실제 저장값은 **2026-04-16**. 읽기 측도 같은 shift를 쓰면 일치하지만 `report-entry/route.ts:17,45`는 `new Date(dateStr)`(UTC midnight)로 조회 → 두 코드 경로가 **다른 행**을 참조해 데이터 불일치.
- **수정**: 회계 쪽 패턴과 동일하게 `T00:00:00Z`로 변경 + 기존 데이터는 SQL로 하루 보정.

### C2. `vouchers/[id]` PUT이 KST shift로 마감월 계산 — POST와 불일치
- **파일**: `src/app/api/accounting/vouchers/[id]/route.ts:111-113`
- **문제**: POST는 `voucherDate.getUTCFullYear()`을 쓰는데 PUT은 `new Date(targetDate.getTime() + 9*60*60*1000)` 후 로컬 필드 사용. 12월 전표를 UTC 서버에서 수정하면 1월 마감 체크로 넘어가 **이미 마감된 월의 전표 수정**이 허용될 수 있음.
- **수정**: `targetDate.getUTCFullYear()` / `getUTCMonth()` 사용.

### C3. 전표번호 경합으로 중복 또는 500
- **파일**: `src/app/api/accounting/vouchers/route.ts:35-54, 203`
- **문제**: `generateVoucherNo`가 `$transaction` 밖에서 max seq 읽음. 동시 POST 2건이 같은 `001` 계산 → `@@unique([unitId, voucherNo])`로 한쪽은 P2002 에러. 사용자는 일반 500만 보게 됨.
- **수정**: P2002 retry 루프, 또는 트랜잭션 내 `SELECT FOR UPDATE`, 또는 시퀀스 테이블.

### C4. `OfferingEntry.offeringType` 검증 POST/PUT 불일치
- **POST**: `src/app/api/accounting/offering/entries/route.ts:99` — 10개 타입 허용 (주일/십일조/감사/특별/오일/절기 신버전 6 + 구버전 4)
- **PUT**: `src/app/api/accounting/offering/entries/[id]/route.ts:72` — 5개만 허용
- **문제**: "십일조연보"로 저장된 기록을 PUT으로 재저장하면 거부됨. 또한 임의 문자열이 저장되면 집계 리포트에서 silently 누락됨.
- **수정**: POST/PUT 모두 동일 상수 배열 사용, 가능하면 Prisma enum/CHECK 제약.

---

## HIGH

### H1. `headnum`/`arrangenum` 생성 경합 → 답글 트리 붕괴
- **파일**: `src/app/api/board/write/route.ts:181-193, 233-238`
- **문제**: `aggregate()` 후 `create()` 비트랜잭션. 동시 작성자 2명이 같은 계산값 → 순서/스레딩 깨짐. 인덱스 `@@index([boardId, headnum, arrangenum])`가 unique가 아니라 silent 삽입됨.
- **수정**: `$transaction + SELECT FOR UPDATE`, 또는 board 카운터 원자적 증가.

### H2. `totalPosts`/`totalComment` drift — 백그라운드 reconciliation 없음
- **파일**: `src/app/api/board/write/route.ts:224-227, 269-273`, `board/delete/route.ts:60-63`
- **문제**: 증감이 별도 Prisma 호출 → 중간 실패 시 영구 drift. `vote`/`hit`도 동일.
- **수정**: `$transaction` 래핑 + 관리자용 "카운터 재계산" 유틸리티.

### H3. 댓글 `totalComment` 감소가 음수로 갈 수 있음
- **파일**: `src/app/api/board/comment/bulk-delete/route.ts` — findMany와 deleteMany 사이에 다른 요청이 삭제하면 count 오차.
- **수정**: 삭제 후 `COUNT(*)` 재조회로 재설정.

### H4. `OfferingMember.id` 수동 입력 시 TOCTOU
- **파일**: `src/app/api/accounting/offering/members/route.ts:127-163`
- **문제**: `findUnique → create`가 비트랜잭션 → 동시 POST 시 P2002.
- **수정**: try/catch P2002 → 409 반환.

### H5. 회원 삭제 시 Post/Comment authorId 고아 참조로 FK 에러
- **파일**: `prisma/schema.prisma` (Post.author, Comment.author 관계)
- **문제**: FK cascade 미정의 + `admin/members/delete/route.ts`가 authorId를 null로 업데이트하지 않음 → 글 있는 회원 삭제 시 Prisma 에러.
- **수정**: Post.author/Comment.author를 `onDelete: SetNull`로 변경, 또는 삭제 루트에서 먼저 authorId = null 업데이트.

---

## MEDIUM

- **M1**: 회계 라우트들의 `parseInt` isNaN 체크 누락 (balance/closing/report/offering/entries).
- **M2**: `toKSTDateStr` vs UTC day-key 혼용 (`report/route.ts:394` vs `offering/report/route.ts:35-37`) — 현재는 UTC midnight 저장으로 결과 일치하지만 legacy 경로에서 깨질 수 있음.
- **M3**: 전표번호 생성이 `$transaction` 밖 — C3과 동일. 트랜잭션 내부로 이동해도 number 자체가 stale 가능성.
- **M4**: `Post.authorLevel`/`Post.lastEditorName` 같은 snapshot 필드는 사용자 정보 변경 시 drift. 의도적이면 UI에서 관계 필드와 혼용 주의.
- **M5**: `CouncilAttendance` 테이블에 `(groupId, date, memberName)` unique 제약 없음 → 직접 POST로 duplicate 가능.
- **M6**: `SiteSetting.value`가 Text 타입, 숫자 계산용에 비정상 값 넣어도 스키마가 막지 못함.
- **M7**: 게시글 공지 조회용 `(boardId, isNotice)` 인덱스 부재.
- **M8**: `VisitLog.userId`, `VisitLog.path` 인덱스 없음 → 트래픽 늘면 분석 쿼리 느려짐.

## LOW

- `utils.ts formatDate`가 local getter 사용 → UTC 서버에서 KST와 9시간 차이.
- 다운로드 카운트 증가와 파일 송신이 원자적이지 않음 → 연결 끊겨도 카운트됨(사소).
- `User.birth`가 Int? (Unix timestamp) 유지 중 → 신규 코드는 DateTime? 권장.
- `Post.authorIp`/`Comment.authorIp`가 VarChar(15) → IPv6 절삭.
- `AccVoucherItem.amount` CHECK 제약 없음 → 음수 삽입 가능.
- `Session.userId`에 FK + cascade 없음 → 유저 삭제 시 orphan session 누적.
- `PasswordReset.userId`도 cascade 없음.
- 새 `accLedgerAccess/accOfferingAccess/accMemberEditAccess` 기본값 false → 기존 `accountAccess=true` 관리자는 legacy full로 OK.

---

## 출시 전 필수 조치

1. **C1** — 권찰회 KST 버그 수정 + 기존 `council_attendances / council_report_entries / council_files / council_district_summaries / council_teacher_summaries / council_weekly_summaries` 데이터 하루 보정.
2. **C2** — vouchers PUT 타임존 일치.
3. **C4** — offeringType 검증 목록 통일 + DB 제약.
4. **H5 + L6 + L7** — User → Post/Comment/Session/PasswordReset FK cascade 또는 SetNull 추가.
5. **C3 + H4** — 전표 POST와 회원 POST에 P2002 retry.
