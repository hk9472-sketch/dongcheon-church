# 서버 상태 인벤토리 (SERVER-STATE)

> **목적**: 서버에서 손으로 만든 모든 설정을 한 곳에 모아, 장애 복구·재설치 시
> 기억에 의존하지 않고 **한 번에 재현**하기 위한 단일 체크리스트.
>
> 원칙: 수동 설정(`crontab -e`, nginx 편집 등)을 직접 하지 말고 **저장소의 산출물을
> 고친 뒤 통째로 적용**한다(선언적·멱등). 새 설정이 생기면 반드시 여기와 해당 산출물에 반영.

관련 문서: 신규 설치 전체 절차는 [SETUP_GCE.md](../SETUP_GCE.md), 운영 가이드는 [DEPLOY.md](../DEPLOY.md).

---

## 1. 서버 기본 정보

| 항목 | 값 |
|---|---|
| 호스트 | GCE VM (asia-northeast3) |
| 실행 계정 | `hk9472` |
| 앱 루트 | `~/pkistdc` (= `/home/hk9472/pkistdc`) |
| 프로세스 관리 | PM2, 프로세스명 **`pkistdc`** |
| 포트 | 3000 (nginx 리버스 프록시 뒤) |
| 도메인 | pkistdc.net (Let's Encrypt SSL) |

---

## 2. 서버 상태 인벤토리 — "손댄 모든 지점"

각 행은 **어디 사는지** + **무엇으로 재현되는지**. 산출물이 있으면 그걸 실행, 없으면 문서 절차.

| # | 상태 | 위치(서버) | 재현 산출물 / 방법 |
|---|---|---|---|
| 1 | 시스템 패키지 (Node20, MySQL8, nginx, pm2, certbot, build-essential) | OS 전역 | [SETUP_GCE.md §3](../SETUP_GCE.md) 명령 |
| 2 | 앱 소스 | `~/pkistdc` | `git clone` + `dcup` (git pull 배포) |
| 3 | npm 의존성 / Prisma client / DB 스키마 | `~/pkistdc/node_modules`, MySQL | `dcup` 가 `npm ci` + `prisma generate` + `db push` 자동 |
| 4 | **`.env` 시크릿** | `~/pkistdc/.env` (gitignore) | **암호화 백업본**(§4) 복호화. 키 목록은 [.env.example](../.env.example) |
| 5 | PM2 프로세스 등록 + 부팅 자동시작 | `~/.pm2/`, systemd | `deploy/server-bootstrap.sh` + `pm2 startup`(sudo 1회) |
| 6 | PM2 로그로테이트 | pm2 모듈 | `deploy/server-bootstrap.sh` (자동) |
| 7 | **crontab** (poll·백업·offsite·cert) | `crontab -l` | **`deploy/crontab.txt`** → `crontab deploy/crontab.txt` |
| 8 | nginx 리버스 프록시 + 레거시 리다이렉트 | `/etc/nginx/sites-*` | [`nginx/nginx.conf`](../nginx/nginx.conf), [`scripts/nginx-legacy*.conf`](../scripts/) → §5 |
| 9 | SSL 인증서 + 자동갱신 권한 | `/etc/letsencrypt`, sudoers | `certbot` 발급 + `scripts/setup-cert-renew.sh`(sudo 1회) |
| 10 | DB 데이터 | MySQL `dongcheon` | 일일 백업(§4) 복원 |
| 11 | DB 설정값 (테마·예배윈도우·youtube_api_key·live_worship_url 등) | MySQL `site_settings` | DB 백업에 포함 (#10) |
| 12 | 업로드 파일 (~1.7GB) | `~/pkistdc/data/` (gitignore) | 주간 백업(§4) 복원 |
| 13 | ro_user / SSH 터널 (개발 PC MCP 접속용) | MySQL grant, 로컬 | [project_db_remote_access](../) — 개발측, 서버 복구와 무관 |
| 14 | 방화벽 (80/443/22, 3000 차단) | GCE 방화벽 규칙 | [SETUP_GCE.md §1](../SETUP_GCE.md) |

---

## 3. 배포 / 부트스트랩 산출물 (`deploy/`)

| 파일 | 역할 | 실행 |
|---|---|---|
| `deploy/crontab.txt` | **모든 cron 의 단일 진실**. 손으로 `crontab -e` 금지 | `crontab ~/pkistdc/deploy/crontab.txt` |
| `deploy/backup.sh` | DB + data/ + 암호화 .env 백업 + 보존정리 + (선택)오프사이트 | cron 자동 / 수동 `bash deploy/backup.sh` |
| `deploy/server-bootstrap.sh` | 멱등 프로비저닝 (디렉토리·권한·PM2·로그로테이트·crontab) | `bash ~/pkistdc/deploy/server-bootstrap.sh` |
| `scripts/poll-live-youtube.sh` | 실시간 예배 YouTube 폴링 (cron 매분) | crontab 에서 호출 |
| `scripts/setup-cert-renew.sh` | SSL 자동갱신 버튼용 root 스크립트 + sudoers (sudo 1회) | `sudo bash scripts/setup-cert-renew.sh` |
| `scripts/git-deploy.sh` | `dcup` 본체 — git pull → 빌드 → pm2 restart | `dcup` |

---

## 4. 시크릿(.env) 백업 · 복구 — **가장 중요**

`.env` 는 git 에 없다(gitignore). 특히 **`RRN_ENCRYPTION_KEY` 분실 = 기부자 주민번호 영구 복구 불가**.

**백업 (자동)**: `deploy/backup.sh` 가 매일 `.env` 를 AES-256 으로 암호화해
`~/backups/secret/env_<날짜>.enc` 로 저장하고, 오프사이트 설정 시 외부로도 복사한다.

- 복호화 암호는 `~/.dc-backup-pass` 1줄. 최초 1회 생성:
  ```bash
  echo '<길고 강력한 암호>' > ~/.dc-backup-pass && chmod 600 ~/.dc-backup-pass
  ```
- ⚠️ **이 암호 자체는 서버 밖(비밀번호 관리자 1Password/Bitwarden 등)에도 반드시 보관.**
  암호를 잃으면 암호화 백업도 못 푼다 → "시크릿의 시크릿"이 단일 실패점.

**복구**:
```bash
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in ~/backups/secret/env_<날짜>.enc -out ~/pkistdc/.env \
  -pass file:~/.dc-backup-pass
```

---

## 5. nginx 반영 (수동, sudo)

```bash
sudo cp ~/pkistdc/nginx/nginx.conf /etc/nginx/sites-available/pkistdc
sudo ln -sf /etc/nginx/sites-available/pkistdc /etc/nginx/sites-enabled/pkistdc
sudo rm -f /etc/nginx/sites-enabled/default      # 기본 설정 충돌 제거
sudo nginx -t && sudo systemctl reload nginx
```
> conf 가 sites-available 포맷이 아니거나 server_name/cert 경로가 다르면
> [SETUP_GCE.md §8](../SETUP_GCE.md) 의 전체 nginx 설정을 기준으로 맞춘다.

---

## 6. 전체 복구 순서 (새 VM 기준)

1. VM 생성 + 방화벽(80/443/22) — [SETUP_GCE.md §1](../SETUP_GCE.md)
2. 패키지 설치 (Node/MySQL/nginx/pm2/certbot) — [SETUP_GCE.md §3](../SETUP_GCE.md)
3. MySQL DB/계정 생성 + **최신 DB 백업 복원** (§4 / [SETUP_GCE.md §4](../SETUP_GCE.md))
4. `git clone` → `~/pkistdc`
5. **`.env` 복구** (§4 복호화) — 또는 [.env.example](../.env.example) 기준 재작성
6. `~/.dc-backup-pass` 재생성 (비번관리자에서 가져온 암호로)
7. `dcup` — 의존성·prisma·빌드·pm2 기동
8. **`bash deploy/server-bootstrap.sh`** — 디렉토리·PM2·로그로테이트·crontab 일괄
9. `pm2 startup` 출력 sudo 줄 실행 → `pm2 save` (부팅 자동시작)
10. nginx 반영 (§5) + `sudo bash scripts/setup-cert-renew.sh`
11. certbot 인증서 발급/복원 (`/etc/letsencrypt` 백업 있으면 복원, 없으면 재발급)
12. **`data/` 업로드 복원** (주간 백업 tar 해제)
13. 헬스 체크: `pm2 status`, `https://pkistdc.net/api/health`

---

## 7. 새 설정을 추가할 때 (규칙)

서버에서 뭔가 새로 손대게 되면 **그 자리에서 끝내지 말고**:

- cron → `deploy/crontab.txt` 에 추가
- 설치/권한/프로비저닝 → `deploy/server-bootstrap.sh` 에 멱등하게 추가
- 새 .env 키 → `.env.example` 에 주석과 함께 추가
- 그 외 수동 절차 → 이 문서 §2 인벤토리에 행 추가

→ commit & push. 그래야 다음 복구 때 자동으로 재현된다.
