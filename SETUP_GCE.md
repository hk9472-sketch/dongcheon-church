# 동천교회 홈페이지 — Google Cloud Compute Engine 배포 가이드

> **작성일**: 2026-03-05
> **대상**: GCE VM (Ubuntu) + MySQL 8 + Node.js 20 + PM2 + Nginx

> ⚠️ **중요**: 이 문서의 모든 비밀번호(DB, SMTP, 앱 비밀번호 등)는 **예시값**입니다.
> 실제 배포 시에는 반드시 강력한 비밀번호로 교체하고, `.env` 파일은 절대 저장소에 커밋하지 마세요.
> 시크릿 생성: `openssl rand -hex 32` 또는 가급적 클라우드 Secret Manager 사용을 권장합니다.

---

## 목차

1. [GCE VM 생성](#1-gce-vm-생성)
2. [SSH 키 등록 (로컬 → VM 접속용)](#2-ssh-키-등록-로컬--vm-접속용)
3. [VM 소프트웨어 설치](#3-vm-소프트웨어-설치)
4. [MySQL DB 생성 및 데이터 복원](#4-mysql-db-생성-및-데이터-복원)
5. [소스 코드 전송](#5-소스-코드-전송)
6. [환경 변수 설정 (.env)](#6-환경-변수-설정-env)
7. [빌드 및 실행](#7-빌드-및-실행)
8. [Nginx 리버스 프록시 설정](#8-nginx-리버스-프록시-설정)
9. [SSL 인증서 적용 (도메인 연결 후)](#9-ssl-인증서-적용-도메인-연결-후)
10. [첨부파일(data/) 이관](#10-첨부파일data-이관)
11. [배포 후 체크리스트](#11-배포-후-체크리스트)
12. [백업 자동화](#12-백업-자동화)
13. [운영 명령어 모음](#13-운영-명령어-모음)

---

## 1. GCE VM 생성

**Google Cloud Console → Compute Engine → VM 인스턴스 → 인스턴스 만들기**

| 항목 | 설정 값 |
|------|--------|
| 인스턴스 이름 | `pkistdc` |
| 리전 | `asia-northeast3` (서울) |
| 머신 유형 | `e2-small` (vCPU 2, 메모리 2GB) 이상 |
| 부팅 디스크 | Ubuntu 22.04 LTS, 20GB+ SSD |
| 방화벽 | **HTTP 트래픽 허용** 체크, **HTTPS 트래픽 허용** 체크 |

**고정 외부 IP 할당:**
- VPC 네트워크 → 외부 IP 주소 → 고정 주소 예약 → VM에 연결
- 외부 IP: `35.212.174.200`

**방화벽 규칙 확인:**
- Google Cloud Console → VPC 네트워크 → 방화벽
- 80(HTTP), 443(HTTPS), 3000(Node.js 직접 접속 테스트용) 포트 허용

---

## 2. SSH 키 등록 (로컬 → VM 접속용)

GCE VM은 기본적으로 비밀번호 접속을 허용하지 않습니다. SSH 키를 생성하여 등록해야 합니다.

### 2-1. 로컬(Windows PowerShell)에서 SSH 키 생성

```powershell
ssh-keygen -t rsa -b 4096 -C "hk9472"
```

- 저장 위치: `C:\Users\hkjeong\.ssh\id_rsa` (기본값 Enter)
- 비밀번호: 원하는 경우 입력, 없으면 Enter

### 2-2. 공개키를 GCE VM에 등록

1. `C:\Users\hkjeong\.ssh\id_rsa.pub` 파일을 메모장으로 열기
2. 내용 전체를 복사
3. Google Cloud Console → Compute Engine → VM 인스턴스
4. `pkistdc` 인스턴스 → **수정** 클릭
5. **SSH 키** 섹션 → **항목 추가** → 복사한 공개키 붙여넣기
6. **저장**

### 2-3. 접속 확인

```powershell
# PowerShell에서 VM 접속
ssh hk9472@35.212.174.200

# 또는 gcloud 명령어 (Google Cloud SDK 설치 필요)
gcloud compute ssh pkistdc --zone=asia-northeast3-a
```

---

## 3. VM 소프트웨어 설치

VM에 SSH 접속 후 아래 명령어를 순서대로 실행합니다.

### 3-1. Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 확인
node -v   # v20.20.0
npm -v    # 10.8.2
```

### 3-2. 빌드 도구 + PM2 + Nginx

```bash
# sharp 네이티브 빌드 도구
sudo apt install -y build-essential

# PM2 (Node.js 프로세스 관리자)
sudo npm install -g pm2

# Nginx (리버스 프록시)
sudo apt install -y nginx

# 확인
pm2 -v      # 6.0.14
nginx -v    # nginx/1.24.0
```

### 3-3. MySQL 8 (이미 설치된 경우 건너뛰기)

```bash
sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql

# 보안 설정
sudo mysql_secure_installation
```

---

## 4. MySQL DB 생성 및 데이터 복원

### 4-1. DB 및 사용자 생성

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE dongcheon CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'dongcheon'@'localhost' IDENTIFIED BY '<your-strong-db-password>';
GRANT ALL PRIVILEGES ON dongcheon.* TO 'dongcheon'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 4-2. 로컬에서 DB 덤프 생성 (WSL에서 실행)

```bash
mysqldump -u dongcheon -p --no-tablespaces dongcheon > dongcheon_dump.sql
```

> `--no-tablespaces` 옵션 필수 (PROCESS 권한 에러 방지)

### 4-3. 덤프 파일을 VM으로 전송

```bash
# gcloud 명령어 사용
gcloud compute scp dongcheon_dump.sql pkistdc:~ --zone=asia-northeast3-a

# 또는 scp 사용 (SSH 키 등록 완료된 경우)
scp dongcheon_dump.sql hk9472@35.212.174.200:~/
```

### 4-4. VM에서 DB 복원

```bash
mysql -u dongcheon -p dongcheon < ~/dongcheon_dump.sql
```

### 4-5. (참고) DB 초기화가 필요한 경우

```bash
sudo mysql -u root -p
```

```sql
-- DB만 삭제 후 재생성
DROP DATABASE dongcheon;
CREATE DATABASE dongcheon CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON dongcheon.* TO 'dongcheon'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 5. 소스 코드 전송

### 5-1. 로컬에서 ZIP 압축 후 전송

```powershell
# PowerShell에서 VM으로 전송
scp dongcheon.zip hk9472@35.212.174.200:~/
```

### 5-2. VM에서 압축 해제

```bash
cd ~
sudo apt install -y unzip   # unzip 없으면 설치
unzip dongcheon.zip
# 또는 압축 해제 경로 지정:
# unzip dongcheon.zip -d ~/dongcheon-church

ls ~/dongcheon-church/package.json   # 파일 확인
```

### 5-3. (대안) tar + gcloud 사용

```bash
# 로컬(WSL)에서 압축
tar czf dongcheon-church.tar.gz \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='data' \
  --exclude='.env' \
  --exclude='.git' \
  -C /mnt/d/Works/Christ/pkistdc_new dongcheon-church

# VM으로 전송
gcloud compute scp dongcheon-church.tar.gz pkistdc:~ --zone=asia-northeast3-a

# VM에서 압축 해제
cd ~ && tar xzf dongcheon-church.tar.gz
```

---

## 6. 환경 변수 설정 (.env)

```bash
cd ~/dongcheon-church
nano .env
```

```env
# ---- 데이터베이스 ----
DATABASE_URL="mysql://dongcheon:<your-strong-db-password>@localhost:3306/dongcheon"

# ---- 인증 ----
NEXTAUTH_URL="http://35.212.174.200:3000"
NEXTAUTH_SECRET="openssl-rand-hex-32-결과를-여기에-붙여넣기"

# ---- 사이트 설정 ----
SITE_NAME="동천교회"
SITE_URL="http://35.212.174.200:3000"
UPLOAD_DIR="./data"
MAX_UPLOAD_SIZE=10485760

# ---- 이메일 ----
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="hk9472@gmail.com"
SMTP_PASS="<your-gmail-app-password>"
SMTP_FROM="동천교회 <noreply@pkistdc.net>"

# ---- 외부 링크 ----
NEXT_PUBLIC_YOUTUBE_LIVE_URL="https://www.youtube.com/channel/UCV4a5MJIMxTFXwunW8Q0WzQ"
NEXT_PUBLIC_FAITH_STUDY_URL="https://pkists.net/"
NEXT_PUBLIC_SINPUNG_CHURCH_URL="http://pkist.net/s/"
NEXT_PUBLIC_SONYANGWON="https://www.youtube.com/@sonyangwon"
NEXT_PUBLIC_REPLAY_URL="DcWsRePlay"
```

**NEXTAUTH_SECRET 생성:**

```bash
openssl rand -hex 32
```

출력된 값을 `.env`의 `NEXTAUTH_SECRET=` 뒤에 붙여넣기.

> **중요**: `SITE_URL`이 `http://`이면 로그인 쿠키가 HTTP에서도 작동합니다.
> 나중에 도메인 + SSL 적용 시 `https://pkistdc.net`으로 변경 후 재빌드하면 됩니다.

---

## 7. 빌드 및 실행

```bash
cd ~/dongcheon-church

# 의존성 설치
npm install

# Prisma 클라이언트 생성
npx prisma generate

# DB 스키마 동기화
npx prisma db push

# DB 칼럼 COMMENT 추가 (선택)
npx tsx scripts/add-column-comments.ts

# 프로덕션 빌드
npm run build
# 메모리 부족 시: NODE_OPTIONS=--max-old-space-size=4096 npm run build

# PM2로 실행
pm2 start npm --name "dongcheon" -- start

# 부팅 시 자동 시작 등록
pm2 save
pm2 startup
# → 출력되는 sudo env ... 명령어를 복사해서 실행
```

**접속 확인:**

```
http://35.212.174.200:3000
```

---

## 8. Nginx 리버스 프록시 설정

포트 번호(:3000) 없이 80번 포트로 접속할 수 있도록 설정합니다.

### 8-1. Nginx 설정 파일 생성

```bash
sudo nano /etc/nginx/sites-available/dongcheon
```

```nginx
server {
    listen 80;
    server_name 35.212.174.200 pkistdc.net www.pkistdc.net;

    # 첨부파일 업로드 한도 (15MB)
    client_max_body_size 15M;

    # ================================================================
    # 제로보드(ZeroBoard) 레거시 URL 301 리다이렉트
    # Nginx 레벨에서 처리하여 검색엔진 크롤링에 즉시 대응
    # (next.config.ts 의 redirects() 와 중복되지만 Nginx 가 먼저 처리 → Next.js 까지 가지 않음)
    # ================================================================

    # zboard.php → /board/{id}  (목록 페이지)
    location = /bbs/zboard.php {
        if ($arg_id) {
            return 301 /board/$arg_id?$args;
        }
        return 301 /;
    }

    # view.php → /board/{id}/{no}  (게시글 상세)
    location = /bbs/view.php {
        if ($arg_id) {
            return 301 /board/$arg_id/$arg_no;
        }
        return 301 /;
    }

    # write.php → /board/{id}/write  (글쓰기/수정/답글)
    location = /bbs/write.php {
        if ($arg_id) {
            return 301 /board/$arg_id/write?mode=$arg_mode&no=$arg_no;
        }
        return 301 /;
    }

    # login.php → /auth/login  (로그인 페이지)
    location = /bbs/login.php {
        return 301 /auth/login;
    }

    # admin.php → /admin  (관리자 페이지)
    location = /bbs/admin.php {
        return 301 /admin;
    }

    # 기존 ZeroBoard 이미지 / 첨부파일 직접 서빙 (레거시 URL 호환)
    location /bbs/data/ {
        alias /home/hk9472/dongcheon-church/data/;
        expires 30d;
        add_header Cache-Control "public";
    }

    # Next.js 앱 (나머지 모든 경로)
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

### 8-2. 설정 활성화

```bash
# 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/dongcheon /etc/nginx/sites-enabled/

# 기본 설정 제거 (충돌 방지)
sudo rm -f /etc/nginx/sites-enabled/default

# 설정 검사
sudo nginx -t

# Nginx 적용
sudo systemctl reload nginx
```

**접속 확인 (포트 번호 없이):**

```
http://35.212.174.200
```

### 8-3. .env 수정 (포트 제거)

Nginx 설정 후 `.env`에서 포트 번호를 제거합니다:

```env
NEXTAUTH_URL="http://35.212.174.200"
SITE_URL="http://35.212.174.200"
```

```bash
# 재빌드
npm run build
pm2 restart dongcheon
```

---

## 9. SSL 인증서 적용 (도메인 연결 후)

도메인 DNS에 A 레코드를 VM 외부 IP로 설정한 후 진행합니다.

### 9-1. DNS 설정

도메인 관리 사이트에서:

```
pkistdc.net        → A → 35.212.174.200
www.pkistdc.net    → A → 35.212.174.200
```

### 9-2. Certbot으로 SSL 인증서 발급

```bash
# Certbot 설치
sudo apt install -y certbot python3-certbot-nginx

# SSL 인증서 발급 + Nginx 자동 설정
sudo certbot --nginx -d pkistdc.net -d www.pkistdc.net

# 자동 갱신 확인
sudo certbot renew --dry-run
```

### 9-3. .env 수정 (HTTPS 적용)

```env
NEXTAUTH_URL="https://pkistdc.net"
SITE_URL="https://pkistdc.net"
```

```bash
# 재빌드 + 재시작
npm run build
pm2 restart dongcheon
```

---

## 10. 첨부파일(data/) 이관

기존 ZeroBoard 첨부파일을 VM에 복사합니다.

```bash
# 로컬에서 data/ 압축
tar czf data.tar.gz data/

# VM으로 전송
scp data.tar.gz hk9472@35.212.174.200:~/dongcheon-church/
# 또는: gcloud compute scp data.tar.gz pkistdc:~/dongcheon-church/ --zone=asia-northeast3-a

# VM에서 압축 해제
cd ~/dongcheon-church
tar xzf data.tar.gz

# 확인
ls data/
# DcPds, PkGallery, DcNotice 등 폴더가 보이면 정상
```

---

## 11. 배포 후 체크리스트

```
보안 설정
□ NEXTAUTH_SECRET을 랜덤 32자 이상으로 설정했는지 확인
□ 관리자 비밀번호 변경 (기본: admin / admin1234)
□ .env 파일 권한 설정: chmod 600 .env
□ HTTPS 적용 후 HTTP → HTTPS 자동 전환 확인

기능 확인
□ 메인 페이지 접속
□ 로그인/로그아웃
□ 게시판 목록/조회/글쓰기
□ 댓글 작성 (WYSIWYG 에디터)
□ 첨부파일 다운로드
□ 갤러리 이미지 표시
□ 관리자 페이지 (/admin)
□ 관리자 → DB 백업 기능
□ 이메일 발송 (비밀번호 초기화)
□ 권찰회 출석부 (/council)
```

---

## 12. 백업 자동화

서비스 운영 중 DB / 업로드 파일을 정기적으로 백업해 두어야 장애·유실 시 복구가 가능합니다.
아래 절차는 VM 내부에서 cron 으로 `mysqldump` 및 `tar` 를 돌리고, (권장) 외부 스토리지(GCS/다른 서버)로 오프사이트 복사까지 수행하는 구성입니다.

### 12-1. 백업 디렉토리 생성

```bash
mkdir -p ~/backups/db ~/backups/data
```

### 12-2. 백업 스크립트 작성 (`~/backup.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail
DATE=$(date +%F)
DB_USER="dongcheon"
DB_NAME="dongcheon"
# .env 에서 비밀번호 읽기
source ~/pkistdc/.env
DB_PASS=$(echo "$DATABASE_URL" | sed -E 's|mysql://[^:]+:([^@]+)@.*|\1|')

# DB 백업 (gzip 압축)
MYSQL_PWD="$DB_PASS" mysqldump --no-tablespaces -u "$DB_USER" "$DB_NAME" \
  | gzip > ~/backups/db/${DB_NAME}_${DATE}.sql.gz

# 업로드 파일(data/) 백업 (주간 월요일만)
if [ "$(date +%u)" = "1" ]; then
  tar czf ~/backups/data/data_${DATE}.tar.gz -C ~/pkistdc data
fi

# 14일 이상 된 DB 백업 삭제
find ~/backups/db -name '*.sql.gz' -mtime +14 -delete
# 90일 이상 된 데이터 백업 삭제
find ~/backups/data -name '*.tar.gz' -mtime +90 -delete
```

실행 권한 부여 및 테스트:

```bash
chmod +x ~/backup.sh
# 테스트 실행
~/backup.sh && ls -lh ~/backups/db
```

> 📌 `~/pkistdc` 경로는 실제 소스 코드 디렉토리(예: `~/dongcheon-church`)에 맞게 수정하세요.

### 12-3. Crontab 등록 (매일 03:00 KST = UTC 18:00 전날)

```bash
crontab -e
# 아래 한 줄 추가:
0 3 * * * /home/hk9472/backup.sh >> /home/hk9472/backups/cron.log 2>&1
```

> VM 의 시스템 시간대를 KST 로 맞춰두었다면 위 그대로 03:00 에 실행됩니다.
> 기본 UTC 인 경우 cron 도 UTC 기준이므로 `0 18 * * *` 로 (전날 18:00 UTC = 한국 03:00) 조정하세요.

### 12-4. (권장) 주간 Offsite 복사

백업 파일이 **동일 VM 디스크에만** 존재하면 VM 장애 시 복구가 불가능합니다. 반드시 외부로 복사하세요.

- **GCS 버킷** 으로 복사 (추천):
  ```bash
  # Google Cloud SDK 설치 및 서비스 계정 인증 필요
  gsutil -m rsync -r ~/backups gs://pkistdc-backups/
  ```
- 또는 **다른 VM/서버** 로 rsync:
  ```bash
  rsync -az --delete ~/backups/ user@backup-host:/srv/pkistdc-backups/
  ```
- Crontab 에 주 1회 추가 (매주 일요일 04:00):
  ```
  0 4 * * 0 gsutil -m rsync -r /home/hk9472/backups gs://pkistdc-backups/ >> /home/hk9472/backups/offsite.log 2>&1
  ```

### 12-5. 복원 테스트 절차 (분기별 1회 권장)

백업은 **실제 복원이 되어야** 의미가 있습니다. 분기별로 테스트 환경에 복원해 보세요.

- DB 복원 (별도 복원용 DB 로):
  ```bash
  gunzip -c ~/backups/db/dongcheon_<날짜>.sql.gz | mysql -u <복원용DB> -p <복원용DB명>
  ```
- `data/` 복원:
  ```bash
  tar xzf ~/backups/data/data_<날짜>.tar.gz -C /tmp/restore-test
  ```
- 복원 결과 확인: 최신 게시글/첨부/사용자 데이터가 정상으로 보이는지 확인

---

## 13. 운영 명령어 모음

### 앱 관리 (PM2)

```bash
pm2 status                    # 상태 확인
pm2 logs dongcheon            # 로그 확인
pm2 logs dongcheon --lines=50 # 최근 50줄
pm2 restart dongcheon         # 재시작
pm2 stop dongcheon            # 중지
pm2 delete dongcheon          # 삭제
```

### 코드 수정 후 재반영 절차

로컬에서 코드를 수정한 후 서버에 반영하는 절차입니다.

#### 방법 1: ZIP으로 전체 교체 (간단)

**로컬(PowerShell)에서:**

```powershell
# 1. 프로젝트 폴더를 ZIP 압축 (node_modules, .next, data, .env, .git 제외)
#    Windows 탐색기에서 수동 압축 또는 도구 사용

# 2. VM으로 전송
scp dongcheon.zip hk9472@35.212.174.200:~/
```

**VM에서:**

```bash
# 3. 기존 소스 백업 (필요 시)
cp ~/dongcheon-church/.env ~/env_backup

# 4. 기존 소스 삭제 (data/, .env 보존)
cd ~/dongcheon-church
find . -maxdepth 1 ! -name 'data' ! -name '.env' ! -name '.' -exec rm -rf {} +

# 5. 새 소스 압축 해제
cd ~
unzip -o dongcheon.zip -d ~/dongcheon-church

# 6. 재빌드 + 재시작
cd ~/dongcheon-church
npm install
npx prisma generate
npm run build
pm2 restart dongcheon
```

#### 방법 2: 변경 파일만 전송 (빠름)

**로컬(PowerShell)에서:**

```powershell
# 변경된 파일만 전송 (예: src/app/api/auth/login/route.ts 수정한 경우)
scp -r src/app/api/auth/login/route.ts hk9472@35.212.174.200:~/dongcheon-church/src/app/api/auth/login/
```

**VM에서:**

```bash
cd ~/dongcheon-church
npm run build
pm2 restart dongcheon
```

#### 방법 3: rsync로 변경분만 동기화 (가장 효율적)

**로컬(WSL)에서:**

```bash
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='data' \
  --exclude='.env' \
  --exclude='.git' \
  /mnt/d/Works/Christ/pkistdc_new/dongcheon-church/ \
  hk9472@35.212.174.200:~/dongcheon-church/
```

**VM에서:**

```bash
cd ~/dongcheon-church
npm install              # 새 패키지가 있는 경우
npx prisma generate      # Prisma 스키마 변경 시
npx prisma db push       # DB 스키마 변경 시
npm run build
pm2 restart dongcheon
```

#### 변경 유형별 필요 작업

| 변경 내용 | npm install | prisma generate | prisma db push | npm run build | pm2 restart |
|----------|:-----------:|:---------------:|:--------------:|:-------------:|:-----------:|
| 소스 코드만 수정 (ts/tsx) | | | | O | O |
| package.json 변경 (새 패키지) | O | | | O | O |
| prisma/schema.prisma 변경 | O | O | O | O | O |
| .env 변경 | | | | O | O |
| public/ 정적 파일 변경 | | | | O | O |

### MySQL 관리

```bash
# MySQL 접속
mysql -u dongcheon -p dongcheon

# DB 백업
mysqldump -u dongcheon -p --no-tablespaces dongcheon > backup_$(date +%Y%m%d).sql

# DB 복원
mysql -u dongcheon -p dongcheon < backup_file.sql
```

### Nginx 관리

```bash
sudo nginx -t                  # 설정 검사
sudo systemctl reload nginx    # 설정 적용
sudo systemctl restart nginx   # 재시작
sudo systemctl status nginx    # 상태 확인
```

### 서버 상태 확인

```bash
# 디스크 사용량
df -h

# 메모리 사용량
free -h

# 프로세스 확인
htop
```

### 운영 안정화 (권장 1회 설정)

#### PM2 로그 로테이션

PM2 기본 로그는 무한 증가한다. 일 단위 로테이트 + 보존 기간 설정 권장.

```bash
# 설치 (PM2 내부 모듈)
pm2 install pm2-logrotate

# 보존 30일, 10MB 단위 분할, gzip 압축
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'   # 매일 자정
pm2 save
```

#### MySQL slow query log

장기적으로 느린 쿼리 추적.

```bash
sudo tee -a /etc/mysql/mysql.conf.d/mysqld.cnf <<'EOF'

# --- slow query (dongcheon) ---
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 1
log_queries_not_using_indexes = 0
EOF

sudo mkdir -p /var/log/mysql
sudo chown mysql:mysql /var/log/mysql
sudo systemctl restart mysql

# 확인
mysql -u root -p -e "SHOW VARIABLES LIKE 'slow_query%';"

# 로그 확인
sudo tail -f /var/log/mysql/slow.log
```

로그 로테이트는 `/etc/logrotate.d/mysql-server` 의 기본 설정이 커버.

#### 디스크 공간 모니터링

`data/` (첨부) + MySQL 데이터 + PM2 로그가 누적된다. 80% 도달 시 알림 권장.

```bash
# 1회 점검
df -h /

# 용량 큰 디렉터리 Top 10
du -h --max-depth=2 ~/dongcheon-church 2>/dev/null | sort -rh | head -10

# 간단한 알림 스크립트 (crontab 등록 예)
cat > ~/disk_check.sh <<'EOF'
#!/bin/bash
THRESHOLD=80
USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$USAGE" -ge "$THRESHOLD" ]; then
  echo "[WARN] Disk usage ${USAGE}% on $(hostname)"
  # 이메일/Slack 연동은 기존 알림 체계에 맞게 추가
fi
EOF
chmod +x ~/disk_check.sh

# crontab -e 에 추가
# 0 9 * * * /home/hk9472/disk_check.sh | mail -s "dongcheon disk check" you@example.com
```

#### Nginx Brotli 압축 (선택)

기본 gzip 보다 10~20% 더 작은 응답 크기. Debian/Ubuntu 기준 `libnginx-mod-brotli` 패키지 사용.

```bash
# Ubuntu 22.04 기준
sudo apt install -y libnginx-mod-brotli
# 모듈 로드는 apt 설치 시 /etc/nginx/modules-enabled/ 에 자동 추가됨.
```

`/etc/nginx/nginx.conf` 의 `http {}` 블록에 추가:

```nginx
# 기존 gzip 블록 옆에
brotli on;
brotli_comp_level 5;
brotli_static on;
brotli_types
  text/plain
  text/css
  application/json
  application/javascript
  text/xml
  application/xml
  application/xml+rss
  text/javascript
  image/svg+xml;
```

적용:

```bash
sudo nginx -t && sudo systemctl reload nginx

# 확인 (Brotli 는 Accept-Encoding: br 요청에만 응답)
curl -I -H "Accept-Encoding: br" https://dongcheonchurch.org/
# Content-Encoding: br 헤더가 보이면 성공
```

#### 헬스 상세 조회

`/api/health` 는 이제 uptime/memory/active sessions 를 반환한다.

```bash
curl -s https://dongcheon.org/api/health | jq
# {
#   "status": "ok",
#   "uptimeHuman": "3d 14h 22m 5s",
#   "activeSessions": 42,
#   "memory": { "rssMB": 187.4, "heapUsedMB": 92.1, ... },
#   ...
# }
```

### VM 초기화 (전체 재설치 시)

```bash
# 1. PM2 중지 및 제거
pm2 stop all && pm2 delete all
pm2 unstartup
sudo npm uninstall -g pm2

# 2. 프로젝트 삭제
rm -rf ~/dongcheon-church

# 3. Node.js 제거
sudo apt remove -y nodejs && sudo apt purge -y nodejs
sudo apt autoremove -y
sudo rm -f /etc/apt/sources.list.d/nodesource.list
sudo rm -rf /usr/lib/node_modules ~/.npm

# 4. Nginx 설정 제거
sudo rm -f /etc/nginx/sites-enabled/dongcheon
sudo rm -f /etc/nginx/sites-available/dongcheon
sudo systemctl reload nginx

# 5. MySQL DB만 삭제 (MySQL 자체는 유지)
sudo mysql -u root -p -e "DROP DATABASE dongcheon; DROP USER 'dongcheon'@'localhost'; FLUSH PRIVILEGES;"
```

---

*최종 수정: 2026-04-17 (H14 백업 자동화, H15 레거시 `/bbs/` 리다이렉트 통합)*
