# 동천교회 홈페이지 — 배포 및 운영 가이드

> **대상**: 개발 완료 후 운영 서버에 배포하거나, 기존 환경을 유지보수하는 관리자
> **권장 배포**: **리눅스 + Docker Compose** (가장 간단하고 안정적)

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택 및 환경 정보](#2-기술-스택-및-환경-정보)
3. [서버 요구사항](#3-서버-요구사항)
4. [환경 변수 (.env) 설정](#4-환경-변수-env-설정)
5. [배포 방법 A — Docker Compose (권장)](#5-배포-방법-a--docker-compose-권장)
6. [배포 방법 B — 리눅스 직접 설치](#6-배포-방법-b--리눅스-직접-설치)
7. [배포 방법 C — Windows 서버](#7-배포-방법-c--windows-서버)
8. [첨부파일(data/) 이관](#8-첨부파일data-이관)
9. [ZeroBoard 데이터 마이그레이션](#9-zeroboard-데이터-마이그레이션)
10. [SSL 인증서 설정](#10-ssl-인증서-설정)
11. [관리자 기능 안내](#11-관리자-기능-안내)
12. [DB 관리 도구](#12-db-관리-도구)
13. [배포 후 체크리스트](#13-배포-후-체크리스트)
14. [업데이트 방법](#14-업데이트-방법)
15. [문제 해결](#15-문제-해결)
16. [프로젝트 파일 구조](#16-프로젝트-파일-구조)

---

## 1. 프로젝트 개요

동천교회 홈페이지는 기존 **제로보드(ZeroBoard) 4.1 pl8** 기반 사이트를 현대적인 **Next.js** 프레임워크로 전면 재구축한 프로젝트입니다.

### 주요 기능

| 기능 | 설명 |
|------|------|
| **게시판 시스템** | 일반(BBS), 갤러리, 자료실, 투표 등 다양한 유형 지원 |
| **회원 관리** | 가입, 로그인, 이메일 인증, 비밀번호 초기화 |
| **이관 회원 지원** | 제로보드 기존 회원의 첫 로그인 시 비밀번호 재설정 플로우 |
| **권찰회 출석부** | 부서/구역/교인 관리, 출석 기록, 보고서, 통계 |
| **WYSIWYG 에디터** | TipTap 기반 리치 텍스트 편집 (게시글 + 댓글) |
| **테마/색상 관리** | 프리셋 4종 + 직접 색상 선택 + 실시간 미리보기 |
| **보안** | 수학 CAPTCHA, 게시판 권한 제어, 비밀글, 관리자 등급 |
| **DB 관리** | 백업/복원, SQL 실행, 테이블 구조 조회 |
| **방문자 통계** | 일별 방문자 카운트, 방문 로그 기록 |
| **레거시 URL 호환** | 제로보드 URL → 새 URL 301 리다이렉트 (Nginx + Next.js) |

### 페이지 구성

| 영역 | 페이지 수 | 주요 경로 |
|------|----------|----------|
| 메인 | 1 | `/` |
| 인증 (로그인/가입 등) | 5 | `/auth/login`, `/auth/register`, `/auth/profile` 등 |
| 게시판 | 4 | `/board/[boardId]`, `/board/[boardId]/[postId]`, `/board/[boardId]/write`, `/board/[boardId]/gallery` |
| 권찰회 | 5 | `/council`, `/council/manage`, `/council/grade`, `/council/report`, `/council/summary` |
| 관리자 | 11 | `/admin`, `/admin/boards`, `/admin/members`, `/admin/settings`, `/admin/db`, `/admin/backup` 등 |
| API 엔드포인트 | 43 | 인증 10, 게시판 11, 관리자 11, 권찰회 7, 파일 3, 기타 1 |

### 기본 게시판 (초기 데이터)

| 게시판 ID | 이름 | 유형 |
|-----------|------|------|
| `DcNotice` | 공지사항 | 일반(BBS) |
| `DcPds` | 자료실(설교재독) | 자료실(DOWNLOAD) |
| `DcHistory` | 기록실 | 일반(BBS) |
| `DcStudy` | 연구실 | 일반(BBS) |
| `DcCouncil` | 권찰회 | 일반(BBS) |
| `DcQuestion` | 문답방 | 일반(BBS) |
| `DcElement` | 주일학교 | 일반(BBS) |

### 권한 체계

| 등급 | isAdmin 값 | level 값 | 설명 |
|------|-----------|---------|------|
| 최고 관리자 | 1 | 1 | 모든 기능 접근 가능 |
| 그룹 관리자 | 2 | 1~9 | 해당 그룹 게시판 관리 |
| 일반 회원 | 3 | 10 | 게시판 권한에 따라 접근 |
| 비회원(비로그인) | - | 99 | 공개 게시판만 열람 |

> 게시판 권한: `userLevel <= grantXxx` 이면 허용 (숫자가 낮을수록 높은 권한)

---

## 2. 기술 스택 및 환경 정보

### 2-1. 프레임워크 및 라이브러리

| 분류 | 기술 | 버전 | 용도 |
|------|------|------|------|
| 프레임워크 | **Next.js** (App Router) | 16.1.x | React 기반 풀스택 프레임워크, standalone 빌드 |
| 언어 | **TypeScript** | 5.9.x | 타입 안전한 개발 |
| 런타임 | **Node.js** | 20.x LTS | JavaScript 서버 실행 환경 |
| DB ORM | **Prisma** | 6.19.x | MySQL 스키마 관리 + 쿼리 빌더 |
| DB 드라이버 | **mysql2** | 3.18.x | Prisma 내부 및 Raw SQL용 |
| UI 스타일 | **Tailwind CSS** | 4.x | 유틸리티 기반 CSS 프레임워크 |
| WYSIWYG 에디터 | **TipTap** | @tiptap/react 3.20.x | 게시글/댓글 리치 텍스트 편집 |
| 이미지 처리 | **sharp** | 0.34.x | 썸네일 생성 (네이티브 모듈) |
| 이메일 발송 | **nodemailer** | 7.x | Gmail SMTP 통한 메일 발송 |
| 파일 압축 | **archiver** | 7.x | DB 백업 파일 ZIP 압축 |
| 암호화 | **bcryptjs** | 3.x | 비밀번호 해싱 |
| React | **React** | 19.2.x | UI 컴포넌트 라이브러리 |

### 2-2. 인프라 소프트웨어

| 소프트웨어 | 버전 | 용도 | 설치 방법 |
|-----------|------|------|----------|
| **Node.js** | 20.x LTS | 앱 실행 환경 | [nodejs.org](https://nodejs.org) 또는 `nvm install 20` |
| **MySQL** | 8.0+ | 관계형 데이터베이스 | Docker 이미지 `mysql:8.0` 또는 직접 설치 |
| **mysqldump** | MySQL과 동일 | DB 백업용 CLI 도구 | MySQL Server에 포함, 별도 설치 시 [MySQL Community](https://dev.mysql.com/downloads/mysql/) ZIP 다운로드 → `bin/` PATH 등록 |
| **Nginx** | latest | 리버스 프록시 + SSL 종단 | Docker 이미지 `nginx:alpine` 또는 `apt install nginx` |
| **Docker** | 24.x+ | 컨테이너 배포 (권장) | [Docker 공식](https://get.docker.com) |
| **Docker Compose** | 2.x+ | 멀티 컨테이너 관리 | Docker에 포함 |
| **PM2** | latest | Node.js 프로세스 관리 (Docker 미사용 시) | `npm install -g pm2` |
| **Certbot** | latest | Let's Encrypt SSL 인증서 발급 | `apt install certbot` |

### 2-3. 데이터베이스 스키마 (17개 테이블)

| 테이블 | 설명 | 비고 |
|--------|------|------|
| `users` | 회원 정보 | 제로보드 zetyx_member_table 이관 |
| `groups` | 그룹 관리 | 게시판 그룹 |
| `boards` | 게시판 설정 | 스킨, 권한, 페이징 등 |
| `posts` | 게시글 | 모든 게시판 통합 (boardId로 구분) |
| `comments` | 댓글 | 게시글에 종속 |
| `categories` | 카테고리 | 게시판별 분류 |
| `messages` | 쪽지 | 회원 간 메시지 |
| `sessions` | 세션 | dc_session 쿠키 (7일 유효) |
| `password_resets` | 비밀번호 초기화 토큰 | 이메일 인증 기반 |
| `board_user_permissions` | 게시판별 사용자 권한 | 수정/삭제 개별 권한 |
| `visitor_counts` | 방문자 수 (일별 집계) | 날짜별 카운트 |
| `visit_logs` | 방문 로그 | IP, 경로, 유입 경로 |
| `site_settings` | 사이트 설정 | 테마 색상, 표어 등 key-value |
| `council_depts` | 권찰회 부서 | 장년반, 중간반 등 |
| `council_groups` | 권찰회 구역 | 1구역, 2구역 등 |
| `council_members` | 권찰회 교인 명단 | 구역별 교인 |
| `council_attendances` | 권찰회 출석 기록 | 예배별 출석/실시간 |

> DB 관리 방식: `prisma db push` 사용 (migration history 없음)

### 2-4. 인증 방식

| 항목 | 설명 |
|------|------|
| 세션 쿠키 | `dc_session` (7일 유효) |
| 세션 저장소 | `sessions` 테이블 (DB 기반) |
| 비밀번호 해싱 | bcryptjs |
| 이관 회원 | `legacyPwHash` 필드로 제로보드 비밀번호 보존 → 첫 로그인 시 재설정 유도 |
| 이메일 인증 | 회원가입 시 인증 토큰 발송 → 이메일 클릭으로 인증 완료 |
| CAPTCHA | 수학 문제 (HMAC-SHA256 서명, 외부 서비스 없음) |

---

## 3. 서버 요구사항

| 항목 | 최소 | 권장 |
|------|------|------|
| CPU | 1코어 | 2코어 이상 |
| 메모리 | 1GB | 2GB 이상 (빌드 시 4GB 권장) |
| 디스크 | 10GB | 20GB 이상 (첨부파일 포함) |
| OS | Ubuntu 20.04+ / Windows 10+ | Ubuntu 22.04 LTS |
| Node.js | 20.x | 20.x LTS |
| MySQL | 8.0 | 8.0+ |

---

## 4. 환경 변수 (.env) 설정

서버에서 `.env` 파일을 직접 작성합니다. **절대 소스와 함께 전송하지 마세요.**

### 4-1. 전체 변수 목록

| 변수 | 필수 | 설명 | 예시 |
|------|------|------|------|
| **`DATABASE_URL`** | Y | MySQL 연결 주소 | Docker: `mysql://dongcheon:비번@db:3306/dongcheon` / 직접설치: `...@localhost:3306/...` |
| **`NEXTAUTH_SECRET`** | Y | 세션 암호화 키 (32자+ 랜덤) | `openssl rand -hex 32` 결과 |
| **`NEXTAUTH_URL`** | Y | 사이트 접속 주소 | `https://pkistdc.net` |
| **`SITE_NAME`** | Y | 사이트 이름 | `동천교회` |
| **`SITE_URL`** | Y | 사이트 주소 | `https://pkistdc.net` |
| **`UPLOAD_DIR`** | Y | 파일 업로드 경로 | Docker: `/app/data` / 직접설치: `./data` |
| `MAX_UPLOAD_SIZE` | | 최대 업로드 크기 (바이트) | `10485760` (10MB) |
| `SMTP_HOST` | | 이메일 서버 | `smtp.gmail.com` |
| `SMTP_PORT` | | 이메일 포트 | `587` |
| `SMTP_USER` | | 발신 이메일 계정 | `your@gmail.com` |
| `SMTP_PASS` | | Gmail 앱 비밀번호 | 구글 계정 → 보안 → 앱 비밀번호 |
| `SMTP_FROM` | | 발신자 표시 | `동천교회 <noreply@pkistdc.net>` |
| `DB_ROOT_PASSWORD` | Docker | MySQL root 비밀번호 | 강한 값 사용 |
| `DB_NAME` | Docker | DB 이름 | `dongcheon` |
| `DB_USER` | Docker | DB 사용자 | `dongcheon` |
| `DB_PASSWORD` | Docker | DB 비밀번호 | 강한 값 사용 |
| `NEXT_PUBLIC_YOUTUBE_LIVE_URL` | | 실시간 예배 유튜브 채널 | `https://www.youtube.com/channel/...` |
| `NEXT_PUBLIC_FAITH_STUDY_URL` | | 목회연구 외부 사이트 | `https://pkists.net/` |
| `NEXT_PUBLIC_SINPUNG_CHURCH_URL` | | 신풍교회 URL | `http://pkist.net/s/` |
| `NEXT_PUBLIC_SONYANGWON` | | 손양원 유튜브 채널 | `https://www.youtube.com/...` |
| `NEXT_PUBLIC_REPLAY_URL` | | 다시보기 게시판 ID | `DcWsRePlay` |

> **Gmail 앱 비밀번호 발급**: Google 계정 → 보안 → 2단계 인증 활성화 → 앱 비밀번호 생성

### 4-2. `.env` 예시 (Docker Compose 기준)

```env
# ---- 데이터베이스 (Docker 내부 서비스명 'db' 사용) ----
DATABASE_URL="mysql://dongcheon:DB비밀번호!@db:3306/dongcheon"

# ---- 인증 ----
NEXTAUTH_URL="https://pkistdc.net"
NEXTAUTH_SECRET="여기에-openssl-rand-hex-32-결과를-붙여넣으세요"

# ---- 사이트 설정 ----
SITE_NAME="동천교회"
SITE_URL="https://pkistdc.net"
UPLOAD_DIR="/app/data"
MAX_UPLOAD_SIZE=10485760

# ---- 이메일 (비밀번호 초기화, 이메일 인증에 사용) ----
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="발신이메일@gmail.com"
SMTP_PASS="Gmail앱비밀번호"
SMTP_FROM="동천교회 <noreply@pkistdc.net>"

# ---- 외부 링크 (푸터/메뉴에 표시) ----
NEXT_PUBLIC_YOUTUBE_LIVE_URL="https://www.youtube.com/channel/유튜브채널ID"
NEXT_PUBLIC_FAITH_STUDY_URL="https://pkists.net/"
NEXT_PUBLIC_SINPUNG_CHURCH_URL="http://pkist.net/s/"
NEXT_PUBLIC_SONYANGWON="https://www.youtube.com/@sonyangwon"
NEXT_PUBLIC_REPLAY_URL="DcWsRePlay"

# ---- Docker MySQL ----
DB_ROOT_PASSWORD=루트비밀번호!
DB_NAME=dongcheon
DB_USER=dongcheon
DB_PASSWORD=DB비밀번호!
```

### 4-3. `.env` 예시 (직접 설치 기준)

```env
DATABASE_URL="mysql://dongcheon:DB비밀번호!@localhost:3306/dongcheon"
NEXTAUTH_URL="https://pkistdc.net"
NEXTAUTH_SECRET="여기에-openssl-rand-hex-32-결과를-붙여넣으세요"
SITE_NAME="동천교회"
SITE_URL="https://pkistdc.net"
UPLOAD_DIR="./data"
MAX_UPLOAD_SIZE=10485760

SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="발신이메일@gmail.com"
SMTP_PASS="Gmail앱비밀번호"
SMTP_FROM="동천교회 <noreply@pkistdc.net>"

NEXT_PUBLIC_YOUTUBE_LIVE_URL="https://www.youtube.com/channel/유튜브채널ID"
NEXT_PUBLIC_FAITH_STUDY_URL="https://pkists.net/"
NEXT_PUBLIC_SINPUNG_CHURCH_URL="http://pkist.net/s/"
NEXT_PUBLIC_SONYANGWON="https://www.youtube.com/@sonyangwon"
NEXT_PUBLIC_REPLAY_URL="DcWsRePlay"
```

---

## 5. 배포 방법 A — Docker Compose (권장)

MySQL + Next.js 앱 + Nginx(SSL)가 모두 포함되는 가장 간단한 배포 방법입니다.

### Docker Compose 구성

```
┌──────────────────────────────────────────────────┐
│  Docker Compose                                  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Nginx   │→ │  Next.js  │→ │  MySQL 8.0   │   │
│  │  :80/443 │  │  :3000    │  │  :3306       │   │
│  └──────────┘  └──────────┘  └──────────────┘   │
│  (선택적-SSL)    standalone     데이터 볼륨      │
└──────────────────────────────────────────────────┘
```

### 5-1. Docker 설치 (Ubuntu/Debian)

```bash
# Docker 공식 설치 스크립트
curl -fsSL https://get.docker.com | sh

# 현재 사용자를 docker 그룹에 추가 (sudo 없이 사용)
sudo usermod -aG docker $USER
newgrp docker

# 설치 확인
docker --version          # Docker version 24.x+
docker compose version    # Docker Compose version v2.x+
```

### 5-2. 프로젝트 전송

```bash
# 개발 PC에서 실행 (불필요한 파일 제외하고 전송)
rsync -avz \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='data' \
  --exclude='.env' \
  --exclude='.git' \
  ./dongcheon-church/ 사용자@서버IP:/home/사용자/dongcheon-church/
```

### 5-3. `.env` 파일 생성

```bash
cd /home/사용자/dongcheon-church
nano .env   # 4-2절 내용으로 작성
```

### 5-4. SSL 인증서 발급 (도메인이 있을 때)

> Nginx를 올리기 전에 standalone 모드로 먼저 발급해야 합니다.

```bash
# certbot 설치
sudo apt install -y certbot

# 인증서 발급 (80포트가 열려 있어야 함)
sudo certbot certonly --standalone -d pkistdc.net -d www.pkistdc.net

# 인증서를 프로젝트 폴더에 복사
mkdir -p /home/사용자/dongcheon-church/nginx/ssl
sudo cp /etc/letsencrypt/live/pkistdc.net/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/pkistdc.net/privkey.pem nginx/ssl/
sudo chown $USER:$USER nginx/ssl/*.pem
```

### 5-5. 컨테이너 실행

```bash
cd /home/사용자/dongcheon-church

# SSL 없이 (HTTP만, 테스트용)
docker compose up -d

# SSL + Nginx 포함 (도메인 + 인증서 준비된 경우)
docker compose --profile with-nginx up -d

# 빌드/실행 로그 확인
docker compose logs -f app
# "Ready on http://0.0.0.0:3000" 메시지 확인 후 다음 단계
```

### 5-6. DB 초기화 (최초 1회)

```bash
# MySQL이 완전히 시작될 때까지 대기 (약 30초)
docker compose logs db | grep "ready for connections"

# DB 테이블 생성
docker compose exec app npx prisma db push

# 초기 데이터 (관리자 계정 admin/admin1234 + 기본 게시판 7개)
docker compose exec app npx prisma db seed
```

> **기존 DB에서 마이그레이션하는 경우** `prisma db seed` 대신 DB 덤프를 직접 복원하세요.

### 5-7. 첨부파일 복사

```bash
# data/ 폴더를 컨테이너 볼륨에 복사
docker compose cp data/. app:/app/data/

# 복사 확인
docker compose exec app ls /app/data/
# DcPds, PkGallery, DcNotice 등 폴더가 보이면 정상
```

### 5-8. DB 칼럼 COMMENT 추가 (선택)

DB 테이블과 칼럼에 한국어 설명을 추가하여 향후 관리를 편리하게 합니다.

```bash
docker compose exec app npx tsx scripts/add-column-comments.ts
```

### 5-9. 접속 확인

```bash
# 앱 상태 확인
curl http://localhost:3000

# 브라우저 접속
# HTTP:  http://서버IP:3000
# HTTPS: https://pkistdc.net  (Nginx + SSL 설정 후)

# 기본 관리자 계정
# ID: admin / 비밀번호: admin1234
```

---

## 6. 배포 방법 B — 리눅스 직접 설치

Docker 없이 서버에 직접 설치하는 방법입니다.

### 6-1. 필수 소프트웨어 설치

```bash
# ---- Node.js 20 LTS ----
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x.x

# ---- sharp 빌드에 필요한 네이티브 라이브러리 ----
sudo apt install -y build-essential

# ---- MySQL 8 ----
sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql

# ---- mysqldump (DB 백업용, MySQL Server에 포함) ----
which mysqldump   # /usr/bin/mysqldump 확인

# ---- PM2 (프로세스 관리자) ----
sudo npm install -g pm2

# ---- Nginx (리버스 프록시) ----
sudo apt install -y nginx
```

### 6-2. MySQL DB 생성

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE dongcheon CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'dongcheon'@'localhost' IDENTIFIED BY '강한DB비밀번호!';
GRANT ALL PRIVILEGES ON dongcheon.* TO 'dongcheon'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 6-3. 프로젝트 설치 및 빌드

```bash
cd /home/사용자/dongcheon-church

# 의존성 설치
npm install

# 환경 변수 설정
nano .env   # 4-3절 내용으로 작성

# Prisma 클라이언트 생성
npx prisma generate

# DB 테이블 생성
npx prisma db push

# 초기 데이터 (관리자 계정 admin/admin1234 + 기본 게시판 7개)
npx prisma db seed

# DB 칼럼 COMMENT 추가 (선택)
npx tsx scripts/add-column-comments.ts

# 프로덕션 빌드
npm run build
# 메모리 부족 시: NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

### 6-4. PM2로 앱 실행

```bash
# 앱 시작
pm2 start npm --name "dongcheon" -- start

# 현재 PM2 목록에 저장 (재부팅 시 자동 복원)
pm2 save

# 시스템 부팅 시 PM2 자동 시작 등록
pm2 startup
# → 출력되는 sudo 명령어를 복사해서 실행

# 상태 확인
pm2 status
pm2 logs dongcheon
```

### 6-5. Nginx 리버스 프록시 설정

```bash
sudo nano /etc/nginx/sites-available/dongcheon
```

```nginx
server {
    listen 80;
    server_name pkistdc.net www.pkistdc.net;

    client_max_body_size 10M;

    # 기존 ZeroBoard 이미지 직접 서빙 (레거시 URL 호환)
    location /bbs/data/ {
        alias /home/사용자/dongcheon-church/data/;
        expires 30d;
        add_header Cache-Control "public";
    }

    # 스킨 프리뷰 이미지
    location /skins/ {
        alias /home/사용자/dongcheon-church/public/skins/;
        expires 30d;
        add_header Cache-Control "public";
    }

    # Next.js 앱
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

```bash
# 설정 활성화
sudo ln -s /etc/nginx/sites-available/dongcheon /etc/nginx/sites-enabled/

# 기본 설정 충돌 제거
sudo rm -f /etc/nginx/sites-enabled/default

# 설정 검사 및 적용
sudo nginx -t
sudo systemctl reload nginx
```

### 6-6. SSL 인증서 (Certbot + Nginx)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pkistdc.net -d www.pkistdc.net

# 자동 갱신 확인 (90일마다 자동 갱신됨)
sudo certbot renew --dry-run
```

---

## 7. 배포 방법 C — Windows 서버

> Windows에서는 **Docker Desktop + Docker Compose** 방법이 훨씬 간편합니다.

### 7-1. Docker Desktop 사용 (권장)

1. [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) 설치
2. WSL2 백엔드 활성화 (설치 중 자동 안내)
3. PowerShell에서 [방법 A](#5-배포-방법-a--docker-compose-권장)와 동일하게 실행

### 7-2. 직접 설치 (Docker 없을 때)

**필수 소프트웨어 설치:**

| 소프트웨어 | 다운로드 | 비고 |
|-----------|---------|------|
| Node.js 20+ | [nodejs.org](https://nodejs.org) | LTS 버전, MSI 설치 |
| MySQL 8.0 | [MySQL Installer](https://dev.mysql.com/downloads/installer/) | Server + Workbench 포함 |
| mysqldump | MySQL Server에 포함 | 별도 설치: [MySQL Community ZIP](https://dev.mysql.com/downloads/mysql/) → `bin/` 폴더 PATH 등록 |
| PM2 | `npm install -g pm2` | 터미널에서 설치 |
| Visual C++ Build Tools | [Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) | sharp 네이티브 빌드용 |

**mysqldump 별도 설치 (MySQL Server가 없는 경우):**

1. [MySQL Community Server](https://dev.mysql.com/downloads/mysql/) 또는 [Archived Versions](https://downloads.mysql.com/archives/community/) 에서 ZIP Archive 다운로드
2. 원하는 위치에 압축 해제 (예: `C:\mysql`)
3. 시스템 환경 변수 PATH에 `C:\mysql\bin` 추가
4. 새 터미널에서 `mysqldump --version` 확인

```powershell
# 관리자 권한 PowerShell에서 실행

# 1. 프로젝트 폴더로 이동
cd C:\dongcheon-church

# 2. .env 파일 생성 (VS Code 또는 메모장으로 편집)
# DATABASE_URL에서 @db를 @localhost로 변경
# UPLOAD_DIR="./data"

# 3. 의존성 설치 및 빌드
npm install
npx prisma generate
npx prisma db push
npx prisma db seed
npm run build

# 4. PM2로 실행
npm install -g pm2
pm2 start npm --name "dongcheon" -- start
pm2 save

# PM2 Windows 서비스 등록 (재부팅 후 자동 시작)
npm install -g pm2-windows-startup
pm2-startup install
```

**방화벽 포트 개방:**
- Windows Defender 방화벽 → 고급 설정 → 인바운드 규칙 → 새 규칙
- 포트 80, 443, 3000 (외부 접근 필요한 경우)

---

## 8. 첨부파일(data/) 이관

첨부파일은 ZeroBoard의 `data/` 폴더 구조를 그대로 유지합니다.

### 폴더 구조

```
ZeroBoard 서버                   새 서버
/var/www/html/bbs/               /프로젝트루트/
  data/                            data/
    DcPds/                           DcPds/
      1257588572/                      1257588572/
        파일명.hwp          →           파일명.hwp
    PkGallery/                       PkGallery/
      1771155086/                      1771155086/
        1.jpg               →           1.jpg
    DcNotice/                        DcNotice/
    DcSermon/                        DcSermon/
    ...                              ...
```

### 이관 방법

```bash
# 방법 1: rsync (가장 빠름, 재실행 시 변경분만 전송)
rsync -avz /var/www/html/bbs/data/ 사용자@새서버IP:/프로젝트경로/data/

# 방법 2: tar 압축 후 전송
tar czf bbs_data.tar.gz -C /var/www/html/bbs data/
scp bbs_data.tar.gz 사용자@새서버IP:~

# 새 서버에서 압축 해제:
tar xzf ~/bbs_data.tar.gz -C /프로젝트경로/
```

> **중요**: 첨부파일은 `/api/download`(다운로드)와 `/api/image`(이미지 인라인 표시) API를 통해 서빙됩니다.
> Docker 사용 시 `data/` 볼륨이 `/app/data`에 마운트됩니다.

---

## 9. ZeroBoard 데이터 마이그레이션

제로보드 4.1의 데이터를 새 시스템으로 이관하는 스크립트가 포함되어 있습니다.

### 9-1. 마이그레이션 스크립트

| 스크립트 | 용도 | 실행 방법 |
|---------|------|----------|
| `scripts/migrate-data.ts` | 제로보드 게시글/회원/댓글 → 새 DB 이관 | `npm run migrate:data` |
| `scripts/import-visitor-count.js` | 방문자 수 이관 | `node scripts/import-visitor-count.js` |
| `scripts/add-column-comments.ts` | DB 테이블/칼럼 COMMENT 추가 | `npm run db:comments` |

### 9-2. 이관 회원 로그인

제로보드에서 이관된 회원은 `legacyPwHash` 필드에 기존 비밀번호 해시가 보존됩니다.

1. 이관 회원이 처음 로그인 시도 → 기존 비밀번호로 인증 실패
2. 시스템이 레거시 해시로 재인증 시도 (`/api/auth/migration-login`)
3. 인증 성공 시 → bcrypt로 비밀번호 재해싱 + `legacyPwHash` 제거
4. 이후 정상 로그인 가능

### 9-3. 제로보드 DB 호환성 참고

| 항목 | 제로보드 4.1 | 현재 시스템 |
|------|------------|-----------|
| DB | MySQL 3.x ~ 5.x | MySQL 8.0+ |
| 문자셋 | EUC-KR | UTF-8mb4 |
| 비밀번호 | MySQL PASSWORD() | bcrypt |
| PHP | PHP 4~5.2 | Node.js 20 (PHP 불필요) |

> MySQL 4/5 덤프를 MySQL 8에서 복원할 때 EUC-KR → UTF-8 변환이 필요합니다:
> ```bash
> iconv -f euc-kr -t utf-8 dump.sql > dump_utf8.sql
> mysql -u root -p dongcheon < dump_utf8.sql
> ```

---

## 10. SSL 인증서 설정

### Let's Encrypt (무료, 리눅스)

```bash
# certbot 설치
sudo apt install -y certbot

# Docker Compose + Nginx 방식
sudo certbot certonly --standalone -d pkistdc.net -d www.pkistdc.net

mkdir -p nginx/ssl
sudo cp /etc/letsencrypt/live/pkistdc.net/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/pkistdc.net/privkey.pem nginx/ssl/
sudo chown $USER:$USER nginx/ssl/*.pem

# Nginx 프로파일 포함 재시작
docker compose --profile with-nginx up -d

# 인증서 자동 갱신 (cron 등록)
echo "0 3 * * * certbot renew --quiet && \
  cp /etc/letsencrypt/live/pkistdc.net/*.pem /home/사용자/dongcheon-church/nginx/ssl/ && \
  docker compose -f /home/사용자/dongcheon-church/docker-compose.yml exec nginx nginx -s reload" \
  | sudo crontab -
```

### Nginx 도메인 수정

다른 도메인을 사용하는 경우 `nginx/nginx.conf`에서 변경:

```nginx
# 변경 전
server_name pkistdc.net www.pkistdc.net;

# 변경 후
server_name 내도메인.com www.내도메인.com;
```

### Nginx 레거시 URL 리다이렉트 (자동 적용)

`nginx/nginx.conf`에 제로보드 URL → 새 URL 301 리다이렉트가 설정되어 있습니다:

| 기존 URL | 새 URL |
|---------|--------|
| `/bbs/zboard.php?id=DcNotice` | `/board/DcNotice` |
| `/bbs/view.php?id=DcNotice&no=123` | `/board/DcNotice/123` |
| `/bbs/write.php?id=DcNotice` | `/board/DcNotice/write` |
| `/bbs/login.php` | `/auth/login` |
| `/bbs/admin.php` | `/admin` |
| `/bbs/data/DcPds/파일` | 직접 서빙 (`data/` alias) |

---

## 11. 관리자 기능 안내

관리자 페이지 접속: `https://도메인/admin` (isAdmin 1 또는 2만 접근 가능)

### 11-1. 관리자 메뉴

| 메뉴 | 경로 | 기능 |
|------|------|------|
| 대시보드 | `/admin` | 전체 현황 요약 (게시글, 회원, 방문자 통계) |
| 게시판 관리 | `/admin/boards` | 게시판 생성/수정/삭제, 권한 설정, 스킨 변경 |
| 회원 관리 | `/admin/members` | 회원 목록/검색, 등급 변경, 비밀번호 초기화 |
| 사이트 설정 | `/admin/settings` | 테마 색상 (프리셋 4종 + 직접 선택), 표어 등 |
| 스킨 관리 | `/admin/skins` | 게시판 스킨 미리보기 및 적용 |
| DB 관리 | `/admin/db` | 테이블 구조 조회, 데이터 마이그레이션 |
| SQL 실행 | `/admin/db/sql` | Raw SQL 쿼리 실행, 테이블 구조/데이터 조회 |
| 백업/복원 | `/admin/backup` | DB 테이블 + 파일 폴더 백업/복원 (mysqldump 필요) |

### 11-2. 게시판 관리 기능

- **게시글 관리 모드**: 관리자가 [게시글 관리] 버튼 클릭 → 체크박스 표시 → 일괄 삭제
- **댓글 관리 모드**: [댓글 관리] 버튼 클릭 → 체크박스 표시 → 일괄 삭제
- **공지사항**: `isNotice = true` 게시글은 목록 상단 고정 + "공지" 뱃지
- **비밀글**: `isSecret = true` 게시글은 작성자와 관리자만 열람 가능
- **권한 설정**: 각 게시판별 목록/조회/쓰기/댓글/삭제/공지 권한 레벨 지정

### 11-3. 테마/색상 관리

관리자 → 사이트 설정에서 CSS 변수 기반 색상 커스터마이징:

| CSS 변수 | 용도 |
|---------|------|
| `--theme-nav-from/to` | 상단 내비게이션 그라데이션 |
| `--theme-primary` | 메인 색상 (버튼, 링크 등) |
| `--theme-footer-from/to` | 하단 푸터 그라데이션 |
| `--theme-header-bg` | 헤더 배경 |

---

## 12. DB 관리 도구

### 12-1. 백업 기능 (`/admin/backup`)

**요구사항**: `mysqldump` CLI 도구가 서버에 설치되어 있어야 합니다.

- DB 테이블 선택 백업 (SQL 덤프)
- 첨부파일 폴더 선택 백업
- ZIP 압축 다운로드
- 테이블별 COMMENT(설명) 표시

**mysqldump 설치 확인:**

```bash
mysqldump --version
# 미설치 시:
# - Linux: sudo apt install mysql-client
# - Docker: 컨테이너 내부에 포함
# - Windows: MySQL Community ZIP 다운로드 → bin/ PATH 등록
```

### 12-2. SQL 관리 (`/admin/db/sql`)

- 좌측 사이드바에 테이블 목록 + COMMENT 표시
- 테이블 클릭 → 구조(칼럼 정보 + COMMENT) / 데이터 / 인덱스 조회
- Raw SQL 쿼리 직접 실행 (SELECT, UPDATE, DELETE 등)

### 12-3. 칼럼 COMMENT 스크립트

모든 테이블과 칼럼에 한국어 설명(COMMENT)을 추가하여 DB 관리 시 참조할 수 있게 합니다.

```bash
# 실행 방법 (프로젝트 루트에서)
npm run db:comments

# Docker 환경에서
docker compose exec app npx tsx scripts/add-column-comments.ts
```

> 이 스크립트는 `information_schema`에서 현재 칼럼 정의를 조회하고,
> `ALTER TABLE MODIFY COLUMN`으로 안전하게 COMMENT만 추가합니다.

### 12-4. npm 스크립트 요약

| 스크립트 | 명령어 | 용도 |
|---------|--------|------|
| `dev` | `npm run dev` | 개발 서버 실행 (HMR) |
| `build` | `npm run build` | 프로덕션 빌드 (standalone) |
| `start` | `npm start` | 프로덕션 실행 |
| `lint` | `npm run lint` | ESLint 코드 검사 |
| `db:generate` | `npm run db:generate` | Prisma 클라이언트 생성 |
| `db:push` | `npm run db:push` | DB 스키마 동기화 |
| `db:seed` | `npm run db:seed` | 초기 데이터 투입 |
| `db:studio` | `npm run db:studio` | Prisma Studio GUI (브라우저) |
| `db:comments` | `npm run db:comments` | 테이블/칼럼 COMMENT 추가 |
| `migrate:data` | `npm run migrate:data` | 제로보드 데이터 이관 |

---

## 13. 배포 후 체크리스트

```
보안 설정
□ .env의 NEXTAUTH_SECRET을 32자 이상 랜덤 문자열로 설정
     생성 명령: openssl rand -hex 32
□ .env의 DB 비밀번호를 강한 값으로 변경
□ 관리자 계정 비밀번호 변경 (기본: admin / admin1234)
     접속: https://도메인/admin → 회원관리 → admin 계정 수정
□ HTTPS 적용 확인 (HTTP → HTTPS 자동 전환)
□ .env 파일 권한 설정: chmod 600 .env

기능 확인
□ 메인 페이지 접속: https://도메인/
□ 게시판 목록/조회: https://도메인/board/DcNotice
□ 갤러리 게시판 이미지 표시: https://도메인/board/PkGallery/gallery
□ 첨부파일 다운로드 클릭 → 정상 다운로드 확인
□ 글쓰기 (TipTap 에디터 로드 + 이미지/파일 첨부) → 저장 후 확인
□ 댓글 작성 (WYSIWYG 에디터) → 저장 후 확인
□ 로그인/로그아웃 확인
□ 이메일 발송 확인 (비밀번호 초기화 시도)
□ 관리자 페이지: https://도메인/admin
□ 관리자 → 사이트 설정 → 색상/스킨 변경 확인
□ 관리자 → 백업 → DB 백업 다운로드 확인 (mysqldump 작동)
□ 권찰회 출석부: https://도메인/council (권한 필요)
□ 실시간 예배 링크 (푸터) 동작 확인

데이터 확인
□ ZeroBoard 게시글 이관 확인 (목록에 글 표시)
□ 기존 첨부파일 다운로드 정상 동작 (data/ 폴더)
□ 갤러리 게시판 이미지 인라인 표시 (/api/image)
□ 이관된 회원 로그인 확인 (첫 로그인 시 비밀번호 재설정 안내)
```

---

## 14. 업데이트 방법

### Docker Compose 방식

```bash
cd /home/사용자/dongcheon-church

# 소스 업데이트 (개발PC에서 rsync 또는 git pull)
git pull   # git을 사용하는 경우

# 재빌드 + 재시작 (다운타임 최소화)
docker compose up -d --build

# DB 스키마 변경이 있는 경우 추가 실행
docker compose exec app npx prisma db push

# DB 칼럼 COMMENT 업데이트 (새 칼럼 추가 시)
docker compose exec app npx tsx scripts/add-column-comments.ts
```

### 직접 설치 방식 (PM2)

```bash
cd /home/사용자/dongcheon-church
git pull

npm install          # 새 패키지가 있는 경우
npx prisma generate  # Prisma 스키마 변경 시
npm run build        # 재빌드

# DB 스키마 변경이 있는 경우
npx prisma db push

# 앱 재시작
pm2 restart dongcheon
```

---

## 15. 문제 해결

### 앱이 시작되지 않을 때

```bash
# Docker 방식 — 로그 확인
docker compose logs app --tail=50

# PM2 방식 — 로그 확인
pm2 logs dongcheon --lines=50

# 주요 원인:
# - .env 파일 누락 또는 DATABASE_URL 오류
# - MySQL 미실행 또는 연결 정보 불일치
# - NEXTAUTH_SECRET 누락
```

### DB 백업 시 "mysqldump 미설치" 오류

```bash
# Linux
sudo apt install -y mysql-client

# Docker 컨테이너 내부에서는 기본 포함
docker compose exec app mysqldump --version

# Windows
# MySQL Community ZIP 다운로드 → bin/ 폴더를 시스템 PATH에 추가
# 새 터미널에서 확인: mysqldump --version
```

### 첨부파일 다운로드 404 오류

```bash
# data/ 폴더 구조 확인
ls /프로젝트경로/data/DcPds/ | head -10

# Docker 볼륨 확인
docker compose exec app ls /app/data/DcPds/ | head -10

# 파일 없으면 다시 복사
docker compose cp data/. app:/app/data/
```

### 갤러리 이미지가 표시되지 않을 때

```bash
# 이미지 API 직접 확인
curl -I http://localhost:3000/api/image?boardId=PkGallery&postId=123&fileNo=1

# 404 응답 시: data/ 폴더에 파일이 없음
# 400 응답 시: 이미지 파일이 아님 (확장자 확인)
```

### sharp 설치 오류 (직접 설치 시)

```bash
# Linux — 네이티브 빌드 도구 필요
sudo apt install -y build-essential
npm rebuild sharp

# 그래도 실패 시 삭제 후 재설치
rm -rf node_modules/sharp
npm install sharp
```

### DB 연결 오류

```bash
# Docker — DB 컨테이너 상태 확인
docker compose ps
docker compose logs db --tail=20

# "Ready for connections" 메시지 없으면 DB 아직 초기화 중
# 30초 대기 후 재시도
docker compose exec app npx prisma db push
```

### SSL 인증서 갱신 실패

```bash
# 수동 갱신
sudo certbot renew

# Docker Nginx에 반영
sudo cp /etc/letsencrypt/live/pkistdc.net/*.pem nginx/ssl/
docker compose exec nginx nginx -s reload
```

### 메모리 부족 (빌드 실패)

```bash
# Node.js 빌드 메모리 증가
NODE_OPTIONS=--max-old-space-size=4096 npm run build

# Docker 빌드 시
docker compose build --no-cache
```

### Windows EPERM 오류 (.next 관련)

```powershell
# Node 프로세스 종료 후 .next 삭제
taskkill /F /IM node.exe
Remove-Item -Recurse -Force .next
npm run dev
```

> **예방**: Windows Defender 실시간 보호에서 프로젝트 폴더를 제외
> 설정 → Windows 보안 → 바이러스 및 위협 방지 → 제외 추가

### TipTap 에디터가 로드되지 않을 때

```
# 브라우저 콘솔에서 에러 확인 (F12 → Console)
# "SSR has been detected" 에러 → 코드에 이미 대응됨 (immediatelyRender: false)
# 패키지 누락 에러 → npm install 후 재빌드
npm install
npm run build
pm2 restart dongcheon
```

---

## 16. 프로젝트 파일 구조

```
dongcheon-church/
├── .env                        # 환경 변수 (서버에서 직접 작성, git 제외)
├── .dockerignore               # Docker 빌드 시 제외 파일
├── .gitignore                  # Git 추적 제외 파일
├── Dockerfile                  # Docker 이미지 빌드 (3단계: deps → build → runner)
├── docker-compose.yml          # Docker Compose 설정 (MySQL + App + Nginx)
├── package.json                # 의존성 및 npm 스크립트
├── tsconfig.json               # TypeScript 설정
├── next.config.ts              # Next.js 설정 (standalone, 레거시 리다이렉트)
├── eslint.config.mjs           # ESLint 설정
├── postcss.config.mjs          # PostCSS 설정 (Tailwind CSS)
│
├── data/                       # 첨부파일 (ZeroBoard data/ 구조 유지)
│   ├── DcPds/                  #   자료실 첨부파일
│   ├── PkGallery/              #   갤러리 이미지
│   ├── DcNotice/               #   공지사항 첨부파일
│   ├── DcSermon/               #   설교 파일
│   └── ...
│
├── nginx/
│   ├── nginx.conf              # Nginx 설정 (SSL, 리버스 프록시, 레거시 리다이렉트, Gzip, 캐시)
│   └── ssl/                    # Let's Encrypt 인증서 복사 위치
│       ├── fullchain.pem
│       └── privkey.pem
│
├── prisma/
│   ├── schema.prisma           # DB 스키마 정의 (17개 테이블)
│   └── seed.ts                 # 초기 데이터 (admin 계정 + 기본 게시판 7개 + 기본 그룹)
│
├── public/
│   ├── images/                 # 사이트 이미지 에셋
│   └── skins/                  # 스킨 프리뷰 이미지
│
├── scripts/
│   ├── migrate-data.ts         # ZeroBoard → 새 DB 데이터 마이그레이션
│   ├── import-visitor-count.js # 방문자 수 이관
│   └── add-column-comments.ts  # DB 테이블/칼럼 COMMENT 추가 (한국어 설명)
│
└── src/
    ├── app/                    # Next.js App Router
    │   ├── page.tsx            #   메인 페이지
    │   ├── layout.tsx          #   루트 레이아웃 (테마 CSS 변수 적용)
    │   ├── sitemap.xml/        #   사이트맵
    │   ├── auth/               #   인증 페이지 (로그인, 가입, 프로필 등)
    │   ├── board/              #   게시판 페이지 (목록, 상세, 글쓰기, 갤러리)
    │   ├── council/            #   권찰회 페이지 (출석, 관리, 보고서)
    │   ├── admin/              #   관리자 페이지 (게시판, 회원, 설정, DB, 백업)
    │   └── api/                #   API 라우트 (43개 엔드포인트)
    │       ├── auth/           #     인증 API (로그인, 가입, 이관 로그인, 비번 초기화 등)
    │       ├── board/          #     게시판 API (글, 댓글, 투표, 일괄삭제 등)
    │       ├── admin/          #     관리자 API (게시판, 회원, 설정, DB, 백업)
    │       ├── council/        #     권찰회 API (부서, 구역, 교인, 출석)
    │       ├── captcha/        #     수학 CAPTCHA 생성
    │       ├── download/       #     첨부파일 다운로드
    │       ├── image/          #     이미지 인라인 표시 (갤러리)
    │       ├── thumbnail/      #     썸네일 생성 (sharp)
    │       ├── visitor/        #     방문자 카운트
    │       └── health/         #     헬스체크
    ├── components/             # React 컴포넌트
    │   ├── layout/             #   Header, Footer, Navigation
    │   ├── board/              #   게시판 (목록, 에디터, 댓글 등)
    │   └── CaptchaField.tsx    #   CAPTCHA 입력 컴포넌트
    └── lib/                    # 유틸리티
        ├── auth.ts             #   인증 (getCurrentUser, hashPassword, verifyPassword)
        ├── db.ts               #   Prisma 클라이언트
        ├── captcha.ts          #   CAPTCHA 생성/검증 (HMAC-SHA256)
        └── email.ts            #   이메일 발송 (비번 초기화, 인증 메일)
```

### 주요 API 엔드포인트

| 경로 | 설명 |
|------|------|
| `/api/auth/login` | 로그인 |
| `/api/auth/register` | 회원가입 + 이메일 인증 |
| `/api/auth/migration-login` | 이관 회원 첫 로그인 처리 |
| `/api/auth/reset-password/request` | 비밀번호 초기화 요청 |
| `/api/board/post` | 게시글 조회 |
| `/api/board/write` | 게시글 작성/수정 |
| `/api/board/bulk-delete` | 게시글 일괄 삭제 (관리자) |
| `/api/board/comment` | 댓글 작성/조회 |
| `/api/board/comment/bulk-delete` | 댓글 일괄 삭제 (관리자) |
| `/api/download?boardId=...&postId=...&fileNo=1` | 첨부파일 다운로드 |
| `/api/image?boardId=...&postId=...&fileNo=1` | 이미지 인라인 표시 (갤러리) |
| `/api/thumbnail?boardId=...&file=...&w=200&h=200` | 썸네일 생성 (sharp) |
| `/api/captcha` | 수학 CAPTCHA 생성 |
| `/api/admin/settings` | 사이트 설정 관리 (테마, 색상) |
| `/api/admin/backup` | DB 백업/복원 |
| `/api/admin/db/sql` | Raw SQL 실행 |
| `/api/council/attendance` | 권찰회 출석 기록 |
| `/api/health` | 서버 헬스체크 |

---

*최종 수정: 2026-03-02*
