#!/usr/bin/env bash
# Confere se o site publicado está no ar, com o conteúdo certo e com os cabeçalhos de segurança.
# Uso: bash tests/site_no_ar.sh https://arquiteto-de-bolso.pages.dev
set -euo pipefail
URL="${1:?informe o endereço}"
headers=$(mktemp); body=$(mktemp)

# Um endereço recém-publicado pode levar alguns segundos para responder.
for tentativa in 1 2 3 4 5 6; do
  code=$(curl -sS -L -o "$body" -D "$headers" -w '%{http_code}' "$URL/" || echo 000)
  [[ "$code" == "200" ]] && break
  echo "Tentativa $tentativa: HTTP $code, esperando..."; sleep 10
done

falhas=0
erro() { echo "::error::$1"; falhas=$((falhas + 1)); }

[[ "$code" == "200" ]] || erro "O site respondeu HTTP $code"
grep -q "Arquiteto de Bolso" "$body" || erro "A página não tem o texto 'Arquiteto de Bolso'"
for h in strict-transport-security x-content-type-options x-frame-options referrer-policy permissions-policy content-security-policy-report-only; do
  grep -qi "^$h:" "$headers" || erro "Falta o cabeçalho $h"
done

if [[ "$falhas" -gt 0 ]]; then exit 1; fi
echo "OK: $URL no ar, com conteúdo e cabeçalhos de segurança."
