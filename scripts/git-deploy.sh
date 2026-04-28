#!/bin/bash
# =====================================================================
# git-deploy.sh — GitHub main → 서버 자동 동기화 + 빌드 + 재시작
# =====================================================================
# 사용:
#   cd ~/pkistdc
#   ./scripts/git-deploy.sh
#
# 동작:
#   1. git fetch + 변경 파일 출력
#   2. git reset --hard origin/main 으로 동기화
#   3. package(-lock).json 변경 감지 → npm ci
#   4. prisma/schema.prisma 변경 감지 → prisma generate + db push
#   5. .next 삭제 + npm run build
#   6. pm2 restart pkistdc + pm2 flush
#   7. 5초 후 pm2 status + 에러 로그 자동 확인
#
# 사전 1회 설정 (저장소 연동):
#   cd ~/pkistdc
#   git init
#   git remote add origin https://<TOKEN>@github.com/hk9472-sketch/dongcheon-church.git
#   # (또는 public 화 후 토큰 없이 https://github.com/...)
#   git fetch origin main --depth=1
#   git reset --hard origin/main
#
# .env / node_modules / data / .next 등은 .gitignore 에 있어
# git reset 영향 받지 않음 (untracked 로 보존).
# =====================================================================

set -e

# 저장소 루트로 이동 (스크립트가 어디서 호출되든 안전)
cd "$(dirname "$0")/.."

if [ ! -d .git ]; then
  echo "ERROR: 여기는 git 저장소가 아닙니다. ~/pkistdc 에서 git init + remote add 먼저 진행하세요."
  exit 1
fi

# 점검 플래그(/tmp/pkistdc-maintenance) 는 dcup 가 자동으로 안 켬.
# 이미 페이지 보고 있는 사용자에게는 영향 없고, pm2 재시작 5~30초 동안 새 요청 보낸
# 사용자만 nginx 의 error_page 502/503/504 = @maintenance 로 자연 fallback.
# 강제 점검 필요 시 (DB 큰 작업 등) 사용자가 직접:
#   sudo touch /tmp/pkistdc-maintenance   # 모든 사용자 점검 페이지로
#   sudo rm   /tmp/pkistdc-maintenance    # 정상 복귀

PREV=$(git rev-parse HEAD 2>/dev/null || echo "")

echo "=== 1) git fetch ==="
git fetch origin main --depth=50

if [ -n "$PREV" ]; then
  echo ""
  echo "=== 변경 파일 ==="
  git diff --name-only "$PREV" origin/main || true
fi

echo ""
echo "=== 2) git reset --hard origin/main ==="
git reset --hard origin/main
NEW=$(git rev-parse HEAD)

if [ "$PREV" = "$NEW" ] && [ "${1:-}" != "--force" ]; then
  echo ""
  echo "최신 상태 — 빌드/재시작 생략 (강제 빌드 원하면 --force)"
  exit 0
fi

CHANGED_FILES=$(git diff --name-only "$PREV" "$NEW" 2>/dev/null || echo "")

# 3) 의존성 변경 감지
if echo "$CHANGED_FILES" | grep -qE "^(package|package-lock)\.json$"; then
  echo ""
  echo "=== 3) npm ci (의존성 변경 감지) ==="
  npm ci
fi

# 4) prisma 변경 감지
if echo "$CHANGED_FILES" | grep -q "^prisma/schema.prisma$"; then
  echo ""
  echo "=== 4) prisma generate + db push (스키마 변경 감지) ==="
  npx prisma generate
  npx prisma db push
fi

# 5) 빌드
echo ""
echo "=== 5) build ==="
rm -rf .next
npm run build

# 6) 재시작
echo ""
echo "=== 6) pm2 restart ==="
pm2 restart pkistdc
pm2 flush

# 7) 헬스 체크 — origin 응답할 때까지 최대 30초 대기
echo ""
echo "=== 7) 헬스 체크 ==="
HEALTHY=0
for i in $(seq 1 30); do
  if curl -sSf -m 2 -o /dev/null http://127.0.0.1:3000/ 2>/dev/null; then
    echo "  origin 응답 OK (${i}초)"
    HEALTHY=1
    break
  fi
  sleep 1
done
if [ "$HEALTHY" != "1" ]; then
  echo "  WARN: 30초 안에 origin 응답 없음 — pm2 logs 확인 필요"
fi

echo ""
echo "=== pm2 status ==="
pm2 list | grep -E "pkistdc|name" || pm2 list

echo ""
echo "=== 최근 에러 로그 (있으면 표시) ==="
pm2 logs pkistdc --lines 30 --nostream --err 2>/dev/null | tail -20 || true

echo ""
echo "=== 배포 완료 ==="
echo "이전: ${PREV:-<없음>}"
echo "현재: $NEW"
