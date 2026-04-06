#!/usr/bin/env bash
# Ambiente X11 para Node/Playwright. Uso: source scripts/ml-playwright-x11.sh
# shellcheck source=/dev/null
_ML_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${_ML_ROOT}/x11-detect.inc.sh"
detect_x11_env

export GIO_USE_PROXY="${GIO_USE_PROXY:-0}"
export GTK_USE_PORTAL="${GTK_USE_PORTAL:-0}"

if command -v xhost >/dev/null 2>&1; then
  xhost "+SI:localuser:root" 2>/dev/null || true
fi

echo "DISPLAY=$DISPLAY"
echo "XAUTHORITY=$XAUTHORITY"
