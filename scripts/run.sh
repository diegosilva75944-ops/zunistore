#!/usr/bin/env bash
# Next.js + Playwright (GDM/Xorg). Carrega deteção X11 partilhada.
# PM2: pm2 start npm --cwd "$ROOT" -- run start:x11
# Docker: -v /tmp/.X11-unix -e DISPLAY -e XAUTHORITY
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=/dev/null
. "$(cd "$(dirname "$0")" && pwd)/x11-detect.inc.sh"
detect_x11_env

export ML_PLAYWRIGHT_X11_DISPLAY_DEFAULT="${ML_PLAYWRIGHT_X11_DISPLAY_DEFAULT:-${DISPLAY}}"
export ML_PLAYWRIGHT_X11_AUTHORITY_DEFAULT="${ML_PLAYWRIGHT_X11_AUTHORITY_DEFAULT:-${XAUTHORITY}}"
export GIO_USE_PROXY="${GIO_USE_PROXY:-0}"
export GTK_USE_PORTAL="${GTK_USE_PORTAL:-0}"

if command -v xhost >/dev/null 2>&1; then
  xhost "+SI:localuser:root" 2>/dev/null || true
fi

echo "[run.sh] DISPLAY=${DISPLAY:-} XAUTHORITY=${XAUTHORITY:-}"

if [ "$#" -eq 0 ]; then
  exec npm run start
else
  exec "$@"
fi
