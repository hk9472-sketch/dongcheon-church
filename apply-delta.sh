#!/usr/bin/env bash
# ============================================================
# apply-delta.sh — delta.tar.gz 를 현재 앱 경로에 적용 + 재빌드 + 재시작
#
# 사용법:
#   ./apply-delta.sh <delta.tar.gz>
#
# 동작:
#   1) 아카이브 전개 (현재 디렉터리 기준으로 파일 덮어쓰기)
#   2) prisma schema 변경 감지 → prisma generate + db push
#   3) package(-lock).json 변경 감지 → npm ci
#   4) .next 삭제 + npm run build (서버에서 빌드 — 교차 플랫폼 이슈 회피)
#   5) pm2 restart pkistdc + flush
#   6) 5초 후 에러 로그 확인
#
# 주의: 반드시 앱 루트(~/pkistdc 등)에서 실행.
# ============================================================
set -e

APP_NAME="pkistdc"

# 색상
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
step() { echo -e "\n${BLUE}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
err()  { echo -e "${RED}✗ $1${NC}"; }

DELTA="${1:-}"
if [ -z "$DELTA" ] || [ ! -f "$DELTA" ]; then
  err "사용법: $0 <delta.tar.gz>"
  exit 1
fi

# 무결성 확인
step "아카이브 검증"
CHANGED=$(tar -tzf "$DELTA" 2>/dev/null || { err "tar 읽기 실패: $DELTA"; exit 1; })
COUNT=$(echo "$CHANGED" | wc -l)
ok "$COUNT 개 항목"

# 백업 (선택)
BACKUP_DIR="$HOME/.pkistdc-delta-backup/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
# 덮어쓰기 전 원본 저장 (기존 파일만)
while IFS= read -r f; do
  # 디렉터리 스킵
  [[ "$f" == */ ]] && continue
  # 앞의 ./ 제거
  rel="${f#./}"
  if [ -f "$rel" ]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    cp -p "$rel" "$BACKUP_DIR/$rel" 2>/dev/null || true
  fi
done <<< "$CHANGED"
ok "이전 파일 백업: $BACKUP_DIR"

step "1) delta 전개"
tar -xzf "$DELTA"
ok "전개 완료"

# 스키마 변경?
if echo "$CHANGED" | grep -qE '(^|/)prisma/schema\.prisma$'; then
  step "2) prisma schema 변경 감지 → generate + db push"
  npx prisma generate
  npx prisma db push --accept-data-loss
  ok "DB 스키마 동기화"
else
  warn "2) schema 변경 없음 → prisma generate 는 혹시 모를 환경차 대비로만 실행"
  npx prisma generate >/dev/null 2>&1 || true
fi

# 의존성 변경?
if echo "$CHANGED" | grep -qE '(^|/)(package|package-lock)\.json$'; then
  step "3) package(-lock).json 변경 감지 → npm ci"
  npm ci --no-audit --no-fund
  ok "의존성 동기화"
else
  warn "3) package(-lock).json 변경 없음 → npm ci 생략"
fi

step "4) 빌드"
rm -rf .next
npm run build
ok "빌드 완료 — BUILD_ID: $(cat .next/BUILD_ID 2>/dev/null || echo N/A)"

step "5) PM2 재시작 + 로그 flush"
pm2 restart "$APP_NAME" --update-env >/dev/null
pm2 flush "$APP_NAME" >/dev/null
ok "재시작 완료"

step "6) 5초 후 에러 로그 확인"
sleep 5
ERR=$(pm2 logs "$APP_NAME" --err --lines 15 --nostream 2>/dev/null | tail -20)
TRIM=$(echo "$ERR" | grep -v '^$' | grep -v 'Tailing last' | grep -v '^/home' | grep -v 'last .* lines:')
if [ -z "$TRIM" ]; then
  ok "새 에러 없음"
else
  warn "에러 상위:"
  echo "$ERR" | head -10
fi

echo ""
pm2 status | head -6
echo ""
echo -e "${GREEN}✅ 적용 완료${NC}"
echo ""
echo "문제 시 롤백: 백업 경로 $BACKUP_DIR"
