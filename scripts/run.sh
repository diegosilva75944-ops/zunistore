#!/usr/bin/env bash
# Detecta DISPLAY (sockets /tmp/.X11-unix) e XAUTHORITY GDM (/run/user/*/gdm), xhost para root, Snap/GTK.
# PM2: pm2 start npm --cwd "$ROOT" -- run start:x11
# Docker: -v /tmp/.X11-unix -e DISPLAY -e XAUTHORITY
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

detect_x11_env() {
  shopt -s nullglob
  if [ -z "${DISPLAY:-}" ]; then
    for sock in /tmp/.X11-unix/X1 /tmp/.X11-unix/X0; do
      if [ -S "$sock" ]; then
        export DISPLAY=":${sock##*/X}"
        break
      fi
    done
  fi
  if [ -z "${DISPLAY:-}" ]; then
    for sock in /tmp/.X11-unix/X*; do
      if [ -S "$sock" ]; then
        export DISPLAY=":${sock##*/X}"
        break
      fi
    done
  fi
  if [ -z "${DISPLAY:-}" ]; then
    export DISPLAY="${DISPLAY:-:1}"
  fi
  if [ -z "${XAUTHORITY:-}" ] || [ ! -r "${XAUTHORITY}" ]; then
    for xa in /run/user/*/gdm/Xauthority; do
      if [ -r "$xa" ]; then
        export XAUTHORITY="$xa"
        break
      fi
    done
  fi
  [ -z "${XAUTHORITY:-}" ] && export XAUTHORITY="/run/user/1000/gdm/Xauthority"
  shopt -u nullglob
}

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
