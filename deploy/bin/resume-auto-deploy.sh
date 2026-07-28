#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

if [[ "${1:-}" != "--confirm" ]]; then
    echo "사용법: resume-auto-deploy.sh --confirm" >&2
    exit 2
fi

exec 9>"${LOCK_FILE}"
flock --exclusive 9
rm -f -- "${STATE_DIR}/hold.env" "${STATE_DIR}/rejected.env"
echo "자동 배포 hold와 rejected digest 기록을 해제했습니다."
