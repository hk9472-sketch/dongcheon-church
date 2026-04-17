# Production Readiness Audit — 동천교회 홈페이지

**감사일**: 2026-04-13
**감사팀**: Production Readiness Auditor (Agent)
**범위**: 환경설정, 에러/로그, 성능, 백업/복구, SEO/법규, 인프라, DB, 외부 의존성

---

## 환경

- GCE VM (Ubuntu, ~2GB RAM), Node.js 20, PM2, Nginx
- pkistdc.net — 기존 ZeroBoard에서 전환
- 테스트 IP: 35.212.174.200:3000

---

## CRITICAL — 출시 블로커

### C1. 게시글/댓글 Stored XSS (보안감사와 중복)
`dangerouslySetInnerHTML` 전반에 sanitization 없음. DOMPurify 도입 필수.

### C2. 관리자 SQL 콘솔이 임의 `$executeRawUnsafe` 허용
`src/app/api/admin/db/sql/route.ts:282` — 프로덕션 비활성화 + 블랙리스트 강화.

### C3. SETUP_GCE.md에 실제 SMTP 비밀번호 커밋
`SETUP_GCE.md:250` — `SMTP_PASS="uhbbtuoxjeomuqow"` 및 DB 비밀번호 `System1!!3610`(137, 234).
- **조치**: Gmail 앱 비밀번호 즉시 재발급, DB 비밀번호 rotate, `git filter-repo`로 히스토리 삭제, 플레이스홀더로 교체.

### C4. 로그인 라우트 해시 로깅
`src/app/api/auth/login/route.ts:20,22` — `console.log` 제거.

### C5. Next.js `bodySizeLimit: "1gb"` vs Nginx 10M 불일치
`next.config.ts:6` vs `nginx/nginx.conf:48` + `SETUP_GCE.md:327`
- **조치**: `bodySizeLimit: "15mb"`, Nginx `client_max_body_size 15M`, 쓰기 루트에서 per-file 제한.

### C6. 업로드 파일 크기 검증 누락
`src/app/api/board/write/route.ts:95-111` — `file.size` 체크 없음 (C5와 결합 시 DoS).

### C7. 관리자 기본 비밀번호 `admin/admin1234`
`DEPLOY.md:394`, `prisma/seed.ts` — 공개 문서화됨.
- **조치**: seed에서 랜덤 비밀번호 생성 + 첫 로그인 시 `mustChangePassword` 강제.

### C8. CAPTCHA 시크릿 하드코딩
`src/lib/captcha.ts:3` — `CAPTCHA_SECRET` 미설정 시 `"dc-church-captcha-2024"` fallback.
- **조치**: 환경변수 필수화, 미설정 시 startup throw.

### C9. `.env.example` 파일 없음
`docker-compose.yml:4`에서 참조하나 미존재. DEPLOY.md와 env 변수 drift.
- **조치**: `grep process.env.` 기준 모든 변수 포함한 .env.example 생성.

---

## HIGH — 출시 첫 주 내

| # | 항목 | 파일 |
|---|------|------|
| H1 | 레거시 `/bbs/` 리다이렉트가 nginx.conf에만 존재, SETUP_GCE.md에 미반영 | next.config.ts:19-28, nginx.conf:99-137 |
| H2 | 세션 로테이션 없음 + 로그아웃-전체 없음 | auth/login/route.ts:35-40 |
| H3 | 홈페이지 N+1 (11개 게시판 × 2쿼리) | page.tsx:272-287 |
| H4 | 로그인/가입/재설정/글쓰기 rate limit 전무 | 전역 |
| H5 | sitemap이 매 요청 1000건 스캔, 비공개 게시글 포함 | sitemap.xml/route.ts:12 |
| H6 | `/api/visitor` POST rate limit 없음 | visitor/route.ts:113 |
| H7 | SEO metadata 최소 (OpenGraph 없음, generateMetadata 없음) | layout.tsx:9-19 |
| H8 | 개인정보처리방침/이용약관 페이지 없음 (PIPA 위반) | 미구현 |
| H9 | 백업 자동화 없음 | DEPLOY.md |
| H10 | PM2 `max_memory_restart` 없음 | SETUP_GCE.md:296 |
| H11 | metadataBase 없어 OG 이미지 URL 깨짐 | layout.tsx |
| H12 | 게시판 write route에 grantWrite/grantNotice 미적용 | api/board/write/route.ts |

---

## MEDIUM — 첫 달

- **M1**: `next.config.ts` host allowlist가 pkistdc.net만 포함.
- **M2**: PM2 로그 로테이션 미설정 → `pm2-logrotate` 설치.
- **M3**: MySQL slow query log 미활성화.
- **M4**: `legacyPwHash` 상수시간 비교 없음 (lib/auth.ts:54).
- **M5**: TipTap 에디터 번들 무게 → `dynamic` lazy-load 확인.
- **M6**: favicon 파일 존재 확인 필요.
- **M7**: 디스크 공간 모니터링 문서화 필요.
- **M8**: 에러 페이지 `error.message` 노출 여부 점검.
- **M9**: `scripts/`가 tsconfig에서 제외되어 런타임 타입체크 없음.
- **M10**: `/api/health`에 uptime/memory/session count 추가.
- **M11**: 기부금영수증 법적 준수 (5년 보존, 국세청 서식 29호, 기부금단체 등록).

## LOW

- `.well-known/security.txt` 추가.
- CSP 헤더 추가 검토 (`'unsafe-inline'` 조사 필요).
- `next/image`로 썸네일 AVIF/WebP 전환.
- PM2 `NODE_OPTIONS=--max-old-space-size=1800` 으로 MySQL 여유 확보.
- Nginx Brotli 추가.
- 아이콘 이모지 → SVG.

---

## 출시 전 체크리스트

**블로킹 해소 전까지 출시 금지:**
- [ ] Gmail 앱 비밀번호 즉시 재발급, DB 비밀번호 rotate, git 히스토리 scrub (C3)
- [ ] `isomorphic-dompurify` 설치 + 모든 HTML 출력 sanitize (C1)
- [ ] credential 로그 제거 (C4)
- [ ] 관리자 비밀번호 20자 이상 랜덤 (C7)
- [ ] `CAPTCHA_SECRET`, `NEXTAUTH_SECRET` 32바이트 hex (C8)
- [ ] `.env.example` 생성 (C9)
- [ ] `bodySizeLimit: 15mb` + per-file 제한 (C5, C6)
- [ ] SQL 콘솔 프로덕션 차단 (C2)
- [ ] board/write에 grantXxx 체크 (H12)
- [ ] 인증 rate limit (H4, H6)
- [ ] /privacy, /terms 페이지 (H8)
- [ ] PM2 ecosystem + pm2-logrotate (H10, M2)
- [ ] mysqldump daily cron + weekly offsite (H9)
- [ ] favicon 확인 (M6)
- [ ] nginx 레거시 리다이렉트 병합 (H1)
- [ ] 비밀번호 변경 시 세션 무효화 (H2)
- [ ] sitemap revalidate + public 필터 (H5)
- [ ] openGraph metadata (H7)
- [ ] MySQL slow query log (M3)

**출시 당일:**
- [ ] DNS A 레코드 + 전파 확인
- [ ] certbot SSL 발급 (HTTPS + www 포함)
- [ ] `.env` NEXTAUTH_URL/SITE_URL을 https로 업데이트 + 재빌드
- [ ] Google Search Console에 sitemap 제출
- [ ] 2시간 동안 `pm2 logs`, `/var/log/nginx/error.log`, `free -h`, `df -h` 모니터링
