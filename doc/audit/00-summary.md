# 동천교회 홈페이지 출시 전 종합 감사 및 수정 보고서

**작성일**: 2026-04-13
**대상**: pkistdc.net (Next.js + Prisma + MySQL)

---

## 1. 감사 프로세스

5개 전문 팀이 독립적으로 전체 코드베이스(245 files, 56,686 LOC)를 감사한 뒤, 4개 수정팀이 병렬로 수정을 반영하고 4개 검증팀이 교차검증을 수행했습니다.

```
[감사 단계]                          [수정 단계]              [검증 단계]
┌─────────────────────────┐         ┌──────────────────┐    ┌──────────────────┐
│ 1. Security Audit       │         │ A. Auth/Captcha  │───▶│ V1. Auth 검증    │
│ 2. Data Integrity Audit │         │ B. Board/XSS     │───▶│ V2. Board 검증   │
│ 3. Accounting Audit     │───▶     │ C. Accounting    │───▶│ V3. Accounting   │
│ 4. Board/UX Audit       │         │ D. Infra/Config  │───▶│ V4. Infra 검증   │
│ 5. Production Audit     │         └──────────────────┘    └──────────────────┘
└─────────────────────────┘
```

각 감사 상세 보고서는 `doc/audit/`에 저장되어 있습니다:
- [01-security-audit.md](01-security-audit.md) — 보안 감사
- [02-data-integrity-audit.md](02-data-integrity-audit.md) — 데이터 무결성
- [03-accounting-audit.md](03-accounting-audit.md) — 회계/연보 모듈
- [04-board-ux-audit.md](04-board-ux-audit.md) — 게시판/UX
- [05-production-readiness-audit.md](05-production-readiness-audit.md) — 프로덕션 준비도

---

## 2. 출시 블로커 수정 결과 (CRITICAL 14건 → 모두 해결)

### 🔒 인증 / 계정 보안

| # | 이슈 | 수정 내용 | 검증 |
|---|------|---------|------|
| **1** | 이관회원 계정 탈취 (userId만 알면 비번 재설정) | `migration-login` API 삭제. 레거시 사용자는 기존 옛 비밀번호로 일반 로그인(`verifyPassword`가 자동 bcrypt 업그레이드) | ✅ PASS |
| **2** | Gmail/DB 비밀번호 git에 커밋 | `SETUP_GCE.md` 전수 스크러빙, 플레이스홀더 교체, 경고 배너 추가 | ✅ PASS |
| **3** | 로그인 시 bcrypt 해시 일부 로그 출력 | auth 디렉토리 전체의 `console.log` 제거 (에러 로그만 유지) | ✅ PASS |
| **4** | CAPTCHA 질문=답 (무력화) + 시크릿 하드코딩 | 수식 문제(`3 + 5 = ?`)로 교체, 정답 비노출, `CAPTCHA_SECRET` 필수화(미설정 시 startup throw), `timingSafeEqual` 도입 | ✅ PASS |
| **5** | 쿠키 secure 플래그가 SITE_URL 의존 | `NODE_ENV === "production"` 기준으로 변경 | ✅ PASS |
| **6** | 비밀번호 최소 4자 | 전체 경로(register/reset-password/profile/admin) 모두 **8자 이상**으로 강화 | ✅ PASS |
| **7** | 로그인/가입/재설정 Rate limit 전무 | `src/lib/rateLimit.ts` 추가, IP별 슬라이딩 윈도우 (로그인 5회/10분, 가입 3회/시간, 재설정 3회/시간) | ✅ PASS |

### 🛡️ XSS / 게시판 권한

| # | 이슈 | 수정 내용 | 검증 |
|---|------|---------|------|
| **8** | 게시글·댓글·공지·헤더 XSS (5곳) | `isomorphic-dompurify` 설치, `src/lib/sanitize.ts` 생성(strict allow-list), 5개 렌더링 지점 전부 `sanitizeHtml()` 적용 | ✅ PASS |
| **9** | `grantWrite/grantReply/grantNotice/grantComment` 서버 미체크 | write/comment 루트에 권한 검사 추가, 관리자 bypass | ✅ PASS |
| **10** | 로그인 회원이 다른 이름으로 작성 가능 | 세션 유효 시 `authorName = sessionUser.name` 강제 | ✅ PASS |
| **11** | 업로드 검증 없음 (.php/.svg 등) | 확장자 allow-list(jpg/png/pdf/hwp/docx 등) + block-list, 10MB 제한, 경로 구분자 제거 | ✅ PASS |
| **12** | 로그인 사용자도 bcrypt(12) 실행 (DoS) | 비로그인 시에만 해시 | ✅ PASS |

### 💰 회계/연보 권한

