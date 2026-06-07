#!/usr/bin/env bash
# ============================================================
# 동천교회 일일 백업 — DB + 업로드(data/) + 암호화된 .env
#
# crontab(deploy/crontab.txt) 에서 매일 03:00 KST 호출.
# 수동 실행:  bash ~/pkistdc/deploy/backup.sh
#
# 복구 시 이 스크립트가 만든 산출물로 되돌린다:
#   · DB     : gunzip -c db/<name>_<date>.sql.gz | mysql -u <user> -p <name>
#   · data/  : tar xzf data/data_<date>.tar.gz -C ~/pkistdc
#   · .env   : openssl enc -d -aes-256-cbc -pbkdf2 \
#                -in secret/env_<date>.enc -out ~/pkistdc/.env \
#                -pass file:~/.dc-backup-pass
# ============================================================
set -euo pipefail

APP_DIR="${DC_APP_DIR:-$HOME/pkistdc}"
BK="${DC_BACKUP_DIR:-$HOME/backups}"
PASS_FILE="${DC_BACKUP_PASS_FILE:-$HOME/.dc-backup-pass}"
# 오프사이트 대상(선택). 예: gs://pkistdc-backups  또는  user@host:/srv/pkistdc-backups
OFFSITE="${DC_OFFSITE_GCS:-}"

DATE=$(date +%F)
mkdir -p "$BK/db" "$BK/data" "$BK/secret"

# DATABASE_URL 에서 접속정보 파싱 (mysql://user:pass@host:port/dbname?params)
# shellcheck disable=SC1090
source "$APP_DIR/.env"
DB_USER=$(echo "$DATABASE_URL" | sed -E 's|mysql://([^:]+):.*|\1|')
DB_PASS=$(echo "$DATABASE_URL" | sed -E 's|mysql://[^:]+:([^@]+)@.*|\1|')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^/?]+)(\?.*)?$|\1|')

# ── DB (매일, gzip) ──
MYSQL_PWD="$DB_PASS" mysqldump --no-tablespaces -u "$DB_USER" "$DB_NAME" \
  | gzip > "$BK/db/${DB_NAME}_${DATE}.sql.gz"
echo "[$(date '+%F %T')] DB 백업 완료: ${DB_NAME}_${DATE}.sql.gz"

# ── 업로드 data/ (주간 — 월요일만, 용량 큼) ──
if [ "$(date +%u)" = "1" ]; then
  tar czf "$BK/data/data_${DATE}.tar.gz" -C "$APP_DIR" data
  echo "[$(date '+%F %T')] data/ 백업 완료: data_${DATE}.tar.gz"
fi

# ── .env 암호화 백업 (매일 — 작고, 시크릿의 단일 사본 보존) ──
# 복호화 암호는 ~/.dc-backup-pass 1줄. 이 암호 자체는 반드시 비번관리자에도 보관.
if [ -f "$PASS_FILE" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in "$APP_DIR/.env" -out "$BK/secret/env_${DATE}.enc" \
    -pass file:"$PASS_FILE"
  echo "[$(date '+%F %T')] .env 암호화 백업 완료: env_${DATE}.enc"
else
  echo "[$(date '+%F %T')] ⚠️ $PASS_FILE 없음 → .env 암호화 백업 건너뜀 (doc/SERVER-STATE.md 참고)"
fi

# ── 보존 정리 ──
find "$BK/db"     -name '*.sql.gz'  -mtime +14 -delete
find "$BK/data"   -name '*.tar.gz'  -mtime +90 -delete
find "$BK/secret" -name '*.enc'     -mtime +60 -delete

# ── 오프사이트 (설정 시) — VM 디스크 장애 대비. 미설정이면 건너뜀 ──
if [ -n "$OFFSITE" ]; then
  if [[ "$OFFSITE" == gs://* ]]; then
    gsutil -m rsync -r "$BK" "$OFFSITE" && echo "[$(date '+%F %T')] 오프사이트(GCS) 동기화 완료" \
      || echo "[$(date '+%F %T')] ⚠️ 오프사이트 동기화 실패"
  else
    rsync -az --delete "$BK/" "$OFFSITE/" && echo "[$(date '+%F %T')] 오프사이트(rsync) 완료" \
      || echo "[$(date '+%F %T')] ⚠️ 오프사이트 rsync 실패"
  fi
fi

echo "[$(date '+%F %T')] 백업 작업 종료"
