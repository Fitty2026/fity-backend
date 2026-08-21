#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

desired_ref="${1:-}"
if [[ -z "${desired_ref}" ]]; then
    echo "사용법: deploy.sh ghcr.io/fitty2026/fity-backend@sha256:<digest>" >&2
    exit 2
fi

validate_image_ref "${desired_ref}"
load_environment

exec 9>"${LOCK_FILE}"
flock --exclusive 9

previous_ref="$(current_image_ref)"
if [[ "${previous_ref}" == "${desired_ref}" ]]; then
    echo "이미 배포된 image digest입니다: ${desired_ref}"
    exit 0
fi

docker --config "${DOCKER_CONFIG_DIR}" pull "${desired_ref}"
revision="$(image_revision "${desired_ref}")"
if [[ ! "${revision}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "이미지 revision label이 유효하지 않습니다: ${revision}" >&2
    exit 1
fi

previous_version=""
if [[ -f "${STATE_DIR}/current.env" ]]; then
    previous_version="$(sed -n 's/^APP_VERSION=//p' "${STATE_DIR}/current.env" | head -n 1)"
fi

api_was_running=false
if [[ -n "$(compose ps --quiet api)" ]]; then
    api_was_running=true
    compose stop api
fi

if ! backup_path="$("${SCRIPT_DIR}/backup.sh" predeploy --no-lock)"; then
    if [[ "${api_was_running}" == "true" ]]; then
        compose start api || true
    fi
    echo "배포 전 백업에 실패해 배포를 중단했습니다." >&2
    exit 1
fi

migration_started=false
rollback_deployment() {
    local original_status=$?
    local recovery_ok=true

    trap - ERR
    set +e
    echo "새 배포 검증에 실패해 배포 직전 상태로 복구합니다." >&2
    write_state_atomically "${STATE_DIR}/rejected.env" \
        "IMAGE_REF=${desired_ref}" \
        "REJECTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        "BACKUP_PATH=${backup_path}" \
        "MIGRATION_STARTED=${migration_started}" \
        || true

    if [[ "${migration_started}" == "true" ]]; then
        echo "부분 적용 가능성이 있는 DB·이미지를 배포 직전 백업에서 복원합니다: ${backup_path}" >&2
        if ! restore_backup_contents "${backup_path}" "${previous_ref:-${desired_ref}}"; then
            recovery_ok=false
        fi
    elif ! compose stop api >/dev/null 2>&1; then
        recovery_ok=false
    fi

    if [[ "${recovery_ok}" == "true" && -n "${previous_ref}" ]]; then
        set_runtime_values "${previous_ref}" "${previous_version:-unknown}" || recovery_ok=false
        if [[ "${recovery_ok}" == "true" ]]; then
            compose up --detach api || recovery_ok=false
        fi
        if [[ "${recovery_ok}" == "true" ]]; then
            wait_for_api || recovery_ok=false
        fi
        if [[ "${recovery_ok}" == "true" ]]; then
            compose exec --no-TTY api node /app/scripts/staging-smoke.mjs || recovery_ok=false
        fi
    elif [[ -z "${previous_ref}" ]]; then
        compose stop api >/dev/null 2>&1 || true
        compose rm --force api >/dev/null 2>&1 || true
    fi

    if [[ "${recovery_ok}" != "true" ]]; then
        compose stop api >/dev/null 2>&1 || true
        write_state_atomically "${STATE_DIR}/hold.env" \
            "REASON=automatic-deploy-recovery-failed" \
            "BACKUP_PATH=${backup_path}" \
            "CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            || true
        echo "자동 복구에 실패해 API를 중지하고 자동 배포 hold를 설정했습니다: ${backup_path}" >&2
    fi

    if ((original_status == 0)); then
        original_status=1
    fi
    exit "${original_status}"
}
trap rollback_deployment ERR

set_runtime_values "${desired_ref}" "${revision}"
compose up --detach db
wait_for_database
applied_migrations="$(
    compose exec --no-TTY db sh -c \
        'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at" 2>/dev/null || true' \
        | paste -sd, -
)"
compose --profile tools run --rm \
    --entrypoint node \
    --env "APPLIED_MIGRATIONS=${applied_migrations}" \
    --env "ALLOW_DESTRUCTIVE_MIGRATIONS=${ALLOW_DESTRUCTIVE_MIGRATIONS:-false}" \
    migrate \
    /app/scripts/check-migrations.mjs
migration_started=true
compose --profile tools run --rm migrate
compose up --detach api
wait_for_api
compose exec --no-TTY api node /app/scripts/staging-smoke.mjs
check_external_health "${revision}"

migrations="$(
    compose exec --no-TTY db sh -c \
        'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at"' \
        | paste -sd, -
)"

if [[ -f "${STATE_DIR}/current.env" ]]; then
    cp "${STATE_DIR}/current.env" "${STATE_DIR}/previous.env"
    chmod 600 "${STATE_DIR}/previous.env"
fi

write_state_atomically "${STATE_DIR}/current.env" \
    "IMAGE_REF=${desired_ref}" \
    "APP_VERSION=${revision}" \
    "DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "MIGRATIONS=${migrations}" \
    "BACKUP_PATH=${backup_path}"

rm -f -- "${STATE_DIR}/rejected.env" "${STATE_DIR}/hold.env"
trap - ERR
echo "Fitty staging 배포 완료: ${revision}"
