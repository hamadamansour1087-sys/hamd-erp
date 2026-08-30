#!/bin/bash
# Bootstrap / restore a local PostgreSQL (embedded zonky binaries) + migrate.
#
# PORTABLE: every path comes from the environment or from THIS REPO's location
# (derived from the script path) — no machine-specific absolute paths.
# Defaults write INSIDE the project (.pg-setup/, .pgdata/) so it never touches
# system directories; override via env when your cluster lives elsewhere.
#
# Usage:
#   bash scripts/restore-pg.sh                            # project-local defaults
#   PGDATA=/srv/pgdata bash scripts/restore-pg.sh         # existing cluster dir
#   PG_SETUP_DIR=/opt/pg PGDATA=/srv/pgdata bash scripts/restore-pg.sh
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_SETUP_DIR="${PG_SETUP_DIR:-$PROJECT_ROOT/.pg-setup}"
PGDATA="${PGDATA:-$PROJECT_ROOT/.pgdata}"
PGPORT="${PGPORT:-5432}"

export PATH="$PG_SETUP_DIR/pg-dist/bin:$PATH"

if [ ! -d "$PG_SETUP_DIR/pg-dist/bin" ]; then
  mkdir -p "$PG_SETUP_DIR" && cd "$PG_SETUP_DIR"
  if [ ! -f embedded-postgres-binaries-linux-amd64-16.14.0.jar ]; then
    curl -fsSL -o embedded-postgres-binaries-linux-amd64-16.14.0.jar \
      https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-linux-amd64/16.14.0/embedded-postgres-binaries-linux-amd64-16.14.0.jar
  fi
  # jar is a zip: extract txz inside
  unzip -o -j embedded-postgres-binaries-linux-amd64-16.14.0.jar postgres-linux-x86_64.txz
  mkdir -p pg-dist && tar -xJf postgres-linux-x86_64.txz -C pg-dist
  echo "== binaries ready =="
fi

if [ ! -d "$PGDATA/base" ]; then
  initdb -D "$PGDATA" -U hamd -A trust -E UTF8 --locale=C
fi

pg_ctl -D "$PGDATA" -l "$PGDATA/pg.log" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" start || true
sleep 2
tail -3 "$PGDATA/pg.log"

cd "$PROJECT_ROOT"
node scripts/init-dbs.mjs

export DATABASE_URL="postgresql://hamd@127.0.0.1:$PGPORT/hamd"
./node_modules/.bin/prisma migrate deploy
echo "== migrate deploy OK =="

./node_modules/.bin/prisma generate
DATABASE_URL="file:/dev/null" ./node_modules/.bin/prisma generate --schema prisma/legacy-sqlite/schema.prisma
echo "== clients generated =="

LEGACY_DATABASE_URL="file:$PROJECT_ROOT/db/custom.db" DATABASE_URL="postgresql://hamd@127.0.0.1:$PGPORT/hamd" bun scripts/migrate-sqlite-to-postgres.ts --reset
