#!/usr/bin/env bash
# ============================================================
# 실시간 예배 YouTube 시청자 폴링 (서버 cron 용)
#
# 왜 필요한가:
#   기존엔 누군가 /live 페이지를 열고 있을 때만 폴링이 돌아서,
#   그 시간에 사이트 방문자가 없는 예배(예: 장년반 오전)는 통계가 통째로 누락됐다.
#   이 스크립트를 cron 으로 1분마다 호출하면 방문자 유무와 무관하게 모든 예배가 기록된다.
#
# 안전성(quota):
#   pollYoutubeViewers() 는 예배 윈도우 밖이면 YouTube API 호출 0건(캐시 반환)이라
#   연중 매분 호출해도 quota 가 닳지 않는다. 윈도우 안에서만 실제 폴링이 일어난다.
#
# crontab 등록 (매분):
#   crontab -e 후 아래 한 줄 추가
#   * * * * * bash /home/hk9472/pkistdc/scripts/poll-live-youtube.sh >> /home/hk9472/pkistdc/logs/poll-yt.log 2>&1
#
# 30초 간격이 필요하면 두 줄:
#   * * * * * bash /home/hk9472/pkistdc/scripts/poll-live-youtube.sh
#   * * * * * sleep 30; bash /home/hk9472/pkistdc/scripts/poll-live-youtube.sh
# ============================================================
PORT="${PKISTDC_PORT:-3000}"
curl -fsS --max-time 20 "http://127.0.0.1:${PORT}/api/live/youtube-viewers" -o /dev/null \
  && echo "$(date '+%Y-%m-%d %H:%M:%S') poll ok" \
  || echo "$(date '+%Y-%m-%d %H:%M:%S') poll FAIL (exit $?)"
