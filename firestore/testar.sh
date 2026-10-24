#!/usr/bin/env bash
# Baixa o emulador do Firestore (conferindo o hash), liga, roda os testes das regras e desliga.
# Uso: bash firestore/testar.sh   (precisa de Java 17+ e de "npm ci" dentro de firestore/)
set -euo pipefail
cd "$(dirname "$0")"
VERSAO=1.22.0
SHA256=9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c
JAR="${EMULADOR_DIR:-$HOME/.cache/firestore-emulador}/cloud-firestore-emulator-v$VERSAO.jar"

if [[ ! -f "$JAR" ]]; then
  mkdir -p "$(dirname "$JAR")"
  curl -sSfL --proto "=https" --tlsv1.2 -o "$JAR" "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v$VERSAO.jar"
fi
echo "$SHA256  $JAR" | sha256sum -c -

java -jar "$JAR" --host 127.0.0.1 --port 8080 > emulador.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -s -o /dev/null http://127.0.0.1:8080/ && break
  sleep 1
done

FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node --test regras.test.js
