# CLAUDE.md — 동천교회 홈페이지 프로젝트

Claude Code 에이전트가 이 저장소에서 작업할 때 **반드시** 지킬 규칙.

## 배포 방식 (확정)

**delta 패키지 방식** — 변경된 파일만 tar.gz 로 묶어 사용자에게 전달. 사용자가 서버로 옮기고 `apply-delta.sh` 로 적용.

### Claude 가 할 일

1. 요청된 수정 반영 → 커밋 → 원격 푸시 (git 기록은 계속 유지)
2. 이번 커밋에서 **변경·추가된 파일만** tar.gz 로 묶기
    - 빌드 산출물(`.next/`) 포함 **금지**
    - `node_modules/` 포함 **금지**
    - `.env`, `data/`, `.git/` 포함 **금지**
3. 파일명 규칙: **`dc-YYYYMMDD.tar.gz`** (고정)
    - 예: `dc-20260419.tar.gz`
    - 같은 날 여러 번 배포 시: `dc-20260419a.tar.gz`, `dc-20260419b.tar.gz` …
    - 설명 suffix(예: `-image-resize`) 사용하지 않음
4. 아카이브는 저장소 부모 디렉터리(`d:/Works/Christ/pkistdc_new/`)에 생성
5. 서버에 필요한 후처리(schema 변경, 의존성 변경 등)를 **간단히 안내**

### 금지

- 전체 tar (`.next/` 포함한 8MB+짜리) 는 더 이상 만들지 않는다 — 교차 플랫폼 빌드 불일치 재발 우려
- 로컬에서 `npm run build` 해서 `.next/` 를 서버로 보내지 않는다
- **`apply-delta.sh` 를 Claude 가 실행하려 하지 않는다** — 사용자가 직접 서버에서 실행

### 파일 목록 결정 방법

```bash
# 이번 커밋에서 변경된 파일 (신규 + 수정, 삭제는 수동 처리)
git diff-tree --no-commit-id --name-only --diff-filter=AM -r HEAD

# 여러 커밋 범위 (이전 배포 지점부터)
git diff --name-only --diff-filter=AM <이전커밋>..HEAD
```

Claude 는 tar 를 만들기 전 이 목록을 사용자에게 보여 주고 확인 후 진행한다.

### tar 예시

```bash
# 저장소 루트에서
tar -czf ../delta-YYYYMMDD-<설명>.tar.gz \
  src/components/board/ResizableImage.tsx \
  src/components/board/TipTapEditor.tsx \
  deploy.sh
```

상대 경로가 저장소 루트 기준이면 서버 앱 루트(`~/pkistdc`)에서 그대로 전개해도 구조가 맞다.

### 파일명 규칙 (엄수)

- 형식: **`dc-YYYYMMDD.tar.gz`**
- 포맷: 소문자 `dc-` + ISO 날짜(하이픈 없이 8자리) + `.tar.gz`
- 같은 날 2번 이상 배포 시: `dc-YYYYMMDDa.tar.gz`, `dc-YYYYMMDDb.tar.gz` … (알파벳 소문자 접미)
- 설명/브랜치/이슈번호 등 추가 문자열 **절대 금지** — 파일명만 보고 날짜만 분별 가능해야 함
- 압축 포맷은 항상 `gzip` (tar.gz). `zip`, `7z`, `xz` 등은 사용하지 않음
- 경로는 항상 저장소 부모 디렉터리 (`d:/Works/Christ/pkistdc_new/dc-YYYYMMDD.tar.gz`)
- Claude 는 새 아카이브 생성 전에 **기존 같은 이름이 있는지 확인**하고, 있으면 suffix(a/b/c…) 붙임

## 서버 반영 절차 (사용자가 실행)

```bash
# 1) 로컬 → 서버 전송
scp d:/Works/Christ/pkistdc_new/delta-YYYYMMDD-xxx.tar.gz hk9472@35.212.199.48:~/

# 2) 서버에서 적용
ssh hk9472@35.212.199.48
cd ~/pkistdc
./apply-delta.sh ~/delta-YYYYMMDD-xxx.tar.gz
```

`apply-delta.sh` 가 자동으로:
1. 아카이브 전개 + 이전 파일 백업
2. `prisma/schema.prisma` 변경 감지 시 `prisma generate` + `db push`
3. `package(-lock).json` 변경 감지 시 `npm ci`
4. `.next` 삭제 + `npm run build`
5. `pm2 restart pkistdc` + `pm2 flush`
6. 5초 후 에러 로그 자동 확인

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
