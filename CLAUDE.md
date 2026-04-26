# CLAUDE.md — 동천교회 홈페이지 프로젝트

Claude Code 에이전트가 이 저장소에서 작업할 때 **반드시** 지킬 규칙.

## 배포 방식 (확정 — 2026-04-26 변경)

**git push + 서버 git pull 방식**. tar.gz delta 는 **만들지 않음**.

### Claude 가 할 일 (전부)

1. 요청된 수정 반영
2. 한국어 커밋 메시지로 commit
3. `git push origin main`

이걸로 끝. **압축파일(tar.gz) 만들지 않음**. 사용자가 서버에서 직접 받음.

### 사용자가 서버에서 실행 (한 줄)

```bash
dcup
```

(`~/dc-update.sh` → `~/pkistdc/scripts/git-deploy.sh` 호출)

자동으로:
1. `git fetch + reset --hard origin/main`
2. `package*.json` 변경 시 `npm ci`
3. `prisma/schema.prisma` 변경 시 `prisma generate + db push`
4. `.next` 삭제 + `npm run build`
5. `pm2 restart pkistdc` + `pm2 flush`
6. 5초 후 헬스 체크 (pm2 status + 에러 로그)

이미 최신이면 빌드/재시작 생략. 강제하려면 `dcup --force`.

### 금지

- **tar.gz delta 만들지 않음** — `dc-YYYYMMDD*.tar.gz` 같은 파일 더 이상 생성 X
- 로컬에서 `npm run build` 해서 `.next/` 를 서버로 보내지 않음 (서버에서 빌드)
- `apply-delta.sh` 도 사용 안 함 (git-deploy.sh 가 대체)

### GitHub 저장소

- URL: https://github.com/hk9472-sketch/dongcheon-church
- 가시성: **public** (인증 없이 git fetch 가능)
- `.env`, `data/`, `node_modules/`, `.next/` 는 `.gitignore` 라 노출되지 않음

### 롤백

```bash
cd ~/pkistdc
git log --oneline -10                      # 직전 커밋 SHA 확인
git reset --hard <이전_SHA>
rm -rf .next && npm run build && pm2 restart pkistdc
```

## PM2 프로세스 이름

**`pkistdc`** (`dongcheon` 아님). `ecosystem.config.js` 의 `name` 필드는 무시 — 서버에 이미 `pkistdc` 로 등록돼 있음. 모든 명령·문서에서 `pkistdc` 고정.

```bash
pm2 restart pkistdc
pm2 logs pkistdc --lines 30 --nostream
pm2 status
```

## 서버 앱 경로

- 운영 서버 앱 루트: `~/pkistdc` (= `/home/hk9472/pkistdc`)
- 개발 PC 저장소 루트: `d:\Works\Christ\pkistdc_new\dongcheon-church`

## 중요 환경변수 (`.env`)

서버 `.env` 에 포함돼 있어야 할 키 (없으면 기능 동작 안 함):

- `DATABASE_URL` — MySQL 접속
- `CAPTCHA_SECRET` — 자동입력 방지
- `RRN_ENCRYPTION_KEY` — 주민등록번호 AES-256-GCM 키 (기부자 정보 기능)
- `ENABLE_SQL_CONSOLE=true` — SQL 실행 허용 (선택)
- `UPLOAD_DIR` — 업로드 루트 세그먼트 (선택, 기본 "data")
- `SITE_URL` — 절대 URL 생성용
- SMTP 관련 (회원가입 인증 메일)

## Git 규칙

- `main` 브랜치만 사용 — PR 없이 바로 push
- 한국어 커밋 메시지, 구조:
  ```
  <한줄 요약 — 무엇을 왜>

  <상세 설명 — 원인/수정/영향>
  ```
- 로컬 CRLF 경고는 무시 (Windows 개발 환경)

## 쿠키 Secure 플래그

서버가 HTTP 배포 중이므로 `isSecureRequest(request)` 로 동적 판정 (`src/lib/cookieSecure.ts`). 하드코딩 금지:

- ❌ `secure: process.env.NODE_ENV === "production"` (잘못된 방식)
- ✅ `secure: isSecureRequest(request)` (HTTPS 요청일 때만 true)

## 업로드 경로 헬퍼 (`src/lib/uploadPath.ts`)

Turbopack 의 file pattern 경고 회피를 위해 **`path.join` / `path.resolve` 사용 금지**:

- ✅ `[cwd, seg, sub].join(path.sep)` + `path.normalize(...)` (단일 인수)
- ❌ `path.join(cwd, "data", sub)` — Turbopack 이 추적해 "matches 15000+ files" 경고

## 카운터 증감 쿼리

Prisma 5+ 는 `updateMany` 도 `@updatedAt` 을 자동 갱신한다. 게시글 조회/추천/댓글수/다운로드 증감은 **원시 SQL 로**:

- ❌ `prisma.post.updateMany({ data: { hit: { increment: 1 } }})`
- ✅ `prisma.$executeRaw`UPDATE posts SET hit = hit + 1 WHERE id = ${id}``

본문 수정(`write/modify`)만 `prisma.post.update` 허용 — updatedAt 갱신 필요.

## 게시판 규칙

- `isNotice=true` 글은 번호·페이지네이션 계산에서 제외 (공지 고정)
- 비회원 글쓰기: `grantWrite=99` 일 때 허용 (관리자 페이지의 "비회원 글쓰기 일괄 허용" 버튼)
- 비회원 글 수정·삭제: 작성 시 입력한 비밀번호 검증
- 답글(reply) / 수정(modify): `Board` 행 `FOR UPDATE` 락 후 `headnum/arrangenum` 계산

## 회계 · 연보

- 기부자 주민번호는 **AES-256-GCM 암호화** 후 `OfferingMember.residentNumber` 저장 (`src/lib/rrnCrypto.ts`)
- 기부금영수증 서식은 **국세청 서식 29호** 기반 (`src/app/accounting/offering/receipt/page.tsx`)
- 소속증명서는 별도 페이지 (`src/app/accounting/offering/certificate/page.tsx`)

## 기타 약속

- UI 텍스트는 한국어
- 이모지는 꼭 필요할 때만 (영수증 서식 같은 공식 문서엔 금지)
- 새 파일 생성보다 기존 파일 편집 우선
- 서버 로그 문제 추정은 사용자에게 **구체 명령** 을 주어 확인 후 대응 (추측 지양)
