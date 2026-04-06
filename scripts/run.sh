#!/usr/bin/env bash
# Next.js + Playwright (GDM/Xorg). Root: xhost; Snap: GIO/GTK. PM2: pm2 start npm -- run start:x11
# Docker: montar /tmp/.X11-unix e mesmo DISPLAY do host.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DISPLAY="${DISPLAY:-:1}"
export XAUTHORITY="${XAUTHORITY:-/run/user/1000/gdm/Xauthority}"
export ML_PLAYWRIGHT_X11_DISPLAY_DEFAULT="${ML_PLAYWRIGHT_X11_DISPLAY_DEFAULT:-:1}"
export ML_PLAYWRIGHT_X11_AUTHORITY_DEFAULT="${ML_PLAYWRIGHT_X11_AUTHORITY_DEFAULT:-/run/user/1000/gdm/Xauthority}"
export GIO_USE_PROXY="${GIO_USE_PROXY:-0}"
export GTK_USE_PORTAL="${GTK_USE_PORTAL:-0}"

if command -v xhost >/dev/null 2>&1; then
  xhost "+SI:localuser:root" 2>/dev/null || true
fi

if [ "$#" -eq 0 ]; then
  exec npm run start
else
  exec "$@"
fi
