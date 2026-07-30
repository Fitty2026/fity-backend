#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

if [[ "${1:-}" != "--confirm-fitty-only" ]]; then
    echo "사용법: teardown.sh --confirm-fitty-only" >&2
    exit 2
fi

load_environment
exec 9>"${LOCK_FILE}"
flock --exclusive 9

systemctl --user disable --now fitty-staging-poll.timer fitty-staging-backup.timer \
    >/dev/null 2>&1 || true
compose down --remove-orphans

echo "Fitty 컨테이너만 제거했습니다. DB와 이미지 volume, 백업, 공용 network는 보존했습니다."