| # | 이슈 | 수정 내용 | 검증 |
|---|------|---------|------|
| **13** | 세분화 권한이 API 무적용, legacy `accountAccess`만 체크 | `src/lib/accountAuth.ts` 신규 + 15개 라우트 전면 교체. ledger/offering/memberEdit 구분 | ✅ PASS |
| **14** | 연보 회원 이름이 권한 없어도 API 응답에 노출 | `hasMemberEdit(user)` 기준으로 응답에서 name/groupName/family 마스킹 | ✅ PASS |

### 📊 데이터 무결성

| # | 이슈 | 수정 내용 | 검증 |
|---|------|---------|------|
| **15** | 전표번호 동시성 충돌 | 트랜잭션 내 번호 생성 + P2002 retry 루프 (max 3회, 실패 시 503) | ✅ PASS |
| **16** | 권찰회 6개 라우트 KST 오프셋 → DATE 컬럼 하루 어긋남 | `+09:00` → `Z`로 통일, 6개 파일 수정 | ✅ PASS |
| **17** | vouchers PUT이 KST shift, POST는 UTC → 마감월 불일치 | 전체 UTC 접근자(`getUTCFullYear/Month`)로 통일, `items: []` 거부, `amount ≤ 0` 거부 | ✅ PASS |
| **18** | 연보 offeringType POST/PUT 허용목록 불일치 | PUT에 POST와 동일한 10종 리스트 적용 | ✅ PASS |

### 🖥️ 프로덕션 인프라

| # | 이슈 | 수정 내용 | 검증 |
|---|------|---------|------|
| **19** | 관리자 백업에 .env 포함 | `EXCLUDED_FILES` 리스트에 `.env*` 전부 차단 | ✅ PASS |
| **20** | FTP 백업 + mysqldump에 쉘 인젝션 | `execSync` → `execFileSync` argv 배열, `MYSQL_PWD` env 사용 | ✅ PASS |
| **21** | 관리자 SQL 콘솔 임의 실행 | `productionGate()` 추가, `ENABLE_SQL_CONSOLE=true` 없으면 프로덕션에서 403 | ✅ PASS |
| **22** | 다운로드/권찰회 파일 Path traversal | `path.resolve` + allowedRoot 접두사 검증 + 파일명 sanitization | ✅ PASS |
| **23** | bodySizeLimit `1gb` vs Nginx `10M` 불일치 | Next.js `15mb`로 통일 | ✅ PASS |
| **24** | `.env.example` 없음 | 루트에 모든 필수 env 변수 포함한 템플릿 생성 | ✅ PASS |
| **25** | PM2 이중화/메모리 제한 없음 | `ecosystem.config.js` 생성 (`max_memory_restart: 800M`) | ✅ PASS |
| **26** | Session orphan (user 삭제 시 session 누적) | Prisma 스키마에 `onDelete: Cascade` + 역관계 추가 | ✅ PASS |

---

## 3. 변경 파일 전체 목록 (총 39개 파일)

### 신규 생성 (5)
- `src/lib/sanitize.ts`
- `src/lib/rateLimit.ts`
- `src/lib/accountAuth.ts`
- `.env.example`
- `ecosystem.config.js`

### 삭제 (1)
- `src/app/api/auth/migration-login/route.ts` (+ 디렉토리)

### 수정 (33)

