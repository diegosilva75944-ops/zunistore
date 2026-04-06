# Deteção DISPLAY (/tmp/.X11-unix) e XAUTHORITY GDM (/run/user/*/gdm).
# shellcheck shell=bash
# Uso: . "$(dirname "$0")/x11-detect.inc.sh" && detect_x11_env

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
    export DISPLAY=":1"
  fi
  if [ -z "${XAUTHORITY:-}" ] || [ ! -r "${XAUTHORITY}" ]; then
    for xa in /run/user/*/gdm/Xauthority; do
      if [ -r "$xa" ]; then
        export XAUTHORITY="$xa"
        break
      fi
    done
  fi
  if [ -z "${XAUTHORITY:-}" ] || [ ! -r "${XAUTHORITY}" ]; then
    if [ -r "${HOME}/.Xauthority" ]; then
      export XAUTHORITY="${HOME}/.Xauthority"
    else
      export XAUTHORITY="/run/user/1000/gdm/Xauthority"
    fi
  fi
  shopt -u nullglob
}
