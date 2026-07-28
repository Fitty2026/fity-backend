#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

load_environment

if [[ -f "${STATE_DIR}/hold.env" ]]; then
    echo "수동 롤백 hold가 활성화되어 자동 배포를 건너뜁니다."
    exit 0
fi

staging_tag="${IMAGE_REPOSITORY}:staging"
docker --config "${DOCKER_CONFIG_DIR}" pull "${staging_tag}"

desired_ref="$(
    docker --config "${DOCKER_CONFIG_DIR}" image inspect \
        --format '{{ index .RepoDigests 0 }}' \
        "${staging_tag}"
)"
validate_image_ref "${desired_ref}"

if [[ -f "${STATE_DIR}/rejected.env" ]] \
    && grep -Fqx "IMAGE_REF=${desired_ref}" "${STATE_DIR}/rejected.env"; then
    echo "직전 검증에서 거부된 digest라 재시도하지 않습니다: ${desired_ref}"
    exit 0
fi

if [[ "$(current_image_ref)" == "${desired_ref}" ]]; then
    exit 0
fi

exec "${SCRIPT_DIR}/deploy.sh" "${desired_ref}"
