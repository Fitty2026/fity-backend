#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FITTY_ROOT="${FITTY_ROOT:-/home/kth88/services/products/fitty}"
UNIT_SOURCE="${FITTY_ROOT}/deploy/systemd"
UNIT_TARGET="${HOME}/.config/systemd/user"

mkdir -p "${UNIT_TARGET}"
install -m 600 "${UNIT_SOURCE}/fitty-staging-poll.service" "${UNIT_TARGET}/"
install -m 600 "${UNIT_SOURCE}/fitty-staging-poll.timer" "${UNIT_TARGET}/"
install -m 600 "${UNIT_SOURCE}/fitty-staging-backup.service" "${UNIT_TARGET}/"
install -m 600 "${UNIT_SOURCE}/fitty-staging-backup.timer" "${UNIT_TARGET}/"

systemctl --user daemon-reload
systemctl --user enable --now fitty-staging-poll.timer fitty-staging-backup.timer
systemctl --user list-timers --all | grep -E 'fitty-staging-(poll|backup)' || true
