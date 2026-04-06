#!/usr/bin/env bash
# Next.js com DISPLAY/XAUTHORITY para Playwright (root, PM2, API).
# PM2: pm2 start npm --name zuni --cwd "$(pwd)" -- run start:x11
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DISPLAY="${DISPLAY:-:1}"
export XAUTHORITY="${XAUTHORITY:-/run/user/1000/gdm/Xauthority}"

if command -v xhost >/dev/null 2>&1; then
  xhost "+SI:localuser:root" 2>/dev/null || true
fi

if [ "$#" -eq 0 ]; then
  exec npm run start
else
  exec "$@"
fi
