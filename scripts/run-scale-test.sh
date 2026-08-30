#!/bin/bash
# H.A.M.D — scale-test orchestrator: 2 production instances + full suite in one session
set -u
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export AUTH_SECRET=load-test-secret-0123456789abcdef
export DATABASE_URL=postgresql://hamd@127.0.0.1:5432/hamd_load
export NODE_ENV=production

PORT=3100 node .next/standalone/server.js > /tmp/inst-3100.log 2>&1 &
PA=$!
PORT=3101 node .next/standalone/server.js > /tmp/inst-3101.log 2>&1 &
PB=$!

cleanup() { kill $PA $PB 2>/dev/null; wait $PA $PB 2>/dev/null; }
trap cleanup EXIT

for i in $(seq 1 30); do
  okA=$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/api/health 2>/dev/null || echo 000)
  okB=$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3101/api/health 2>/dev/null || echo 000)
  [ "$okA" = "200" ] && [ "$okB" = "200" ] && break
  sleep 1
done
echo "[orchestrator] A=$okA B=$okB (after ${i}s)"
[ "$okA" = "200" ] && [ "$okB" = "200" ] || { echo "[orchestrator] instances failed to boot"; exit 1; }

bun scripts/scale-test.ts
RC=$?
echo "[orchestrator] scale-test exit=$RC"
exit $RC
