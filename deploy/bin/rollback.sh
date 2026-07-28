#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

load_environment

target_ref="${1:-}"
target_version=""
if [[ -z "${target_ref}" ]]; then
    if [[ ! -f "${STATE_DIR}/previous.env" ]]; then
        echo "직전 배포 상태가 없습니다." >&2
        exit 1
    fi
    target_ref="$(sed -n 's/^IMAGE_REF=//p' "${STATE_DIR}/previous.env" | head -n 1)"
    target_version="$(sed -n 's/^APP_VERSION=//p' "${STATE_DIR}/previous.env" | head -n 1)"
fi
validate_image_ref "${target_ref}"

exec 9>"${LOCK_FILE}"
flock --exclusive 9

current_ref="$(current_image_ref)"
current_version="$(sed -n 's/^APP_VERSION=//p' "${STATE_DIR}/current.env" 2>/dev/null | head -n 1)"
if [[ -z "${current_ref}" ]]; then
    echo "현재 성공 배포 상태가 없어 앱 롤백을 수행할 수 없습니다." >&2
    exit 1
fi
if [[ "${current_ref}" == "${target_ref}" ]]; then
    echo "이미 현재 배포된 이미지입니다."
    exit 0
fi

docker --config "${DOCKER_CONFIG_DIR}" pull "${target_ref}"
if [[ -z "${target_version}" ]]; then
    target_version="$(image_revision "${target_ref}")"
fi
if [[ ! "${target_version}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "롤백 이미지 revision label이 유효하지 않습니다: ${target_version}" >&2
    exit 1
fi

set_runtime_values "${target_ref}" "${target_version}"
if ! compose up --detach api \
    || ! wait_for_api \
    || ! compose exec --no-TTY api node /app/scripts/staging-smoke.mjs \
    || ! check_external_health "${target_version}"; then
    echo "롤백 대상 이미지가 정상 기동되지 않아 원래 앱으로 복귀합니다." >&2
    set_runtime_values "${current_ref}" "${current_version:-unknown}"
    compose up --detach api
    wait_for_api || true
    exit 1
fi

if [[ -f "${STATE_DIR}/current.env" ]]; then
    cp "${STATE_DIR}/current.env" "${STATE_DIR}/previous.env"
    chmod 600 "${STATE_DIR}/previous.env"
fi
write_state_atomically "${STATE_DIR}/current.env" \
    "IMAGE_REF=${target_ref}" \
    "APP_VERSION=${target_version}" \
    "DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "MIGRATIONS=unchanged" \
    "BACKUP_PATH=manual-rollback"
write_state_atomically "${STATE_DIR}/hold.env" \
    "REASON=manual-rollback" \
    "CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Fitty staging 앱 롤백 완료: ${target_version} (자동 배포 hold 활성)"
