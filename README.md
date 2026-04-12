# 동천교회 홈페이지

제로보드(Zeroboard) 4.1 pl8 → Next.js 16 마이그레이션 프로젝트.

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript |
| ORM | Prisma (MySQL) |
| 스타일 | Tailwind CSS 4 |
| 인증 | 쿠키 기반 세션 (bcrypt) |
| 파일 처리 | sharp (썸네일 생성) |
| 배포 | Docker + Nginx |

## 프로젝트 구조

```
dongcheon-church/
├── prisma/
│   ├── schema.prisma          # DB 스키마 (제로보드 테이블 매핑)
│   └── seed.ts                # 초기 데이터
├── scripts/
│   └── migrate-data.ts        # 제로보드 → 신규 DB 마이그레이션
├── src/
│   ├── app/
│   │   ├── admin/             # 관리자 페이지
│   │   │   ├── boards/        # 게시판 관리/생성/수정
│   │   │   ├── members/       # 회원 관리
│   │   │   └── skins/         # 스킨 관리 (17종)
│   │   ├── api/
│   │   │   ├── admin/         # 관리자 API
│   │   │   ├── auth/          # 로그인/로그아웃/회원가입/세션
│   │   │   ├── board/         # 글쓰기/댓글/추천/삭제
│   │   │   ├── download/      # 파일 다운로드
│   │   │   └── thumbnail/     # 썸네일 생성 (sharp)
│   │   ├── auth/              # 로그인/회원가입 페이지
│   │   ├── board/
│   │   │   └── [boardId]/
│   │   │       ├── page.tsx       # 목록 (zboard.php)
│   │   │       ├── gallery/       # 갤러리 뷰
│   │   │       ├── [postId]/      # 상세 (view.php)
│   │   │       ├── write/         # 글쓰기 (write.php)
│   │   │       └── layout.tsx     # 스킨 자동 적용
│   │   └── sitemap.xml/       # 동적 사이트맵
│   ├── components/
│   │   ├── board/             # Pagination, SearchBar, Comments, SkinProvider
│   │   └── layout/            # Header, Footer
│   ├── lib/
│   │   ├── auth.ts            # 인증 (bcrypt + 레거시 PASSWORD() 호환)
│   │   ├── board-config.ts    # 게시판 7개 설정
│   │   ├── db.ts              # Prisma 싱글턴
│   │   ├── skins.ts           # 스킨 레지스트리 (17종)
│   │   └── utils.ts           # 제로보드 lib.php 유틸 포팅
│   ├── middleware.ts          # 레거시 URL 리다이렉트
│   └── types/index.ts
├── nginx/                     # Nginx 리버스 프록시 설정
├── Dockerfile                 # 프로덕션 빌드
├── docker-compose.yml         # 원클릭 배포
└── public/
    ├── skins/                 # 17개 스킨 프리뷰 디렉토리
    ├── uploads/               # 첨부파일 저장소
    └── robots.txt
```

## 빠른 시작 (로컬 개발)

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 설정
cp .env.example .env
# .env 파일에서 DATABASE_URL 수정 (MySQL 필요)

# 3. DB 초기화
npx prisma generate
npx prisma db push
npx prisma db seed

# 4. 개발 서버 실행
npm run dev
# → http://localhost:3000

# 관리자 계정: admin / admin1234
```

## Docker 배포

```bash
# 1. 환경 변수 설정
cp .env.example .env
# .env 파일에서 비밀번호 변경

# 2. 빌드 & 실행
docker compose up -d

# 3. DB 초기화 (최초 1회)
docker compose exec app npx prisma db push
docker compose exec app npx prisma db seed

# 4. 접속
# → http://localhost:3000

# SSL 포함 배포 (Nginx):
docker compose --profile with-nginx up -d
```

## SSL 인증서 설정

```bash
# 1. Certbot으로 인증서 발급
sudo certbot certonly --standalone -d pkistdc.net

# 2. 인증서를 nginx/ssl/ 에 복사
cp /etc/letsencrypt/live/pkistdc.net/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/pkistdc.net/privkey.pem nginx/ssl/

# 3. Nginx 프로파일로 실행
docker compose --profile with-nginx up -d
```

## 제로보드 데이터 마이그레이션

```bash
# .env 파일에 레거시 DB 정보 설정 후:
npx tsx scripts/migrate-data.ts

# 마이그레이션 내용:
# - zetyx_member_table → users (비밀번호: 첫 로그인 시 bcrypt 자동 변환)
# - zetyx_board_{name} → posts (headnum/arrangenum 답글 트리 보존)
# - zetyx_board_comment_{name} → comments
# - zetyx_get_memo → messages
# - EUC-KR → UTF-8 인코딩 자동 변환
```

## URL 매핑 (레거시 → 신규)

| 제로보드 URL | 새 URL | 상태 |
|-------------|--------|------|
| `/bbs/zboard.php?id=DcNotice` | `/board/DcNotice` | 301 리다이렉트 |
| `/bbs/view.php?id=DcNotice&no=123` | `/board/DcNotice/123` | 301 리다이렉트 |
| `/bbs/write.php?id=DcNotice` | `/board/DcNotice/write` | 301 리다이렉트 |
| `/bbs/login.php` | `/auth/login` | 301 리다이렉트 |
| `/bbs/admin.php` | `/admin` | 301 리다이렉트 |

Middleware + Nginx 양쪽에서 처리하여 검색엔진 색인이 보존됩니다.

## 스킨 시스템

17종 제로보드 스킨을 CSS 변수 기반으로 포팅:

| 유형 | 스킨 수 | 스킨 목록 |
|------|---------|-----------|
| BBS | 8 | HOJINnaraBBS, jeju_bbs, nzeo_ver4_bbs, zbXE_style_bbs, zero_white, zero_cyan, zero_lightred, happycast_sky |
| Gallery | 2 | daerew_BASICgallery, daerew_BASICgallery_GD |
| Music | 3 | daerew_music, dasom_music_white, loy_music |
| Vote | 1 | zero_vote |
| Download | 1 | nzeo_ver4_download |
| Web | 1 | zbXE_style_web |
| Multi | 1 | muti_board |

관리자 페이지에서 게시판 생성/수정 시 스킨을 선택하면 해당 색상/폰트/모서리가 자동 적용됩니다.

## 게시판 목록

| 게시판 ID | 이름 | 유형 |
|-----------|------|------|
| DcNotice | 공지사항 | BBS |
| DcPds | 자료실 | BBS |
| DcHistory | 기록실 | BBS |
| DcStudy | 연구실 | BBS |
| DcCouncil | 권찰회 | BBS |
| DcQuestion | 문답방 | BBS |
| DcElement | 주일학교 | BBS |

관리자 페이지(`/admin/boards/create`)에서 추가 게시판 생성 가능.

## 관리자 기능

- **대시보드**: 게시판/회원/글/댓글 통계
- **게시판 관리**: CRUD + 스킨 변경 + 권한 설정 (레벨 1~10)
- **스킨 관리**: 17종 스킨 브라우저, 색상 프리뷰
- **회원 관리**: 검색, 레벨/권한 확인

## 보안 참고

- 관리자 계정 비밀번호를 반드시 변경하세요
- `.env` 파일의 `NEXTAUTH_SECRET`을 랜덤 문자열로 설정하세요
- 프로덕션에서는 반드시 HTTPS를 사용하세요
- 레거시 MySQL `PASSWORD()` 해시는 첫 로그인 시 bcrypt로 자동 마이그레이션됩니다