**인증/보안**
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/api/auth/reset-password/request/route.ts`
- `src/app/api/auth/reset-password/confirm/route.ts`
- `src/app/api/auth/profile/route.ts`
- `src/app/api/admin/members/reset-password/route.ts`
- `src/lib/captcha.ts`
- `src/app/auth/login/page.tsx`

**게시판/XSS**
- `src/app/api/board/write/route.ts`
- `src/app/api/board/comment/route.ts`
- `src/app/board/[boardId]/[postId]/page.tsx`
- `src/app/board/[boardId]/write/page.tsx`
- `src/components/board/CommentSection.tsx`
- `src/app/page.tsx`
- `src/components/layout/Header.tsx`
- `src/components/HelpButton.tsx`
- `package.json`

**회계 (15개)**
- `src/app/api/accounting/units/route.ts`
- `src/app/api/accounting/units/[id]/route.ts`
- `src/app/api/accounting/accounts/route.ts`
- `src/app/api/accounting/accounts/[id]/route.ts`
- `src/app/api/accounting/vouchers/route.ts`
- `src/app/api/accounting/vouchers/[id]/route.ts`
- `src/app/api/accounting/vouchers/next-no/route.ts`
- `src/app/api/accounting/balance/route.ts`
- `src/app/api/accounting/closing/route.ts`
- `src/app/api/accounting/report/route.ts`
- `src/app/api/accounting/offering/entries/route.ts`
- `src/app/api/accounting/offering/entries/[id]/route.ts`
- `src/app/api/accounting/offering/members/route.ts`
- `src/app/api/accounting/offering/members/[id]/route.ts`
- `src/app/api/accounting/offering/report/route.ts`

**권찰회 (5)**
- `src/app/api/council/attendance/route.ts`
- `src/app/api/council/files/route.ts`
- `src/app/api/council/live-attendance/route.ts`
- `src/app/api/council/overall-report/route.ts`
- `src/app/api/council/report/route.ts`

**인프라/설정**
- `src/app/api/admin/backup/route.ts`
- `src/app/api/admin/backup/ftp/route.ts`
- `src/app/api/admin/db/sql/route.ts`
- `src/app/api/download/route.ts`
- `src/app/api/council/files/download/route.ts`
- `prisma/schema.prisma`
- `next.config.ts`
- `SETUP_GCE.md`

---

## 4. 교차검증 결과

| 검증 영역 | 검증 항목 수 | PASS | FAIL |
|----------|-------------|------|------|
| V1. Auth / Captcha | 7 | 7 | 0 |
| V2. Board / XSS | 9 | 9 | 0 |
| V3. Accounting | 8 | 8 | 0 |
| V4. Infra / Data Integrity | 10 | 10 | 0 |
| **합계** | **34** | **34** | **0** |

---

## 5. 빌드/배포 확인
- `npm install` — isomorphic-dompurify 설치 완료
- `npx prisma db push` — Session cascade 스키마 반영 완료
- `npx next build` — **✓ Compiled successfully in 8.9s** (타입 오류 없음)

---

## 6. 잔여 항목 (HIGH 이하 — 출시 후 첫 주 내)

본 수정은 **출시 블로커(CRITICAL 14건) 전량 해소**를 목표로 했습니다. 다음 항목은 첫 주 내 추가 작업 권장:

### HIGH
- **H1**: 레거시 `/bbs/` 리다이렉트를 SETUP_GCE.md의 Nginx 설정에도 병합
- **H2**: 비밀번호 변경 시 기존 세션 전체 무효화
- **H3**: 홈페이지 N+1 쿼리 (11개 게시판 × 2쿼리) 배치 최적화
- **H4**: 방문자/투표 API Rate limit (현재 로그인/가입/재설정만 적용)
- **H5**: sitemap revalidate + 비공개 게시글 필터
- **H6**: CSRF 토큰 미들웨어 (Double-submit cookie)
- **H7**: `/privacy`, `/terms` 페이지 (PIPA 의무)
- **H8**: 개인정보처리방침 (기부금영수증 5년 보존 명시)
- **H9**: mysqldump cron + weekly offsite backup
- **H10**: Path traversal 공통 유틸 (image route에도 적용)
- **H11**: 조회수 쿠키 중복방지
- **H12**: `/live` 유튜브 URL 다양한 형식 지원
- **H13**: 실시간 참여 등록 rate limit

### MEDIUM (첫 달)
- TipTap 번들 lazy-load
- PM2 log rotate 설치
- MySQL slow_query_log 활성화
- OpenGraph metadata (SEO)
- `hit` 중복 증가 쿠키 방어
- 계정별 현황 carryOver 기간 시작일 재정의

---

## 7. 출시 체크리스트

**출시 당일 순서:**
- [ ] DNS A 레코드 pkistdc.net → 35.212.174.200 전파 확인 (TTL)
- [ ] 실서버 .env: NEXTAUTH_SECRET, CAPTCHA_SECRET (`openssl rand -hex 32`)
- [ ] Gmail 앱 비밀번호 재발급 후 SMTP_PASS 업데이트
- [ ] MySQL 관리자 비밀번호 rotate + `.env` 반영
- [ ] 관리자 계정 비밀번호 강력한 암호로 변경
- [ ] 배포 tarball 적용 (`sudo tar xzf ...tar.gz -C ~/pkistdc`)
- [ ] `npm install && npx prisma db push && npm run build`
- [ ] `pm2 startOrReload ecosystem.config.js && pm2 save`
- [ ] `certbot --nginx -d pkistdc.net -d www.pkistdc.net`
- [ ] `.env`의 NEXTAUTH_URL/SITE_URL을 `https://`로 업데이트 후 재빌드
- [ ] Google Search Console에 sitemap 제출
- [ ] 2시간 모니터링: `pm2 logs`, Nginx 에러로그, `free -h`, `df -h`
- [ ] 레거시 `/bbs/` 접근 시 리다이렉트 정상 확인

**출시 직후 1주 내:**
- [ ] HIGH 이슈 13개 처리
- [ ] 교인 주요 유스케이스 실사용 피드백 수집 (로그인, 글쓰기, 댓글, 연보 입력, 기부금영수증)

---

**최종 결론**: 출시 블로커로 지정된 CRITICAL 14건을 전부 수정했으며, 4개 독립 검증팀이 34개 체크포인트 전부 PASS 확인했습니다. 본 릴리스는 실서버 배포 가능 상태입니다.
