# WSL2 테스트 환경 구축 가이드

## 방법 비교

| 항목 | 방법 1: 네이티브 (Node + MySQL) | 방법 2: Docker Compose |
|------|-------------------------------|----------------------|
| 초기 세팅 시간 | ~10분 | ~5분 (이미지 다운로드 제외) |
| 코드 수정 반영 | 즉시 (HMR) | 볼륨 마운트 필요 |
| 디버깅 | 쉬움 (직접 로그 확인) | docker logs 필요 |
| DB 관리 | MySQL 직접 접속 | docker exec 경유 |
| 리소스 사용 | 가벼움 | Docker 데몬 추가 |
| 프로덕션 유사도 | 낮음 | 높음 |
| **추천 상황** | **개발/디버깅** | **배포 전 최종 검증** |

**결론: 개발 단계에서는 방법 1(네이티브)이 효율적, 배포 전 검증은 방법 2(Docker).**

---

## 방법 1: 네이티브 실행 (추천 - 개발용)

### 1-1. Node.js 설치

```bash
# nvm으로 Node.js 20+ 설치
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
node -v  # v20.x.x 확인
```

### 1-2. MySQL 8 설치

```bash
# MySQL 설치
sudo apt update
sudo apt install -y mysql-server

# MySQL 시작 (WSL2는 systemctl 대신 service 사용)
sudo service mysql start

# root 비밀번호 설정 + 보안 설정
sudo mysql_secure_installation
# → 비밀번호 복잡도: Low 선택
# → root 비밀번호 설정
# → 나머지 모두 Y

# DB 및 사용자 생성
sudo mysql -u root -p
```

```sql
CREATE DATABASE dongcheon CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'dongcheon'@'localhost' IDENTIFIED BY 'dongcheon1234!';
GRANT ALL PRIVILEGES ON dongcheon.* TO 'dongcheon'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 1-3. 프로젝트 설정

```bash
# 프로젝트 압축 해제 (Windows에서 다운로드한 경우)
# WSL2에서 Windows 파일 접근: /mnt/c/Users/사용자/Downloads/
cd ~
cp /mnt/c/Users/사용자/Downloads/dongcheon-church.zip .
unzip dongcheon-church.zip
cd dongcheon-church

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
```

### 1-4. .env 파일 수정

```bash
nano .env
```

```env
# 로컬 MySQL 연결
DATABASE_URL="mysql://dongcheon:dongcheon1234!@localhost:3306/dongcheon"

NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="test-secret-key-for-local-development-only"

SITE_NAME="동천교회"
SITE_URL="http://localhost:3000"
UPLOAD_DIR="./public/uploads"
MAX_UPLOAD_SIZE=10485760
```

### 1-5. DB 초기화 및 실행

```bash
# Prisma 클라이언트 생성
npx prisma generate

# DB 테이블 생성
npx prisma db push

# 초기 데이터 (관리자 계정 + 7개 게시판)
npx prisma db seed

# 개발 서버 실행
npm run dev
```

### 1-6. 접속 확인

```
브라우저: http://localhost:3000
관리자:   http://localhost:3000/admin
계정:     admin / admin1234
```

### 1-7. 유용한 명령어

```bash
# DB 관리 GUI (브라우저에서)
npx prisma studio
# → http://localhost:5555

# MySQL 직접 접속
mysql -u dongcheon -p dongcheon

# MySQL 재시작
sudo service mysql restart

# 로그 확인 (터미널에 바로 출력됨)
```

---

## 방법 2: Docker Compose 실행

### 2-1. Docker Desktop 설치

Windows에 Docker Desktop이 설치되어 있어야 합니다.

```bash
# WSL2에서 Docker 확인
docker --version
docker compose version

# 안 되면 Docker Desktop 설정에서:
# Settings → Resources → WSL Integration → 현재 WSL 배포판 활성화
```

### 2-2. 프로젝트 준비

```bash
cd ~/dongcheon-church

# 환경 변수 설정
cp .env.example .env
nano .env
```

```env
# Docker Compose용 (DB는 컨테이너 내부)
DATABASE_URL="mysql://dongcheon:dongcheon1234!@db:3306/dongcheon"

NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="test-secret-key-for-local-development-only"

DB_ROOT_PASSWORD=dongcheon2024!
DB_NAME=dongcheon
DB_USER=dongcheon
DB_PASSWORD=dongcheon1234!
```

### 2-3. 실행

```bash
# 빌드 + 실행 (첫 실행 시 이미지 빌드에 2~3분)
docker compose up -d

# 빌드 로그 확인
docker compose logs -f app

# DB 초기화 (최초 1회, MySQL 헬스체크 통과 후)
docker compose exec app npx prisma db push
docker compose exec app npx prisma db seed
```

### 2-4. 접속 확인

```
브라우저: http://localhost:3000
관리자:   http://localhost:3000/admin
계정:     admin / admin1234
```

### 2-5. 개발 중 코드 수정 반영

Docker는 이미지를 빌드해서 실행하므로, 코드 수정 시 재빌드가 필요합니다:

```bash
# 코드 수정 후 재빌드
docker compose up -d --build

# 또는 개발용 볼륨 마운트 (docker-compose.override.yml 생성)
```

개발 중 빠른 반영이 필요하면 아래 override 파일을 만드세요:

```bash
cat > docker-compose.override.yml << 'EOF'
services:
  app:
    build:
      context: .
    volumes:
      - ./src:/app/src
      - ./public:/app/public
    command: npm run dev
    environment:
      NODE_ENV: development
EOF

# override 적용 실행
docker compose up -d
```

### 2-6. 유용한 명령어

```bash
# 로그 확인
docker compose logs -f app
docker compose logs -f db

# MySQL 직접 접속
docker compose exec db mysql -u dongcheon -p dongcheon

# 컨테이너 상태 확인
docker compose ps

# Prisma Studio (컨테이너 내부에서)
docker compose exec app npx prisma studio

# 전체 중지
docker compose down

# 전체 삭제 (DB 데이터 포함)
docker compose down -v
```

---

## 문제 해결

### WSL2 공통

```bash
# WSL2에서 localhost 접근이 안 될 때
# Windows 방화벽 확인 또는 WSL IP로 접근:
hostname -I  # WSL IP 확인
# → 172.x.x.x:3000 으로 접근

# 포트 충돌 확인
lsof -i :3000
lsof -i :3306
```

### 방법 1 (네이티브) 문제

```bash
# MySQL 시작 안 됨
sudo service mysql start
sudo service mysql status

# Permission denied 오류
sudo chown -R $USER:$USER ~/dongcheon-church

# sharp (이미지 처리) 설치 오류
sudo apt install -y build-essential
npm rebuild sharp

# Prisma 오류
npx prisma generate --force
```

### 방법 2 (Docker) 문제

```bash
# 빌드 실패 시 캐시 무시 재빌드
docker compose build --no-cache

# DB 연결 안 됨 (MySQL 아직 시작 안 됨)
# → 30초 정도 기다린 후 재시도
docker compose logs db  # Ready for connections 확인

# 디스크 공간 부족
docker system prune -a
```
