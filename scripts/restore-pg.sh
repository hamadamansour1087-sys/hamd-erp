#!/bin/bash
# Restore PostgreSQL (zonky embedded binaries) after container reset — verified flow
set -e
export PATH=/home/z/pg-setup/pg-dist/bin:$PATH

if [ ! -d /home/z/pg-setup/pg-dist/bin ]; then
  mkdir -p /home/z/pg-setup && cd /home/z/pg-setup
  if [ ! -f embedded-postgres-binaries-linux-amd64-16.14.0.jar ]; then
    curl -fsSL -o embedded-postgres-binaries-linux-amd64-16.14.0.jar \
      https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-linux-amd64/16.14.0/embedded-postgres-binaries-linux-amd64-16.14.0.jar
  fi
  # jar is a zip: extract txz inside
  unzip -o -j embedded-postgres-binaries-linux-amd64-16.14.0.jar postgres-linux-x86_64.txz
  mkdir -p pg-dist && tar -xJf postgres-linux-x86_64.txz -C pg-dist
  echo "== binaries ready =="
fi

if [ ! -d /home/z/pgdata/base ]; then
  initdb -D /home/z/pgdata -U hamd -A trust -E UTF8 --locale=C
fi

pg_ctl -D /home/z/pgdata -l /home/z/pgdata/pg.log -o "-p 5432 -k /tmp -c listen_addresses=127.0.0.1" start || true
sleep 2
tail -3 /home/z/pgdata/pg.log

cd /home/z/my-project
node scripts/init-dbs.mjs

DATABASE_URL="postgresql://hamd@127.0.0.1:5432/hamd" ./node_modules/.bin/prisma migrate deploy
echo "== migrate deploy OK =="

DATABASE_URL="postgresql://hamd@127.0.0.1:5432/hamd" ./node_modules/.bin/prisma generate
DATABASE_URL="file:/dev/null" ./node_modules/.bin/prisma generate --schema prisma/legacy-sqlite/schema.prisma
echo "== clients generated =="

LEGACY_DATABASE_URL="file:/home/z/my-project/db/custom.db" DATABASE_URL="postgresql://hamd@127.0.0.1:5432/hamd" bun scripts/migrate-sqlite-to-postgres.ts --reset
