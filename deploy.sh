#!/usr/bin/env bash
# ============================================================
# 동천교회 서버 배포 스크립트 (서버에서 실행)
#
# 사용법: ./deploy.sh
#   [옵션]
#     -s, --skip-install   npm ci 건너뜀 (package.json 변경 없을 때)
#     -S, --skip-schema    prisma db push 건너뜀 (schema 변경 없을 때)
#     -f, --force-full     전부 실행 (기본)
#     -h, --help           도움말
#
# 기본 순서:
#   1) git pull origin main
#   2) npm ci                 (--skip-install 로 생략 가능)
#   3) npx prisma generate
#   4) npx prisma db push     (--skip-schema 로 생략 가능)
#   5) rm -rf .next && npm run build
#   6) pm2 restart pkistdc
#   7) pm2 flush pkistdc
#   8) 5초 후 에러 로그 확인
# ============================================================

set -e

APP_NAME="pkistdc"
APP_DIR="$HOME/pkistdc"

# 색상
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 옵션 파싱
SKIP_INSTALL=false
SKIP_SCHEMA=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--skip-install) SKIP_INSTALL=true ;;
    -S|--skip-schema)  SKIP_SCHEMA=true ;;
    -f|--force-full)   SKIP_INSTALL=false; SKIP_SCHEMA=false ;;
    -h|--help)
      grep "^#" "$0" | grep -E "사용법|옵션|--" | sed 's/^# //'
      exit 0
      ;;
    *) echo "알 수 없는 옵션: $1"; exit 1 ;;
  esac
  shift
done

step() { echo -e "\n${BLUE}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
err()  { echo -e "${RED}✗ $1${NC}"; }

cd "$APP_DIR" || { err "앱 경로 없음: $APP_DIR"; exit 1; }

step "1) git pull origin main"
git pull --ff-only origin main
ok "git 최신 반영"

if $SKIP_INSTALL; then
  warn "npm ci 건너뜀 (--skip-install)"
else
  step "2) npm ci (의존성 동기화)"
  npm ci --no-audit --no-fund
  ok "의존성 설치 완료"
fi

step "3) npx prisma generate"
npx prisma generate
ok "Prisma 클라이언트 생성"

if $SKIP_SCHEMA; then
  warn "prisma db push 건너뜀 (--skip-schema)"
else
  step "4) npx prisma db push"
  npx prisma db push --accept-data-loss
  ok "DB 스키마 동기화"
fi

step "5) rm -rf .next && npm run build"
rm -rf .next
npm run build
ok "빌드 완료 — BUILD_ID: $(cat .next/BUILD_ID 2>/dev/null || echo 'N/A')"

step "6) pm2 restart $APP_NAME"
pm2 restart "$APP_NAME" --update-env
ok "재시작 완료"

step "7) pm2 flush (로그 비움)"
pm2 flush "$APP_NAME"

step "8) 5초 후 에러 로그 확인"
sleep 5
ERR=$(pm2 logs "$APP_NAME" --err --lines 30 --nostream 2>/dev/null | tail -30)
if [ -z "$ERR" ] || echo "$ERR" | grep -q "^$"; then
  ok "새 에러 없음"
else
  warn "에러 로그 (상위 5줄):"
  echo "$ERR" | head -5
fi

step "완료"
pm2 status | head -6
echo ""
echo -e "${GREEN}✅ 배포 성공${NC}"
