#!/usr/bin/env bash
# H.A.M.D — one-shot preview environment restore.
# The sandbox wipes everything outside git between sessions (PG binaries,
# PGDATA, .env, .next). This script rebuilds the whole runtime from the repo.
#
# Usage:  setsid nohup bash scripts/restore-preview.sh > restore.log 2>&1 &
# Idempotent: safe to re-run; skips whatever already exists.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

PG_SETUP=/home/z/pg-setup
PGPKG="$PG_SETUP/node_modules/@embedded-postgres/linux-x64"
PGBIN="$PGPKG/native/bin"
LIBDIR="$PGPKG/native/lib"
export LD_LIBRARY_PATH="$LIBDIR:${LD_LIBRARY_PATH:-}"
PGDATA="$ROOT/.pgdata"
DB_URL="postgresql://hamd@127.0.0.1:5432/hamd"

# Preview credentials — NEVER hardcoded in this (git-tracked) file.
# They live in scripts/.preview-secrets.env (gitignored, umask 077):
#   first run generates random values and saves them there; later runs reuse
#   them so sessions/credentials stay stable until the sandbox wipes the file.
#   Production deployments must set real secrets in .env (see .env.example).
SECRETS_FILE="$ROOT/scripts/.preview-secrets.env"
ADMIN_EMAIL="owner@hamd.app"
if [ -f "$SECRETS_FILE" ]; then
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
fi
if [ -z "${AUTH_SECRET:-}" ] || [ -z "${ADMIN_PASSWORD:-}" ]; then
  AUTH_SECRET="$(bun -e 'console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex"))')"
  ADMIN_PASSWORD="$(bun -e 'const a="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";const r=crypto.getRandomValues(new Uint8Array(12));console.log(Array.from(r,c=>a[c%a.length]).join(""))')"
  umask 077 && printf 'AUTH_SECRET=%s\nADMIN_PASSWORD=%s\n' "$AUTH_SECRET" "$ADMIN_PASSWORD" > "$SECRETS_FILE" && umask 022
  echo "[secrets] generated new preview credentials → $SECRETS_FILE (platform admin password: $ADMIN_PASSWORD)"
fi

echo "[1/7] PostgreSQL 16 portable binaries"
if [ ! -x "$PGBIN/initdb" ]; then
  mkdir -p "$PG_SETUP"
  (cd "$PG_SETUP" && bun add @embedded-postgres/linux-x64@16.14.0-beta.17 >/dev/null 2>&1)
  chmod +x "$PGBIN"/*
fi
# ICU 60 soname links the package ships without
for l in icuuc icui18n icudata; do
  [ -f "$LIBDIR/lib${l}.so.60" ] || ln -sf "lib${l}.so.60.2" "$LIBDIR/lib${l}.so.60"
done
"$PGBIN/postgres" --version

echo "[2/7] Start PostgreSQL"
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  "$PGBIN/initdb" -D "$PGDATA" -U postgres -E UTF8 --locale=C --auth=trust >/dev/null
fi
"$PGBIN/pg_ctl" -D "$PGDATA" -o "-p 5432 -k /tmp -c listen_addresses=127.0.0.1" \
  -l "$PGDATA/server.log" start -w || true

bun -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: '127.0.0.1', port: 5432, user: 'postgres', database: 'postgres' });
  await c.connect();
  const r = await c.query(\"SELECT 1 FROM pg_roles WHERE rolname='hamd'\");
  if (r.rowCount === 0) await c.query('CREATE ROLE hamd LOGIN SUPERUSER');
  const d = await c.query(\"SELECT 1 FROM pg_database WHERE datname='hamd'\");
  if (d.rowCount === 0) await c.query('CREATE DATABASE hamd OWNER hamd');
  await c.end(); console.log('role/db ready');
})().catch(e => { console.error(e.message); process.exit(1); });
"

echo "[3/7] .env + secrets"
printf 'DATABASE_URL=%s\nAUTH_SECRET=%s\n' "$DB_URL" "$AUTH_SECRET" > .env
chmod 600 .env
umask 077 && mkdir -p .pgdata && printf 'AUTH_SECRET=%s\nPLATFORM_ADMIN_EMAIL=%s\nPLATFORM_ADMIN_PASSWORD=%s\n' \
  "$AUTH_SECRET" "$ADMIN_EMAIL" "$ADMIN_PASSWORD" > .pgdata/preview-env.txt && umask 022

echo "[4/7] Schema + platform admin seed"
export DATABASE_URL="$DB_URL"
bunx prisma db push --skip-generate >/dev/null
DATABASE_URL="$DB_URL" PLATFORM_ADMIN_PASSWORD="$ADMIN_PASSWORD" bun scripts/seed-platform.ts

echo "[5/7] Build (next build --webpack)"
if [ ! -f .next/standalone/server.js ]; then
  bunx next build --webpack
  node scripts/build-sw-manifest.mjs
  node scripts/postbuild-local.mjs
fi

echo "[6/7] Launch daemon on :3000"
if ! curl -s -o /dev/null --max-time 3 http://localhost:3000/; then
  DAEMON_SECRET="$AUTH_SECRET" DAEMON_DB="$DB_URL" node scripts/daemon-start.mjs
  sleep 6
fi

echo "[7/7] Verify"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 http://localhost:3000/)
echo "GET / -> HTTP $CODE"
[ "$CODE" = "200" ] || { echo "RESTORE FAILED (HTTP $CODE)"; exit 1; }
echo "RESTORE OK — app live on :3000"
