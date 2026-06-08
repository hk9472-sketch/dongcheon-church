#!/usr/bin/env bash
# ============================================================
# 방문자 봇 정리 정기 작업 호출 (crontab 용)
#   /api/cron/visitor-maintenance 를 호출 → 최근 14일 카운트 행태 재집계 +
#   신규 크롤러 IP 대역 자동 등록. (4/26 이전 레거시는 절대 안 건드림)
#
# 인증: 앱 .env 의 CRON_SECRET 을 x-cron-secret 헤더로 전달.
#   → 서버 .env 에 CRON_SECRET="<openssl rand -hex 16>" 추가 필요 (없으면 503, 작업 스킵).
#
# crontab 등록은 deploy/crontab.txt 참고 (매일 03:10 — 04시 이후는 새벽기도 활동 시간).
# ============================================================
set -euo pipefail
APP_DIR="${DC_APP_DIR:-$HOME/pkistdc}"
PORT="${PKISTDC_PORT:-3000}"

TOKEN="$(grep -E '^CRON_SECRET=' "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'\''[:space:]')"
if [ -z "${TOKEN}" ]; then
  echo "$(date '+%F %T') CRON_SECRET 없음(.env) → 스킵"
  exit 0
fi

curl -fsS --max-time 90 -H "x-cron-secret: ${TOKEN}" \
  "http://127.0.0.1:${PORT}/api/cron/visitor-maintenance" \
  && echo " $(date '+%F %T') visitor-maintenance ok" \
  || echo " $(date '+%F %T') visitor-maintenance FAIL"
