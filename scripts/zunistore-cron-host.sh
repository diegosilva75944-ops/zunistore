#!/bin/bash
# Rodar no host Ubuntu (Coolify) com usuário em grupo `docker`.
# Crontab sugerido: */30 * * * * /home/diego/zunistore-cron.sh
#
# Variáveis opcionais:
#   ZUNI_SITE — default https://www.zunistore.com.br
#   ZUNI_COOLIFY_APPLICATION_ID — default 3 (Coolify → Application ID no painel)

set -euo pipefail

SITE="${ZUNI_SITE:-https://www.zunistore.com.br}"
APP_ID="${ZUNI_COOLIFY_APPLICATION_ID:-3}"
LOG="${ZUNI_CRON_LOG:-${HOME}/zunistore-cron.log}"

ts() { date -Is; }

CID=$(docker ps -qf "label=coolify.applicationId=${APP_ID}" | head -1)
if [[ -z "${CID}" ]]; then
  echo "$(ts) ERRO: container (coolify.applicationId=${APP_ID}) não encontrado." >> "$LOG"
  exit 1
fi

SECRET=$(docker exec "$CID" printenv CRON_SECRET 2>/dev/null || true)
if [[ -z "${SECRET}" ]]; then
  echo "$(ts) ERRO: CRON_SECRET vazio no container (configure no Coolify)." >> "$LOG"
  exit 1
fi

echo "$(ts) sync-prices..." >> "$LOG"
curl -fsS "${SITE%/}/api/cron/sync-prices" -o /dev/null

echo "$(ts) validate-affiliate-links..." >> "$LOG"
code=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer ${SECRET}" \
  "${SITE%/}/api/cron/validate-affiliate-links?limit=15" || echo "000")

if [[ "$code" == "200" ]]; then
  echo "$(ts) validate OK" >> "$LOG"
elif [[ "$code" == "404" ]]; then
  echo "$(ts) AVISO validate HTTP 404 — faça redeploy da app (rota /api/cron/validate-affiliate-links)." >> "$LOG"
else
  echo "$(ts) ERRO validate HTTP ${code}" >> "$LOG"
  exit 1
fi

echo "$(ts) concluído" >> "$LOG"
