# 기존 pkistdc.net 사이트 컨테이너 이관 가이드

> **목적**: 기존 제로보드(ZeroBoard 4.1) 기반 pkistdc.net 사이트를 Docker 컨테이너로 보관하고,
> 신규 동천교회 홈페이지(Next.js)와 함께 운영하며 "이전 홈페이지" 링크로 접근할 수 있도록 구성한다.

---

## 목차

1. [기존 서버 정보](#1-기존-서버-정보)
2. [사전 준비 — 데이터 백업](#2-사전-준비--데이터-백업)
3. [폴더 구조 구성](#3-폴더-구조-구성)
4. [Docker Compose 작성](#4-docker-compose-작성)
5. [DB 접속 정보 수정](#5-db-접속-정보-수정)
6. [로컬 테스트](#6-로컬-테스트)
7. [GCP VM 배포](#7-gcp-vm-배포)
8. [Nginx 리버스 프록시 설정](#8-nginx-리버스-프록시-설정)
9. [신규 홈페이지에서 이전 홈페이지 연결](#9-신규-홈페이지에서-이전-홈페이지-연결)
10. [유지보수 및 참고사항](#10-유지보수-및-참고사항)

---

## 1. 기존 서버 정보

| 항목 | 값 |
|------|-----|
| 사이트 URL | http://pkistdc.net/bbs/ |
| 웹서버 | Apache |
| PHP 버전 | PHP 4.4.9 |
| 문자셋 | **EUC-KR** |
| DB 호스트 | jd1.nskorea.com |
| DB 사용자 | pkistdcnet |
| DB 이름 | pkistdcnet |
| CMS | 제로보드(ZeroBoard) 4.1 pl8 |

---

## 2. 사전 준비 — 데이터 백업

### 2-1. MySQL 데이터베이스 덤프

호스팅 서버에 SSH 접속하거나 phpMyAdmin 등에서 내보내기:

```bash
# SSH 접속 가능한 경우
mysqldump -h jd1.nskorea.com -u pkistdcnet -p pkistdcnet > pkistdc_dump.sql

# 또는 호스팅 관리 패널에서 DB 백업 파일(.sql) 다운로드
```

**주의사항**:
- 덤프 시 문자셋을 변환하지 말 것 (EUC-KR 그대로 유지)
- `--default-character-set=euckr` 옵션 사용 권장:
  ```bash
  mysqldump --default-character-set=euckr -h jd1.nskorea.com -u pkistdcnet -p pkistdcnet > pkistdc_dump.sql
  ```

### 2-2. 웹 파일 전체 다운로드

FTP 또는 호스팅 관리 패널에서 사이트 전체 파일을 다운로드:

```
다운로드 대상:
├── bbs/           ← 제로보드 메인 (게시판, 설정 등)
├── lib/           ← 공통 라이브러리, 이미지
├── index.php      ← 메인 페이지 (있는 경우)
└── 기타 폴더/     ← 업로드 파일, 첨부파일 등
```

**주의사항**:
- 파일 전체를 빠짐없이 다운로드할 것 (첨부파일, 이미지 포함)
- 숨김 파일(`.htaccess` 등)도 포함할 것

---

## 3. 폴더 구조 구성

로컬 또는 GCP VM에 아래 구조로 구성:

```
pkistdc-legacy/
├── docker-compose.yml          ← Docker Compose 설정
├── initdb/
│   └── pkistdc_dump.sql        ← DB 덤프 파일
├── www/
│   ├── bbs/                    ← 제로보드 메인
│   ├── lib/                    ← 공통 이미지/라이브러리
│   ├── index.php               ← 메인 페이지
│   └── ...                     ← 기타 파일
└── php/
    └── Dockerfile              ← (필요 시) PHP 커스텀 이미지
```

---

## 4. Docker Compose 작성

### docker-compose.yml

```yaml
# ============================================================
# 기존 pkistdc.net (제로보드 4.1) — Docker Compose
#
# 사용법:
#   1. initdb/pkistdc_dump.sql 에 DB 덤프 파일 배치
#   2. www/ 에 기존 웹 파일 전체 배치
#   3. docker compose up -d
#   4. 최초 실행 시 DB 자동 import (수 분 소요)
# ============================================================

services:
  # ---- MySQL 5.7 (EUC-KR) ----
  legacy-db:
    image: mysql:5.7
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${LEGACY_DB_ROOT_PASSWORD:-legacy_root_1234}
      MYSQL_DATABASE: pkistdcnet
      MYSQL_USER: pkistdcnet
      MYSQL_PASSWORD: ${LEGACY_DB_PASSWORD:-기존비밀번호}
    command:
      - --character-set-server=euckr
      - --collation-server=euckr_korean_ci
      - --default-authentication-plugin=mysql_native_password
    volumes:
      - legacy_mysql_data:/var/lib/mysql
      - ./initdb:/docker-entrypoint-initdb.d    # 최초 실행 시 .sql 자동 import
    ports:
      - "3307:3306"    # 동천교회 MySQL(3306)과 포트 충돌 방지
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ---- PHP 5.6 + Apache (제로보드용) ----
  legacy-web:
    image: php:5.6-apache
    restart: unless-stopped
    depends_on:
      legacy-db:
        condition: service_healthy
    volumes:
      - ./www:/var/www/html
    ports:
      - "8080:80"
    environment:
      - APACHE_DOCUMENT_ROOT=/var/www/html

volumes:
  legacy_mysql_data:
```

### PHP 확장이 필요한 경우 (선택)

제로보드가 GD, MySQL 확장을 요구하면 `php/Dockerfile`을 만들어 사용:

```dockerfile
# php/Dockerfile
FROM php:5.6-apache

# MySQL 확장 설치 (제로보드는 mysql_connect 사용)
RUN docker-php-ext-install mysql mysqli

# GD 라이브러리 (이미지 처리)
RUN apt-get update && apt-get install -y \
    libpng-dev libjpeg-dev libfreetype6-dev \
    && docker-php-ext-configure gd --with-freetype-dir=/usr --with-jpeg-dir=/usr \
    && docker-php-ext-install gd

# EUC-KR 로케일
RUN apt-get install -y locales \
    && echo "ko_KR.EUC-KR EUC-KR" >> /etc/locale.gen \
    && locale-gen
```

이 경우 `docker-compose.yml`의 `legacy-web` 섹션을 수정:

```yaml
  legacy-web:
    build:
      context: ./php
      dockerfile: Dockerfile
    # image: php:5.6-apache  ← 삭제하고 build로 대체
    ...
```

---

## 5. DB 접속 정보 수정

제로보드 설정 파일에서 DB 호스트를 Docker 컨테이너 이름으로 변경:

### 파일 위치: `www/bbs/dbconfig.php` (또는 `config.php`)

```php
// ===== 수정 전 (기존 호스팅) =====
$dbhost = "localhost";          // 또는 "jd1.nskorea.com"
$dbuser = "pkistdcnet";
$dbpasswd = "기존비밀번호";
$dbname = "pkistdcnet";

// ===== 수정 후 (Docker 컨테이너) =====
$dbhost = "legacy-db";          // docker-compose.yml의 서비스 이름
$dbuser = "pkistdcnet";
$dbpasswd = "기존비밀번호";      // docker-compose.yml의 LEGACY_DB_PASSWORD와 동일
$dbname = "pkistdcnet";
```

---

## 6. 로컬 테스트

```bash
cd pkistdc-legacy

# 컨테이너 실행
docker compose up -d

# DB import 진행 확인 (최초 실행 시 수 분 소요)
docker compose logs -f legacy-db

# "ready for connections" 메시지가 나오면 완료
```

브라우저에서 접속 확인:
- http://localhost:8080/ → 메인 페이지
- http://localhost:8080/bbs/ → 제로보드 게시판

### 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| 한글 깨짐 | EUC-KR 설정 누락 | MySQL command에 `--character-set-server=euckr` 확인 |
| DB 접속 실패 | 호스트명 불일치 | `dbconfig.php`의 `$dbhost`를 `legacy-db`로 수정 |
| 함수 오류 (mysql_connect) | PHP 확장 미설치 | Dockerfile로 `mysql` 확장 설치 |
| 이미지 안 보임 | 경로 문제 | 파일이 `www/` 아래 올바른 위치에 있는지 확인 |
| 권한 오류 | 파일 쓰기 권한 | `chmod -R 777 www/bbs/data/` 실행 |

---

## 7. GCP VM 배포

### 7-1. 파일 업로드

```bash
# 로컬에서 압축
tar czf pkistdc-legacy.tar.gz pkistdc-legacy/

# GCP VM으로 전송
gcloud compute scp pkistdc-legacy.tar.gz pkistdc:~ --zone=asia-northeast3-a

# VM에서 압축 해제
gcloud compute ssh pkistdc --zone=asia-northeast3-a
tar xzf pkistdc-legacy.tar.gz
cd pkistdc-legacy
```

### 7-2. 컨테이너 실행

```bash
# VM에서 실행
docker compose up -d

# 상태 확인
docker compose ps
docker compose logs -f
```

### 7-3. 방화벽 (내부 접근만 허용)

8080 포트는 외부에 직접 열지 않고, Nginx 리버스 프록시를 통해 접근:

```bash
# 8080은 외부 방화벽 규칙 불필요 (Nginx가 내부에서 proxy_pass)
```

---

## 8. Nginx 리버스 프록시 설정

GCP VM의 Nginx에서 동천교회 신규 사이트와 기존 사이트를 함께 서비스:

### 방법 A: 서브 경로로 분기 (권장)

`pkistdc.net/legacy/` 경로로 이전 사이트 접근:

```nginx
server {
    listen 80;
    server_name pkistdc.net www.pkistdc.net;

    # 신규 동천교회 홈페이지 (Next.js)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 이전 홈페이지 (제로보드)
    location /legacy/ {
        proxy_pass http://localhost:8080/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 방법 B: 서브도메인으로 분리

`old.pkistdc.net`으로 이전 사이트 접근:

```nginx
# 신규 사이트
server {
    listen 80;
    server_name pkistdc.net www.pkistdc.net;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# 이전 사이트
server {
    listen 80;
    server_name old.pkistdc.net;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

서브도메인 사용 시 DNS에 `old.pkistdc.net → A → (VM IP)` 레코드 추가 필요.

---

## 9. 신규 홈페이지에서 이전 홈페이지 연결

신규 동천교회 홈페이지 푸터 또는 메뉴에 "이전 홈페이지" 링크를 추가:

### 방법 A (서브 경로 방식)

```
이전 홈페이지 → /legacy/bbs/
```

### 방법 B (서브도메인 방식)

```
이전 홈페이지 → http://old.pkistdc.net/bbs/
```

### 환경 변수로 관리

`.env`에 추가:
```env
NEXT_PUBLIC_LEGACY_SITE_URL="/legacy/bbs/"
```

푸터 컴포넌트에서 사용:
```tsx
{process.env.NEXT_PUBLIC_LEGACY_SITE_URL && (
  <a href={process.env.NEXT_PUBLIC_LEGACY_SITE_URL}
     target="_blank" rel="noopener noreferrer">
    이전 홈페이지
  </a>
)}
```

---

## 10. 유지보수 및 참고사항

### 컨테이너 관리 명령어

```bash
cd pkistdc-legacy

# 상태 확인
docker compose ps

# 로그 확인
docker compose logs -f

# 중지
docker compose stop

# 재시작
docker compose restart

# 완전 삭제 (DB 데이터 포함)
docker compose down -v    # 주의: DB 데이터도 삭제됨
```

### DB 백업 (컨테이너 내부)

```bash
# 덤프 생성
docker compose exec legacy-db mysqldump \
  --default-character-set=euckr \
  -u pkistdcnet -p pkistdcnet > backup_$(date +%Y%m%d).sql

# 복원
docker compose exec -T legacy-db mysql \
  --default-character-set=euckr \
  -u pkistdcnet -p pkistdcnet < backup.sql
```

### 포트 정리

| 서비스 | 포트 | 용도 |
|--------|------|------|
| 동천교회 Next.js | 3000 | 신규 홈페이지 |
| 동천교회 MySQL | 3306 | 신규 DB |
| 기존 사이트 Apache+PHP | 8080 | 이전 홈페이지 |
| 기존 사이트 MySQL | 3307 | 이전 DB |
| Nginx | 80/443 | 외부 진입점 (리버스 프록시) |

### 전체 구성도

```
인터넷
  │
  ▼
Nginx (80/443)
  ├── pkistdc.net/          → localhost:3000 (동천교회 Next.js)
  └── pkistdc.net/legacy/   → localhost:8080 (기존 제로보드)
                                    │
                                    ▼
                              legacy-db:3306 (MySQL 5.7, EUC-KR)
```

### 주의사항

- **PHP 4.4.9 → 5.6**: 기존 코드에서 일부 함수 deprecated 경고가 나올 수 있으나 대부분 동작함
- **EUC-KR 유지**: DB와 PHP 모두 EUC-KR을 유지해야 한글이 깨지지 않음
- **보안**: 기존 사이트는 보안 업데이트가 중단된 상태이므로, 읽기 전용(아카이브) 용도로만 사용 권장
- **디스크**: DB 데이터 + 첨부파일 용량을 고려하여 GCP VM 디스크 여유 확보 필요
