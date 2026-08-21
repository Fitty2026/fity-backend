#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

backup_path="${1:-}"
confirmation="${2:-}"
if [[ -z "${backup_path}" || "${confirmation}" != "--confirm-fitty-db-restore" ]]; then
    echo "사용법: restore-backup.sh <backup-directory> --confirm-fitty-db-restore" >&2
    exit 2
fi

load_environment
backup_path="$(realpath "${backup_path}")"
backup_root="$(realpath "${BACKUP_DIR}")"
if [[ "${backup_path}" != "${backup_root}/"* || ! -f "${backup_path}/database.sql" ]]; then
    echo "Fitty backup 경로 또는 database.sql이 유효하지 않습니다: ${backup_path}" >&2
    exit 1
fi

exec 9>"${LOCK_FILE}"
flock --exclusive 9

rescue_path="$("${SCRIPT_DIR}/backup.sh" predeploy --no-lock)"
write_state_atomically "${STATE_DIR}/hold.env" \
    "REASON=backup-restore-in-progress" \
    "BACKUP_PATH=${backup_path}" \
    "CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
restore_failed() {
    trap - ERR
    compose stop api >/dev/null 2>&1 || true
    echo "백업 복원에 실패했습니다. 구조 복구 전 API를 중지 상태로 유지합니다. 구조 전 백업: ${rescue_path}" >&2
}
trap restore_failed ERR

restore_backup_contents "${backup_path}" "${IMAGE_REF}"

compose up --detach api
wait_for_api
write_state_atomically "${STATE_DIR}/hold.env" \
    "REASON=backup-restore" \
    "BACKUP_PATH=${backup_path}" \
    "CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
trap - ERR
echo "Fitty DB·이미지 백업 복원 완료: ${backup_path} (자동 배포 hold 활성)"
