#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

backup_kind="${1:-daily}"
lock_mode="${2:-}"

if [[ ! "${backup_kind}" =~ ^(daily|predeploy)$ ]]; then
    echo "사용법: backup.sh [daily|predeploy] [--no-lock]" >&2
    exit 2
fi

load_environment

if [[ "${lock_mode}" != "--no-lock" ]]; then
    exec 9>"${LOCK_FILE}"
    flock --exclusive 9
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target_dir="${BACKUP_DIR}/${backup_kind}/${timestamp}"
mkdir -p "${target_dir}"
chmod 700 "${target_dir}"

db_container="$(compose ps --quiet db)"
if [[ -n "${db_container}" ]]; then
    compose exec --no-TTY db sh -c \
        'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --events "$MYSQL_DATABASE"' \
        > "${target_dir}/database.sql"
    chmod 600 "${target_dir}/database.sql"
elif [[ -n "$(current_image_ref)" ]]; then
    echo "기존 배포가 있지만 실행 중인 DB가 없어 백업할 수 없습니다." >&2
    exit 1
fi

image_volume="fitty-staging_image_data"
if docker volume inspect "${image_volume}" >/dev/null 2>&1; then
    backup_image="${IMAGE_REF:-${IMAGE_REPOSITORY}:staging}"
    docker --config "${DOCKER_CONFIG_DIR}" run --rm \
        --entrypoint tar \
        --volume "${image_volume}:/source:ro" \
        "${backup_image}" \
        -C /source -czf - . \
        > "${target_dir}/images.tar.gz"
    chmod 600 "${target_dir}/images.tar.gz"
elif [[ -n "$(current_image_ref)" ]]; then
    echo "기존 배포가 있지만 Fitty 이미지 volume이 없어 백업할 수 없습니다." >&2
    exit 1
fi

{
    printf 'CREATED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'KIND=%s\n' "${backup_kind}"
    printf 'IMAGE_REF=%s\n' "$(current_image_ref)"
} > "${target_dir}/manifest.env"
chmod 600 "${target_dir}/manifest.env"

if [[ "${backup_kind}" == "daily" ]]; then
    find "${BACKUP_DIR}/daily" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf -- {} +
else
    mapfile -t old_backups < <(
        find "${BACKUP_DIR}/predeploy" -mindepth 1 -maxdepth 1 -type d -print \
            | sort -r \
            | tail -n +6
    )
    if ((${#old_backups[@]})); then
        rm -rf -- "${old_backups[@]}"
    fi
fi

printf '%s\n' "${target_dir}"
