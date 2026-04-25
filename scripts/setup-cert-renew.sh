#!/bin/bash
# ============================================================
# /admin/certificate 페이지의 "갱신 시도" 버튼이 동작하려면
# 한 번만 실행해 root 권한 스크립트 + sudoers 설정.
#
# 실행: sudo bash scripts/setup-cert-renew.sh
# ============================================================
set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "❌ root 로 실행하세요: sudo bash $0"
  exit 1
fi

# 1. 갱신 스크립트 (root 소유, 누구나 실행은 가능, 쓰기는 root 만)
cat > /usr/local/bin/dc-cert-renew <<'SCRIPT'
#!/bin/bash
set -euo pipefail
echo "[$(date '+%F %T')] Starting cert renewal"
/usr/bin/certbot renew --quiet --no-self-upgrade
echo "[$(date '+%F %T')] Reloading nginx"
/usr/bin/systemctl reload nginx 2>/dev/null || true
echo "[$(date '+%F %T')] Done"
SCRIPT
chmod 755 /usr/local/bin/dc-cert-renew
chown root:root /usr/local/bin/dc-cert-renew
echo "✅ /usr/local/bin/dc-cert-renew 작성"

# 2. sudoers — Next.js 실행 계정(hk9472)이 비번 없이 이 스크립트만 실행 가능
TARGET_USER="${SUDO_USER:-hk9472}"
cat > /etc/sudoers.d/dc-cert-renew <<SUDOERS
# /admin/certificate 의 자동 갱신 버튼이 사용
$TARGET_USER ALL=(root) NOPASSWD: /usr/local/bin/dc-cert-renew
SUDOERS
chmod 440 /etc/sudoers.d/dc-cert-renew
visudo -cf /etc/sudoers.d/dc-cert-renew  # 문법 검증
echo "✅ /etc/sudoers.d/dc-cert-renew 등록 (사용자: $TARGET_USER)"

# 3. 동작 확인 (실제 갱신은 안 됨, dry run)
echo ""
echo "── 검증: $TARGET_USER 가 비번 없이 스크립트 실행 가능한지 ──"
sudo -u "$TARGET_USER" sudo -n -l /usr/local/bin/dc-cert-renew && echo "✅ NOPASSWD 설정 OK" || echo "⚠️ 설정 확인 필요"

echo ""
echo "셋업 완료. /admin/certificate 페이지에서 [인증서 갱신 시도] 버튼 사용 가능."
