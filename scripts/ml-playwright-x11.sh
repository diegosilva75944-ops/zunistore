#!/usr/bin/env bash
# Ambiente X11 para Next.js / Node com Playwright (servidor com sessão gráfica ou root a aceder ao display do utilizador).
# Uso: source scripts/ml-playwright-x11.sh   ou   . ./scripts/ml-playwright-x11.sh

set -euo pipefail

export DISPLAY="${DISPLAY:-:1}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

# Permite ao root (ou outro utilizador) ligar ao X local do utilizador dono da sessão (ajuste o nome se necessário).
if command -v xhost >/dev/null 2>&1; then
  xhost "+SI:localuser:root" 2>/dev/null || true
fi

echo "DISPLAY=$DISPLAY"
echo "XAUTHORITY=$XAUTHORITY"
