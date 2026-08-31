#!/usr/bin/env bash
# H.A.M.D — local embedded PostgreSQL 16 (sandbox preview environment)
# Restores the same layout the previous environment had: PGDATA=/home/z/my-project/.pgdata
# Usage:
#   scripts/pg-local.sh start   → initdb (first run) + start + create role/db
#   scripts/pg-local.sh stop    → fast shutdown
#   scripts/pg-local.sh status  → is it running?
set -euo pipefail

NATIVE=/home/z/pg-setup/node_modules/@embedded-postgres/linux-x64/native
PGBIN="$NATIVE/bin"
LIBDIR="$NATIVE/lib"
export LD_LIBRARY_PATH="$LIBDIR:${LD_LIBRARY_PATH:-}"

PGDATA="${PGDATA:-/home/z/my-project/.pgdata}"
PGPORT="${PGPORT:-5432}"
PGSOCK="/tmp"
DB_NAME="hamd"
DB_USER="hamd"

cmd="${1:-status}"

case "$cmd" in
  start)
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
      echo "[pg-local] initialising new cluster at $PGDATA …"
      "$PGBIN/initdb" -D "$PGDATA" -U postgres -E UTF8 --locale=C --auth=trust >/dev/null
    fi
    echo "[pg-local] starting PostgreSQL on port $PGPORT …"
    "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k $PGSOCK -c listen_addresses=127.0.0.1" \
      -l "$PGDATA/server.log" start -w
    # Ensure role + database exist (idempotent) — via bun + pg (psql not bundled)
    "$PGBIN/postgres" --version >/dev/null 2>&1 # sanity: libs load
    (cd /home/z/my-project && bun -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: '127.0.0.1', port: $PGPORT, user: 'postgres', database: 'postgres' });
  await c.connect();
  const r = await c.query(\"SELECT 1 FROM pg_roles WHERE rolname='\''$DB_USER'\''\");
  if (r.rowCount === 0) await c.query(\"CREATE ROLE $DB_USER LOGIN SUPERUSER\");
  const d = await c.query(\"SELECT 1 FROM pg_database WHERE datname='\''$DB_NAME'\''\");
  if (d.rowCount === 0) await c.query(\"CREATE DATABASE $DB_NAME OWNER $DB_USER\");
  await c.end();
  console.log('[pg-local] role/db ready');
})().catch(e => { console.error(e.message); process.exit(1); });
")
    echo "[pg-local] ready: postgresql://$DB_USER@127.0.0.1:$PGPORT/$DB_NAME"
    ;;
  stop)
    "$PGBIN/pg_ctl" -D "$PGDATA" stop -m fast -w || true
    ;;
  status)
    "$PGBIN/pg_ctl" -D "$PGDATA" status || true
    ;;
  *)
    echo "usage: $0 {start|stop|status}"; exit 1
    ;;
esac
