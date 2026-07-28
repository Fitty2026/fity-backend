#!/usr/bin/env bash

set -Eeuo pipefail

FITTY_ROOT="${FITTY_ROOT:-/home/kth88/services/products/fitty}"
COMPOSE_FILE="${FITTY_ROOT}/docker-compose.yml"
ENV_FILE="${FITTY_ROOT}/.env"
STATE_DIR="${FITTY_ROOT}/state"
BACKUP_DIR="${FITTY_ROOT}/backups"
DOCKER_CONFIG_DIR="${FITTY_ROOT}/.docker"
LOCK_FILE="${STATE_DIR}/deploy.lock"

mkdir -p "${STATE_DIR}" "${BACKUP_DIR}" "${DOCKER_CONFIG_DIR}"
chmod 700 "${STATE_DIR}" "${BACKUP_DIR}" "${DOCKER_CONFIG_DIR}"

load_environment() {
    if [[ ! -f "${ENV_FILE}" ]]; then
        echo "필수 환경파일이 없습니다: ${ENV_FILE}" >&2
        return 1
    fi
    set -a
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    set +a
    : "${IMAGE_REPOSITORY:?IMAGE_REPOSITORY is required}"
}

compose() {
    docker --config "${DOCKER_CONFIG_DIR}" compose \
        --env-file "${ENV_FILE}" \
        --file "${COMPOSE_FILE}" \
        "$@"
}

validate_image_ref() {
    local image_ref="$1"
    if [[ ! "${image_ref}" =~ ^ghcr\.io/fitty2026/fity-backend@sha256:[0-9a-f]{64}$ ]]; then
        echo "허용되지 않은 image ref입니다: ${image_ref}" >&2
        return 1
    fi
}

image_revision() {
    local image_ref="$1"
    docker --config "${DOCKER_CONFIG_DIR}" image inspect \
        --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
        "${image_ref}"
}

set_runtime_values() {
    local image_ref="$1"
    local app_version="$2"
    local temp_file
    temp_file="$(mktemp "${FITTY_ROOT}/.env.tmp.XXXXXX")"
    chmod 600 "${temp_file}"

    awk -v image_ref="${image_ref}" -v app_version="${app_version}" '
        BEGIN { image_written = 0; version_written = 0 }
        /^IMAGE_REF=/ {
            print "IMAGE_REF=" image_ref
            image_written = 1
            next
        }
        /^APP_VERSION=/ {
            print "APP_VERSION=" app_version
            version_written = 1
            next
        }
        { print }
        END {
            if (!image_written) print "IMAGE_REF=" image_ref
            if (!version_written) print "APP_VERSION=" app_version
        }
    ' "${ENV_FILE}" > "${temp_file}"

    mv "${temp_file}" "${ENV_FILE}"
    chmod 600 "${ENV_FILE}"
    export IMAGE_REF="${image_ref}"
    export APP_VERSION="${app_version}"
}

current_image_ref() {
    if [[ -f "${STATE_DIR}/current.env" ]]; then
        sed -n 's/^IMAGE_REF=//p' "${STATE_DIR}/current.env" | head -n 1
    fi
}

wait_for_database() {
    local container_id
    local status
    for _ in {1..60}; do
        container_id="$(compose ps --quiet db)"
        if [[ -n "${container_id}" ]]; then
            status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}")"
            if [[ "${status}" == "healthy" ]]; then
                return 0
            fi
        fi
        sleep 2
    done
    echo "MySQL health 확인 시간이 초과됐습니다." >&2
    return 1
}

wait_for_api() {
    for _ in {1..30}; do
        if compose exec --no-TTY api node -e \
            "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
            >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
    done
    echo "API health 확인 시간이 초과됐습니다." >&2
    return 1
}

check_external_health() {
    local expected_version="${1:?expected APP_VERSION is required}"
    if [[ "${EXTERNAL_HEALTH_REQUIRED:-false}" != "true" ]]; then
        return 0
    fi

    local curl_args=(--fail --silent --show-error --max-time 15)
    if [[ -n "${CF_ACCESS_CLIENT_ID:-}" && -n "${CF_ACCESS_CLIENT_SECRET:-}" ]]; then
        curl_args+=(
            --header "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}"
            --header "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}"
        )
    fi
    local response
    for _ in {1..15}; do
        if response="$(curl "${curl_args[@]}" "${EXTERNAL_HEALTH_URL:?EXTERNAL_HEALTH_URL is required}")" \
            && compose exec --no-TTY api node -e '
                const response = JSON.parse(process.argv[1]);
                const expected = process.argv[2];
                if (response?.result?.appVersion !== expected) {
                    console.error(`외부 health APP_VERSION 불일치: expected=${expected}, actual=${response?.result?.appVersion}`);
                    process.exit(1);
                }
            ' "${response}" "${expected_version}"; then
            return 0
        fi
        sleep 2
    done
    echo "외부 health 또는 APP_VERSION 확인 시간이 초과됐습니다." >&2
    return 1
}

write_state_atomically() {
    local destination="$1"
    shift
    local temp_file
    temp_file="$(mktemp "${STATE_DIR}/.state.tmp.XXXXXX")"
    chmod 600 "${temp_file}"
    printf '%s\n' "$@" > "${temp_file}"
    mv "${temp_file}" "${destination}"
}
