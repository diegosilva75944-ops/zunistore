#!/usr/bin/env bash
# Ambiente X11 + execução de scripts/teste.js (sessão persistente, modo gráfico).
#
# Instalação browsers (no diretório do projeto):
#   npm ci && npx playwright install
# Opcional (Playwright global):
#   sudo npm install -g playwright --unsafe-perm && npx playwright install chromium
#
# Servidor típico GDM:
#   DISPLAY=:1
#   XAUTHORITY=/run/user/1000/gdm/Xauthority
#   xhost +SI:localuser:root
#
# Opcional (Playwright global):
#   export NODE_PATH=/usr/lib/node_modules
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=/dev/null
. "$(cd "$(dirname "$0")" && pwd)/x11-detect.inc.sh"
detect_x11_env

# Forçar valores do teu servidor, se necessário:
export DISPLAY="${DISPLAY:-:1}"
export XAUTHORITY="${XAUTHORITY:-/run/user/1000/gdm/Xauthority}"

export GIO_USE_PROXY="${GIO_USE_PROXY:-0}"
export GTK_USE_PORTAL="${GTK_USE_PORTAL:-0}"

if [ -d /usr/lib/node_modules ]; then
  export NODE_PATH="${NODE_PATH:-/usr/lib/node_modules}"
fi

if command -v xhost >/dev/null 2>&1; then
  xhost "+SI:localuser:root" 2>/dev/null || true
fi

echo "[run-playwright-teste] DISPLAY=${DISPLAY} XAUTHORITY=${XAUTHORITY} NODE_PATH=${NODE_PATH:-}"

exec node "${ROOT}/scripts/teste.js" "$@"
