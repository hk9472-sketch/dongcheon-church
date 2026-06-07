#!/usr/bin/env bash
# ============================================================
# 동천교회 서버 부트스트랩 — 멱등(여러 번 실행해도 안전)
#
# 서버 복구 / 재설치 시, 코드 배포(dcup) 후 한 번 실행하면
# 손으로 하던 설정(디렉토리·실행권한·PM2 자동시작·로그로테이트·crontab)을
# 한 번에 재적용한다.
#
#     bash ~/pkistdc/deploy/server-bootstrap.sh
#
# sudo / 판단이 필요한 단계는 자동화하지 않고 마지막에 안내만 출력한다.
# 전체 복구 순서는 doc/SERVER-STATE.md 참고.
# ============================================================
set -euo pipefail

APP_DIR="${DC_APP_DIR:-$HOME/pkistdc}"
USER_NAME="$(whoami)"
cd "$APP_DIR"

echo "▶ 1. 백업/로그 디렉토리"
mkdir -p "$HOME/backups/db" "$HOME/backups/data" "$HOME/backups/secret"

echo "▶ 2. 스크립트 실행 권한"
chmod +x deploy/backup.sh deploy/server-bootstrap.sh \
         scripts/poll-live-youtube.sh scripts/git-deploy.sh 2>/dev/null || true

echo "▶ 3. PM2 — 프로세스 등록 + 저장 + 로그로테이트"
if pm2 describe pkistdc >/dev/null 2>&1; then
  echo "   pkistdc 이미 등록됨 (재시작은 dcup 이 담당)"
else
  pm2 start ecosystem.config.js --name pkistdc
fi
pm2 save
# pm2-logrotate (로그 무한 증식 방지)
pm2 install pm2-logrotate >/dev/null 2>&1 || true
pm2 set pm2-logrotate:max_size 10M   >/dev/null 2>&1 || true
pm2 set pm2-logrotate:retain 30      >/dev/null 2>&1 || true
pm2 set pm2-logrotate:compress true  >/dev/null 2>&1 || true

echo "▶ 4. crontab — deploy/crontab.txt 통째 적용 (선언적, 손으로 -e 금지)"
crontab "$APP_DIR/deploy/crontab.txt"
echo "   현재 등록된 cron:"
crontab -l | grep -vE '^\s*#|^\s*$' | sed 's/^/     /'

echo ""
echo "✅ 자동 단계 완료. 아래는 sudo/수동 1회 단계 (복구 시에만 필요):"
echo "   ① PM2 부팅 자동시작:  pm2 startup  →  출력된 'sudo env ...' 줄 1회 실행  →  pm2 save"
echo "   ② SSL 자동갱신 권한:  sudo bash scripts/setup-cert-renew.sh"
echo "   ③ nginx 설정:        nginx/nginx.conf 를 /etc/nginx/sites-available/ 에 반영 후"
echo "                        sudo nginx -t && sudo systemctl reload nginx  (doc/SERVER-STATE.md 참고)"
echo "   ④ 백업 암호 파일:    echo '<강력한암호>' > ~/.dc-backup-pass && chmod 600 ~/.dc-backup-pass"
echo "                        (이 암호는 비번관리자에도 보관 — .env 복호화에 필수)"
echo "   ⑤ (선택) 오프사이트:  ~/pkistdc/.env 또는 cron 환경에 DC_OFFSITE_GCS 설정"
