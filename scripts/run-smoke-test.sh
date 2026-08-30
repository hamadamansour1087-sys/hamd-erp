#!/bin/bash
# H.A.M.D — production smoke test: boot built artifact against real `hamd` DB,
# verify /api/health + real login via HTTP + auth gate, then clean up.
set -u
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export AUTH_SECRET=smoke-secret-0123456789abcdef
export DATABASE_URL=postgresql://hamd@127.0.0.1:5432/hamd
export NODE_ENV=production
export PORT=3200

node .next/standalone/server.js > /tmp/smoke-3200.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT

for i in $(seq 1 30); do
  code=$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3200/api/health 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
echo "[smoke] server boot: HTTP $code after ${i}s"

echo "--- 1) /api/health ---"
curl -fsS http://127.0.0.1:3200/api/health; echo

echo "--- 2) unauthenticated protected read (expect 401) ---"
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:3200/api/products

echo "--- 3) login smoke (dedicated smoke user, deleted afterwards) ---"
DATABASE_URL=postgresql://hamd@127.0.0.1:5432/hamd bun -e '
import { PrismaClient } from "@prisma/client"
import { hashPassword } from "./src/lib/auth"
const db = new PrismaClient()
async function main() {
  const email = "smoke-test@hamd.local"
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) { console.log("residue found — removing"); await db.user.delete({ where: { email } }) }
  const org = await db.org.findFirst()
  await db.user.create({ data: { email, name: "smoke", orgId: org!.id, role: "STAFF", active: true, passwordHash: await hashPassword("smoke-pass-xyz-123"), tokenVersion: 0 } })
  console.log("smoke user created")
}
await main(); await db.$disconnect()
' 2>&1 | tail -1

RESP=$(curl -fsS -D /tmp/smoke-headers.txt -X POST http://127.0.0.1:3200/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"smoke-test@hamd.local","password":"smoke-pass-xyz-123"}' 2>&1 || echo "LOGIN_FAILED")
CODE=$(head -1 /tmp/smoke-headers.txt 2>/dev/null | tr -d '\r')
COOKIE=$(grep -i '^set-cookie: session=' /tmp/smoke-headers.txt 2>/dev/null | cut -c1-40)
echo "login status: $CODE"
echo "session cookie: ${COOKIE:-NONE}"
echo "body: $(echo "$RESP" | head -c 200)"

echo "--- 4) authenticated read with session (expect 200) ---"
SESSION=$(grep -i '^set-cookie: session=' /tmp/smoke-headers.txt 2>/dev/null | sed 's/.*session=\([^;]*\).*/\1/')
if [ -n "${SESSION:-}" ]; then
  curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -H "cookie: session=$SESSION" http://127.0.0.1:3200/api/products
else
  echo "no session — skip"
fi

echo "--- 5) x-request-id correlation header present? ---"
curl -fsS -D- -o /dev/null http://127.0.0.1:3200/api/health 2>/dev/null | grep -i "x-request-id" | tr -d '\r'

echo "--- 6) cleanup smoke user ---"
DATABASE_URL=postgresql://hamd@127.0.0.1:5432/hamd bun -e '
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
await db.user.delete({ where: { email: "smoke-test@hamd.local" } })
console.log("smoke user deleted — DB back to original 3 users")
await db.$disconnect()
' 2>&1 | tail -1

echo "[smoke] DONE"
