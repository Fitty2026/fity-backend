# Fitty staging 운영

이 디렉터리는 `/home/kth88/services/products/fitty`에 설치되는 Fitty 전용 배포·백업·롤백 도구입니다. 공용 Traefik, Cloudflare Tunnel 및 다른 프로젝트를 수정하지 않습니다.

## 서버 파일

- `.env`: 실제 secret, 현재 `IMAGE_REF`, `APP_VERSION`, 배포된 프런트 빌드의 `FRONTEND_COMMIT_SHA`를 포함하며 mode 600
- `.docker/config.json`: Fitty GHCR pull 전용 credential
- `docker-compose.yml`: `api`, `migrate`, `db`
- `api.network.env`: DockerNetworkAutoSettings 입력
- `state/current.env`, `state/previous.env`: 성공한 배포 이력
- `backups/daily`, `backups/predeploy`: 데이터 백업

## 최초 설치

1. 기존 `/home/kth88/services/products/fitty/network.env`가 있으면 `state/pre-install/`에 보존합니다.
2. 저장소의 `docker-compose.yml`, `api.network.env`, `deploy/`를 Fitty 경로에 복사합니다.
3. `deploy/staging.env.example`을 `.env`로 복사하고 모든 `change-me` 값을 교체합니다.
4. `.env`, `.docker`, `state`, `backups`는 다른 사용자가 읽지 못하도록 mode 600/700을 적용합니다.
5. Fitty 전용 Docker config로 GHCR에 `read:packages` login을 수행합니다.
6. 첫 이미지를 `deploy/bin/deploy.sh <digest>`로 배포합니다. 초기에는 `EXTERNAL_HEALTH_REQUIRED=false`로 둡니다.
7. 원격 `DockerNetworkAutoSettings`를 Fitty 프로젝트에 one-shot 적용해 `api.network.env` 라우팅을 Compose에 병합합니다.
8. `https://fitty.gubiko.dev/health`가 성공하면 `EXTERNAL_HEALTH_REQUIRED=true`로 바꾸고 user timer를 설치합니다.

`ALLOW_DESTRUCTIVE_MIGRATIONS=true`이면 배포 전 백업이 성공한 뒤 `DROP COLUMN` 같은
파괴적 migration도 자동 적용합니다. `-- FITTY: MANUAL_DEPLOY_REQUIRED` 표식이 있는
migration은 이 설정과 관계없이 계속 차단됩니다.

`api.network.env`의 `PORT=3000`은 호스트 포트가 아니라 Traefik이 연결할 컨테이너 내부 포트입니다. `NAME=fitty-api`이므로 Docker 컨테이너와 Traefik router/service 이름 모두 `fitty-api`를 사용합니다.

## 일상 명령

```bash
cd /home/kth88/services/products/fitty

# 상태와 로그
docker compose --env-file .env -f docker-compose.yml ps
docker compose --env-file .env -f docker-compose.yml logs --tail 200 api db
systemctl --user status fitty-staging-poll.timer

# 즉시 이미지 확인 및 배포
deploy/bin/poll-and-deploy.sh

# 직전 정상 이미지로 앱만 롤백
deploy/bin/rollback.sh

# 수동 롤백/복원 뒤 자동 배포 재개
deploy/bin/resume-auto-deploy.sh --confirm

# 수동 백업
deploy/bin/backup.sh daily

# 기준 시연 옷장을 기존 계정에 복제
docker compose --env-file .env -f docker-compose.yml exec api npm run demo:closet:sync

# 이전에 복제한 시연 옷장만 최신 원본으로 교체 (개인 등록 옷은 유지)
docker compose --env-file .env -f docker-compose.yml exec api npm run demo:closet:sync -- --replace

# migration 문제 시 Fitty DB와 이미지 volume을 선택한 백업으로 복원
deploy/bin/restore-backup.sh backups/predeploy/<timestamp> --confirm-fitty-db-restore
```

## 전체 취소

```bash
deploy/bin/teardown.sh --confirm-fitty-only
```

이 명령은 Fitty 컨테이너와 Fitty timer만 제거합니다. DB·이미지 volume, 백업, `traefik-net`, 공용 Traefik과 Cloudflare Tunnel은 제거하지 않습니다. `docker compose down --volumes`, `docker system prune`, `docker network rm traefik-net`은 사용하지 않습니다.

`api.network.env` 삭제 후 DockerNetworkAutoSettings를 다시 실행하면 도구가 관리한 Traefik 라벨과 network 연결을 제거합니다. 도구가 생성한 `.network-auto-state.json`과 `old.docker-compose.yml`은 원인 분석과 복원 확인 전 삭제하지 않습니다.

## 장애 경계

- 앱 rollback은 Prisma migration을 downgrade하지 않습니다.
- `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, 위험한 `ALTER` 및 `-- FITTY: MANUAL_DEPLOY_REQUIRED`를 포함한 pending migration은 자동 배포에서 차단합니다.
- 자동 배포에서 migration 실행이 시작된 뒤 검증이 실패하면 API를 중지한 채 배포 직전 DB·이미지 backup을 복원하고, 복원이 끝난 뒤에만 직전 앱을 기동합니다.
- 자동 복원에 실패하면 API를 중지하고 자동 배포 hold를 활성화합니다. 이 경우 backup과 Prisma migration 상태를 확인한 뒤 `restore-backup.sh`로 명시적으로 복구합니다.
- 실패한 digest는 다음 tag가 발행될 때까지 다시 시도하지 않으며, 수동 롤백·백업 복원은 자동 배포 hold를 활성화합니다.
- 프로세스 내부에서 실행 중인 코디 생성 작업은 앱 재시작 시 중단될 수 있습니다.
- 현재 이미지 저장은 단일 Docker volume이므로 API replica를 늘리지 않습니다.
